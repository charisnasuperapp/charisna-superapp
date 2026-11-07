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
  const inFlightRefreshes = new Map();
  const refreshCache = new Map();
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
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  const PKCE = '__Host-charisna-pkce';
  async function sendLink() {
    if (!configured) return unavailable();
    try {
      const verifier = randomBytes(32).toString('base64url');
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const redirect = encodeURIComponent(`${env.SITE_ORIGIN}/auth/callback`);
      const response = await provider(`otp?redirect_to=${redirect}`, { email: env.OWNER_EMAIL, create_user: true, code_challenge: challenge, code_challenge_method: 's256' });
      if (!response.ok) { await response.body?.cancel(); return unavailable(); }
      await readJson(response);
      const expires = now() + 3_600_000;
      return { status: 200, body: { ok: true }, cookie: `${PKCE}=${seal({ kind: 'pkce', verifier, expires })}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600` };
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
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) {
      await response.body?.cancel();
      return [401, 403].includes(response.status) ? { status: 401, body: { error: 'Authentication required' }, cookie: clearCookie() } : unavailable();
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
  function readPkce(request) {
    const raw = request?.headers?.cookie;
    if (typeof raw !== 'string' || raw.length > 8192) throw new Error('invalid cookie');
    const matches = raw.split(';').map(part => part.trim()).filter(part => part.startsWith(`${PKCE}=`));
    if (matches.length !== 1) throw new Error('ambiguous cookie');
    const value = matches[0].slice(PKCE.length + 1);
    if (value.length < 40 || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value)
      || Buffer.from(value, 'base64url').toString('base64url') !== value) throw new Error('invalid cookie');
    const data = open(value);
    if (!data || data.kind !== 'pkce' || typeof data.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(data.verifier)
      || !Number.isSafeInteger(data.expires) || data.expires <= now()) throw new Error('invalid pkce');
    return data;
  }
  const local = result => Object.defineProperty(result, 'local', { value: true });
  async function exchangeCode(request, code) {
    if (!configured) return unavailable();
    if (typeof code !== 'string' || !/^[A-Za-z0-9._-]{8,200}$/.test(code)) return local({ status: 400, body: { error: 'Invalid code' } });
    let pkce;
    try { pkce = readPkce(request); } catch { return local({ status: 401, body: { error: 'Authentication required' } }); }
    try {
      const response = await provider('token?grant_type=pkce', { auth_code: code, code_verifier: pkce.verifier });
      if (!response.ok) {
        await response.body?.cancel();
        return [400, 401, 403, 422].includes(response.status) ? { status: 401, body: { error: 'Authentication required' } } : unavailable();
      }
      return await startSession(await readJson(response));
    } catch { return unavailable(); }
  }
  async function signInPassword(password) {
    if (!configured) return unavailable();
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) return local({ status: 401, body: { error: 'Authentication required' } });
    try {
      const response = await provider('token?grant_type=password', { email: env.OWNER_EMAIL, password });
      if (!response.ok) {
        await response.body?.cancel();
        return [400, 401, 403, 422].includes(response.status) ? { status: 401, body: { error: 'Authentication required' } } : unavailable();
      }
      return await startSession(await readJson(response));
    } catch { return unavailable(); }
  }
  // Session cookie: sealed access + refresh token. The window slides on every refresh and lapses after 30 idle days.
  const REUSE_MS = 5000;
  const SESSION_MS = 30 * 86_400_000;
  async function performRefresh(refreshToken) {
    const cached = refreshCache.get(refreshToken);
    if (cached && cached.expiresAt > now()) return cached.result;
    if (inFlightRefreshes.has(refreshToken)) return inFlightRefreshes.get(refreshToken);
    const flight = (async () => {
      const response = await provider('token?grant_type=refresh_token', { refresh_token: refreshToken });
      if (!response.ok) {
        await response.body?.cancel();
        return [400, 401, 403, 422].includes(response.status) ? { status: 401, body: { error: 'Authentication required' } } : unavailable();
      }
      const tokens = await readJson(response);
      let renewed;
      try {
        renewed = newSession(tokens.access_token, tokens.refresh_token);
      } catch {
        return { status: 401, body: { error: 'Authentication required' } };
      }
      if (!renewed.refreshToken || renewed.accessExpires <= now()) return { status: 401, body: { error: 'Authentication required' } };
      const user = await getUser(renewed.accessToken);
      if (user.status !== 200) return user;
      return { status: 200, user: user.user, renewed };
    })().finally(() => {
      inFlightRefreshes.delete(refreshToken);
    });
    inFlightRefreshes.set(refreshToken, flight);
    const result = await flight;
    if (result.status === 200) {
      refreshCache.set(refreshToken, { result, expiresAt: now() + REUSE_MS });
      if (refreshCache.size > 100) {
        for (const [k, v] of refreshCache) {
          if (v.expiresAt <= now()) refreshCache.delete(k);
        }
      }
    }
    return result;
  }
  function cookieFor(session) {
    const value = seal(session);
    const name = '__Host-charisna';
    if (Buffer.byteLength(`${name}=${value}`) > 4000) throw new Error('cookie oversized');
    return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(0, Math.floor((session.expires - now()) / 1000))}`;
  }
  function newSession(accessToken, refreshToken) {
    const accessExpires = tokenExpiry(accessToken);
    const hasRefresh = typeof refreshToken === 'string' && /^[\x21-\x7e]{1,512}$/.test(refreshToken);
    const expires = hasRefresh ? now() + SESSION_MS : accessExpires;
    return { kind: 'session', accessToken, refreshToken: hasRefresh ? refreshToken : '', accessExpires, expires };
  }
  async function startSession(tokens) {
    let session;
    try {
      session = newSession(tokens.access_token, tokens.refresh_token);
    } catch {
      return { status: 401, body: { error: 'Authentication required' } };
    }
    if (session.accessExpires <= now() || session.expires <= now()) return { status: 401, body: { error: 'Authentication required' } };
    const user = await getUser(session.accessToken);
    if (user.status !== 200) return user;
    try {
      return { status: 200, body: { ok: true }, user: user.user, cookie: cookieFor(session) };
    } catch {
      return { status: 401, body: { error: 'Authentication required' } };
    }
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
    if (!session || session.kind !== 'session' || !Number.isSafeInteger(session.expires) || session.expires <= now()
      || session.expires > now() + SESSION_MS || !Number.isSafeInteger(session.accessExpires)
      || typeof session.refreshToken !== 'string') throw new Error('expired session');
    tokenExpiry(session.accessToken);
    return session;
  }
  // Resolve the owner; silently renew an access token that is expired or about to expire.
  async function resolve(request) {
    let session;
    try { session = readSession(request); }
    catch { return { status: 401, body: { error: 'Authentication required' } }; }
    try {
      if (session.accessExpires - 60_000 > now()) {
        const user = await getUser(session.accessToken);
        return user.status === 200 ? { ...user, session } : user;
      }
      if (!session.refreshToken) return { status: 401, body: { error: 'Authentication required' } };
      const refreshed = await performRefresh(session.refreshToken);
      if (refreshed.status !== 200) return refreshed;
      const renewed = { ...refreshed.renewed, deviceLock: session.deviceLock === true, unlockUntil: session.unlockUntil ?? 0 };
      try {
        return { status: 200, user: refreshed.user, session: renewed, cookie: cookieFor(renewed) };
      } catch {
        return { status: 401, body: { error: 'Authentication required' } };
      }
    } catch { return unavailable(); }
  }
  const locked = session => session.deviceLock === true && (!Number.isSafeInteger(session.unlockUntil) || session.unlockUntil <= now());
  const lockError = cookie => ({ status: 423, body: { error: 'Perangkat terkunci. Buka dengan PIN atau biometrik perangkat.' }, ...(cookie ? { cookie } : {}) });
  async function authorizeIdentity(request) {
    if (!configured) return unavailable();
    const { session, ...result } = await resolve(request);
    return result;
  }
  async function authorize(request) {
    if (!configured) return unavailable();
    const { session, ...result } = await resolve(request);
    return result.status === 200 && locked(session) ? lockError(result.cookie) : result;
  }
  // Only handler paths with a verified WebAuthn ceremony may call unlockDevice.
  async function changeDeviceLock(request, mode) {
    if (!configured) return unavailable();
    const { session, ...result } = await resolve(request);
    if (result.status !== 200) return result;
    if (mode !== 'unlock' && locked(session)) return lockError(result.cookie);
    const next = { ...session, deviceLock: mode !== 'disable', unlockUntil: mode === 'disable' ? 0 : now() + 900_000 };
    return { status: 200, body: { ok: true }, cookie: cookieFor(next) };
  }
  const enableDeviceLock = request => changeDeviceLock(request, 'enable');
  const unlockDevice = request => changeDeviceLock(request, 'unlock');
  const disableDeviceLock = request => changeDeviceLock(request, 'disable');
  async function setPassword(request, password) {
    if (!configured) return unavailable();
    const owner = await resolve(request);
    if (owner.status !== 200) { const { session, ...rest } = owner; return rest; }
    if (locked(owner.session)) return lockError(owner.cookie);
    const keep = owner.cookie ? { cookie: owner.cookie } : {};
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return { status: 400, body: { error: 'Sandi harus 8 sampai 128 karakter.' }, ...keep };
    try {
      const response = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, {
        method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(5000),
        headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${owner.session.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      await response.body?.cancel();
      if (response.ok) return { status: 200, body: { ok: true }, ...keep };
      return [400, 422].includes(response.status) ? { status: 400, body: { error: 'Sandi ditolak. Pilih sandi yang lebih kuat.' }, ...keep } : { ...unavailable(), ...keep };
    } catch { return { ...unavailable(), ...keep }; }
  }
  const clearCookie = () => '__Host-charisna=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  async function logout(request) {
    let revoked = false;
    if (configured) {
      try {
        const session = readSession(request);
        let accessToken = session.accessToken;
        if (session.accessExpires <= now() && session.refreshToken) {
          const refreshed = await performRefresh(session.refreshToken);
          if (refreshed.status === 200) {
            accessToken = refreshed.renewed.accessToken;
          } else {
            accessToken = null;
          }
        }
        if (accessToken) {
          const response = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/logout?scope=global`, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(5000),
            headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
          });
          revoked = response.ok;
          await response.body?.cancel();
        }
      } catch { /* Local logout must succeed even if upstream is unavailable. */ }
    }
    return { status: 200, body: { ok: true, revoked }, cookie: clearCookie() };
  }
  const clearPkceCookie = () => `${PKCE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  return { configured, sendLink, exchangeCode, signInPassword, setPassword, authorize, authorizeIdentity, enableDeviceLock, unlockDevice, disableDeviceLock, clearCookie, clearPkceCookie, logout };
}
