import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OWNER = 'charisna.superapp@gmail.com';
function validOrigin(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.origin === value && !u.username && !u.password; } catch { return false; }
}
function publicKey(value) {
  if (typeof value !== 'string' || value.length > 4096) return false;
  if (/^sb_publishable_[A-Za-z0-9_-]{4,}$/.test(value)) return true;
  try { return value.split('.').length === 3 && JSON.parse(Buffer.from(value.split('.')[1], 'base64url')).role === 'anon'; } catch { return false; }
}
function validConfig(e) {
  return validOrigin(e.SITE_ORIGIN) && validOrigin(e.SUPABASE_URL)
    && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(e.SUPABASE_URL)
    && publicKey(e.SUPABASE_PUBLISHABLE_KEY) && e.OWNER_EMAIL === OWNER
    && typeof e.SESSION_SECRET === 'string' && Buffer.byteLength(e.SESSION_SECRET) >= 32
    && Buffer.byteLength(e.SESSION_SECRET) <= 1024 && new Set(e.SESSION_SECRET).size >= 8
    && (e.OWNER_USER_ID === undefined || UUID.test(e.OWNER_USER_ID));
}
const unavailable = () => ({ status: 503, body: { error: 'Authentication unavailable' } });
export function createOwnerAuth({ env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  env = { ...env };
  const configured = validConfig(env);
  async function readJson(response) {
    if (Number(response.headers.get('content-length')) > 65536) {
      await response.body?.cancel();
      throw new Error('response too large');
    }
    const reader = response.body?.getReader();
    const chunks = [];
    let length = 0;
    if (!reader) throw new Error('missing body');
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 65536) throw new Error('response too large');
        chunks.push(Buffer.from(value));
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid response');
    return value;
  }
  function tokenExpiry(value) {
    if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) throw new Error('invalid token');
    const parts = value.split('.');
    for (const part of parts) {
      if (Buffer.from(part, 'base64url').toString('base64url') !== part) throw new Error('invalid encoding');
    }
    const [header, payload] = parts.slice(0, 2).map(part => {
      const bytes = Buffer.from(part, 'base64url');
      if (bytes.toString('base64url') !== part) throw new Error('invalid encoding');
      return JSON.parse(bytes.toString('utf8'));
    });
    if (!header || typeof header !== 'object' || Array.isArray(header) || !payload
      || !Number.isSafeInteger(payload.exp) || !Number.isSafeInteger(payload.exp * 1000)) throw new Error('invalid expiry');
    return payload.exp * 1000;
  }
  async function provider(path, body) {
    return fetchImpl(`${env.SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  async function sendCode() {
    if (!configured) return unavailable();
    try {
      const response = await provider('otp', { email: env.OWNER_EMAIL, create_user: true });
      if (!response.ok) { await response.body?.cancel(); return unavailable(); }
      await readJson(response);
      return { status: 200, body: { ok: true } };
    } catch { return unavailable(); }
  }
  const key = configured ? createHash('sha256').update(env.SESSION_SECRET).digest() : null;
  const aad = Buffer.from(configured ? env.SITE_ORIGIN : '');
  function seal(session) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(session), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }
  function open(value) {
    const bytes = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAAD(aad);
    cipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
  }
  async function getUser(accessToken) {
    const response = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      await response.body?.cancel();
      return response.status === 401 ? { status: 401, body: { error: 'Authentication required' } } : unavailable();
    }
    const user = await readJson(response);
    if (typeof user.id !== 'string' || typeof user.email !== 'string') return unavailable();
    if (user.email.trim().toLowerCase() !== OWNER
      || typeof user.email_confirmed_at !== 'string' || !Number.isFinite(Date.parse(user.email_confirmed_at))
      || !UUID.test(user.id) || (env.OWNER_USER_ID && user.id !== env.OWNER_USER_ID)) {
      return { status: 403, body: { error: 'Access denied' } };
    }
    return { status: 200, user: { id: user.id, email: user.email.trim().toLowerCase() } };
  }
  async function verifyCode(code) {
    if (!configured) return unavailable();
    if (typeof code !== 'string' || code.length < 6 || code.length > 10 || /[^0-9]/.test(code)) return { status: 400, body: { error: 'Invalid code' } };
    try {
      const response = await provider('verify', { type: 'email', token: code, email: env.OWNER_EMAIL });
      if (!response.ok) {
        await response.body?.cancel();
        return [400, 401, 403, 422].includes(response.status) ? { status: 401, body: { error: 'Authentication required' } } : unavailable();
      }
      const { access_token: accessToken } = await readJson(response);
      const expires = Math.min(now() + 900_000, tokenExpiry(accessToken));
      if (expires <= now()) return { status: 401, body: { error: 'Authentication required' } };
      const user = await getUser(accessToken);
      if (user.status !== 200) return user;
      return { status: 200, body: { ok: true }, cookie: `__Host-charisna=${seal({ accessToken, expires })}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((expires - now()) / 1000))}` };
    } catch { return unavailable(); }
  }
  function readSession(request) {
    const raw = request?.headers?.cookie;
    if (typeof raw !== 'string' || raw.length > 8192) throw new Error('invalid cookie');
    const matches = raw.split(';').map(part => part.trim()).filter(part => part.startsWith('__Host-charisna='));
    if (matches.length !== 1) throw new Error('ambiguous cookie');
    const value = matches[0].slice('__Host-charisna='.length);
    if (value.length < 40 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)
      || Buffer.from(value, 'base64url').toString('base64url') !== value) throw new Error('invalid cookie');
    const session = open(value);
    if (!session || !Number.isSafeInteger(session.expires) || session.expires <= now()
      || session.expires > now() + 900_000 || tokenExpiry(session.accessToken) <= now()) throw new Error('expired session');
    return session;
  }
  async function authorize(request) {
    if (!configured) return unavailable();
    let session;
    try { session = readSession(request); }
    catch { return { status: 401, body: { error: 'Authentication required' } }; }
    try { return await getUser(session.accessToken); } catch { return unavailable(); }
  }
  const clearCookie = () => '__Host-charisna=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  async function logout(request) {
    if (configured) {
      try {
        const session = readSession(request);
        const response = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/logout?scope=global`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
          headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}` }
        });
        await response.body?.cancel();
      } catch { /* Local logout must succeed even if upstream is unavailable. */ }
    }
    return { status: 200, body: { ok: true }, cookie: clearCookie() };
  }
  return { configured, sendCode, verifyCode, authorize, clearCookie, logout };
}
