import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const CACHE_MS = 60 * 60 * 1000;
const SIGNAL_COOLDOWN_MS = 10 * 1000;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const TOKEN = /^[A-Za-z0-9._~-]{20,4096}$/;
const UID = /^[A-Za-z0-9_-]{6,128}$/;
const UNAVAILABLE = { state: 'source_error', message: 'Sumber sementara tidak tersedia.' };

function decode(value) {
  if (!value || typeof value !== 'object') throw Error('bad field');
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, decode(field)]));
  throw Error('bad field type');
}
function fields(document) {
  if (!document || typeof document.fields !== 'object') throw Error('bad document');
  return Object.fromEntries(Object.entries(document.fields).map(([key, field]) => [key, decode(field)]));
}
export function summarizeTeachingMonth(month, key) {
  if (!MONTH.test(key) || month?.monthKey !== key || !Number.isFinite(month.hourlyRate) || month.hourlyRate < 0
      || !month.entries || typeof month.entries !== 'object') throw Error('bad month');
  let hours = 0;
  let days = 0;
  for (const [day, entry] of Object.entries(month.entries)) {
    if (!/^(?:[1-9]|[12][0-9]|3[01])$/.test(day) || !entry || !Number.isFinite(entry.hours)
        || entry.hours < 0 || entry.hours > 24) throw Error('bad entry');
    const normalized = Math.round(entry.hours * 100) / 100;
    hours += normalized;
    if (normalized > 0) days++;
  }
  hours = Math.round(hours * 100) / 100;
  const cents = Math.round(hours * month.hourlyRate * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw Error('unsafe pay');
  return { month: key, hours, teaching_days: days, pay_minor: String(cents), currency: 'USD', scale: 2 };
}
export function summarizeTeachingYears(months) {
  const years = new Map();
  for (const month of months) {
    const year = month.month.slice(0, 4);
    const current = years.get(year) || { year, hours: 0, teaching_days: 0, pay_minor: '0', currency: 'USD', scale: 2 };
    current.hours = Math.round((current.hours + month.hours) * 100) / 100;
    current.teaching_days += month.teaching_days;
    current.pay_minor = String(BigInt(current.pay_minor) + BigInt(month.pay_minor));
    years.set(year, current);
  }
  return [...years.values()].sort((a, b) => b.year.localeCompare(a.year));
}
async function readJson(response, max = 300000) {
  const raw = await response.text();
  if (raw.length > max) throw Error('large response');
  return JSON.parse(raw);
}

export function createTeachingConnector({ env, fetchImpl = fetch, now = () => Date.now() }) {
  const configured = Boolean(env?.TEACHING_STATE?.prepare && typeof env?.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32
    && typeof env.SITE_ORIGIN === 'string' && env.SITE_ORIGIN.startsWith('https://')
    && /^[A-Za-z0-9_-]{4,100}$/.test(env.TEACHING_FIREBASE_PROJECT_ID)
    && /^[A-Za-z0-9_-]{20,200}$/.test(env.TEACHING_FIREBASE_API_KEY));
  const key = configured ? createHash('sha256').update('charisna-teaching-v1\0').update(env.SESSION_SECRET).digest() : null;
  const aad = Buffer.from(configured ? `${env.SITE_ORIGIN}|${env.TEACHING_FIREBASE_PROJECT_ID}` : '');
  function seal(data) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  function open(value) {
    if (typeof value !== 'string' || value.length > 100000 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error('bad state');
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29 || bytes.toString('base64url') !== value) throw Error('bad state');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(aad);
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  }
  // read() returns the decrypted state plus the exact ciphertext it came from, used as the compare-and-swap version.
  async function read() {
    const row = await env.TEACHING_STATE.prepare('SELECT payload FROM connector_state WHERE id = ?').bind('owner').first();
    return row ? { data: open(row.payload), version: row.payload } : null;
  }
  // Owner-initiated connect replaces whatever is stored (new login wins).
  async function write(data) {
    await env.TEACHING_STATE.prepare('INSERT INTO connector_state (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind('owner', seal(data)).run();
  }
  // Background writers may only update the exact state they read. After disconnect/reconnect the
  // row is gone or different, zero rows change, and the stale writer cannot bring a token back.
  async function swap(version, data) {
    const result = await env.TEACHING_STATE.prepare('UPDATE connector_state SET payload = ? WHERE id = ? AND payload = ?').bind(seal(data), 'owner', version).run();
    return result?.meta?.changes === 1;
  }
  async function request(url, options = {}) {
    return fetchImpl(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  }
  async function sourceDocument(uid, idToken, path) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.TEACHING_FIREBASE_PROJECT_ID)}/databases/(default)/documents/users/${encodeURIComponent(uid)}/${path}`;
    const response = await request(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw Error('read failed');
    return fields(await readJson(response));
  }
  async function connect(input) {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    if (!TOKEN.test(input?.idToken) || !TOKEN.test(input?.refreshToken)) return { status: 400, body: { error: 'Koneksi tidak valid.' } };
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.TEACHING_FIREBASE_API_KEY)}`;
      const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: input.idToken }) });
      if (!response.ok) return { status: 401, body: { error: 'Masuk MySalary kembali.' } };
      const users = (await readJson(response, 20000)).users;
      if (!Array.isArray(users) || users.length !== 1 || !UID.test(users[0].localId) || users[0].disabled) throw Error('bad user');
      const uid = users[0].localId;
      await sourceDocument(uid, input.idToken, 'salaryAudit/database');
      await write({ uid, refreshToken: input.refreshToken, snapshot: null, syncedAt: 0 });
      return { status: 200, body: { connected: true } };
    } catch { return { status: 503, body: UNAVAILABLE }; }
  }
  async function sync(state) {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    if (!state) return { status: 200, body: { state: 'not_connected', source: 'MySalary / Teaching Pay Audit' } };
    const { data, version } = state;
    if (!UID.test(data.uid) || !TOKEN.test(data.refreshToken)) return { status: 503, body: UNAVAILABLE };
    try {
      const url = `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(env.TEACHING_FIREBASE_API_KEY)}`;
      const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: data.refreshToken }) });
      if (!response.ok) throw Error('refresh failed');
      const token = await readJson(response, 20000);
      if (token.user_id !== data.uid || !TOKEN.test(token.id_token)) throw Error('identity changed');
      const manifest = await sourceDocument(data.uid, token.id_token, 'salaryAudit/database');
      const keys = manifest?.monthKeys;
      if (manifest && (!Array.isArray(keys) || keys.length > 600 || keys.some(k => typeof k !== 'string' || !MONTH.test(k)))) throw Error('bad manifest');
      const distinct = [...new Set(keys || [])].sort();
      const years = [...new Set(distinct.map(key => key.slice(0, 4)))].slice(-2);
      const selected = distinct.filter(key => years.includes(key.slice(0, 4)));
      const months = await Promise.all(selected.map(async monthKey => {
        const month = await sourceDocument(data.uid, token.id_token, `salaryAuditMonths/${monthKey}`);
        if (!month) throw Error('missing month');
        return summarizeTeachingMonth(month, monthKey);
      }));
      const snapshot = { state: 'connected', source: 'MySalary / Teaching Pay Audit', metric: 'teaching_pay',
        currency: 'USD', scale: 2, months, years: summarizeTeachingYears(months), quality_status: manifest ? 'verified_source_read' : 'no_records',
        source_updated_at: typeof manifest?.updatedAt === 'string' ? manifest.updatedAt : null,
        synced_at: new Date(now()).toISOString() };
      const rotated = TOKEN.test(token.refresh_token) ? token.refresh_token : data.refreshToken;
      if (!await swap(version, { uid: data.uid, refreshToken: rotated, snapshot, syncedAt: now() })) return { status: 409, body: UNAVAILABLE };
      return { status: 200, body: snapshot };
    } catch { return { status: 503, body: UNAVAILABLE }; }
  }
  // Fast trigger from MySalary after a successful cloud save. The caller proves identity with a Firebase ID token only;
  // no salary data is accepted. The Worker re-reads Firestore itself, so a forged signal can at most cause one extra pull.
  async function signal(idToken) {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    if (!TOKEN.test(idToken)) return { status: 400, body: { error: 'Sinyal tidak valid.' } };
    let state;
    try { state = await read(); } catch { return { status: 503, body: UNAVAILABLE }; }
    // Not connected: refuse before any provider call, so the endpoint cannot be used to probe tokens.
    if (!state) return { status: 403, body: { error: 'Akun tidak cocok.' } };
    try {
      const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.TEACHING_FIREBASE_API_KEY)}`;
      const response = await request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
      if (!response.ok) return { status: 401, body: { error: 'Token tidak valid.' } };
      const users = (await readJson(response, 20000)).users;
      if (!Array.isArray(users) || users.length !== 1 || users[0].disabled || users[0].localId !== state.data.uid) return { status: 403, body: { error: 'Akun tidak cocok.' } };
      // Persisted cooldown (syncedAt lives in D1) coalesces bursts across isolates.
      if (Number.isSafeInteger(state.data.syncedAt) && now() - state.data.syncedAt < SIGNAL_COOLDOWN_MS) return { status: 202, body: { accepted: true } };
      const result = await sync(state);
      return result.status === 200 || result.status === 409 ? { status: 200, body: { accepted: true } } : { status: 503, body: UNAVAILABLE };
    } catch { return { status: 503, body: UNAVAILABLE }; }
  }
  async function overview() {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    let state;
    try { state = await read(); }
    catch { return { status: 503, body: UNAVAILABLE }; }
    if (!state) return { status: 200, body: { state: 'not_connected', source: 'MySalary / Teaching Pay Audit' } };
    const { data } = state;
    if (data.snapshot && Number.isSafeInteger(data.syncedAt) && now() - data.syncedAt < CACHE_MS)
      return { status: 200, body: data.snapshot };
    const result = await sync(state);
    if (result.status === 200) return result;
    if (result.status === 409) {
      // Another writer changed or removed the state first: report what is stored now, never the stale copy.
      try {
        const current = await read();
        if (!current) return { status: 200, body: { state: 'not_connected', source: 'MySalary / Teaching Pay Audit' } };
        return current.data.snapshot ? { status: 200, body: current.data.snapshot } : { status: 503, body: UNAVAILABLE };
      } catch { return { status: 503, body: UNAVAILABLE }; }
    }
    return data.snapshot ? { status: 200, body: { ...data.snapshot, state: 'stale', quality_status: 'SOURCE_UNAVAILABLE' } } : result;
  }
  async function scheduledSync() {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    try { return await sync(await read()); } catch { return { status: 503, body: UNAVAILABLE }; }
  }
  async function disconnect() {
    if (!configured) return { status: 503, body: UNAVAILABLE };
    try { await env.TEACHING_STATE.prepare('DELETE FROM connector_state WHERE id = ?').bind('owner').run();
      return { status: 200, body: { connected: false } }; }
    catch { return { status: 503, body: UNAVAILABLE }; }
  }
  return { configured, config: () => configured ? { apiKey: env.TEACHING_FIREBASE_API_KEY, projectId: env.TEACHING_FIREBASE_PROJECT_ID } : null,
    connect, overview, disconnect, scheduledSync, signal };
}
