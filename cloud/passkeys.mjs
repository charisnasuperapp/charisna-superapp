import {createCipheriv, createDecipheriv, createHash, randomBytes} from 'node:crypto';
import {generateRegistrationOptions, generateAuthenticationOptions, verifyRegistrationResponse, verifyAuthenticationResponse} from '@simplewebauthn/server';

import {decodeClientDataJSON} from '@simplewebauthn/server/helpers';

const COOKIE = '__Host-charisna-passkey';
const OWNER = 'charisna.superapp@gmail.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * WebAuthn is a second-factor device unlock, never a replacement for Supabase identity.
 * Pass only a server-verified owner {id, email}; never accept this object from request JSON.
 * The handler must require an unlocked session for registrationOptions, verifyRegistration,
 * status and revoke. authenticationOptions and verifyAuthentication accept a locked but
 * identity-authenticated session. It must also enforce same-origin POSTs, body limits and
 * throttling; options methods cannot inspect request headers themselves.
 *
 * Methods return {status, body, cookie?}; successful verification additionally returns
 * internal user:{id,email}. Send only body to the browser, append cookie as Set-Cookie,
 * and update the existing durable session lock only after successful verification.
 * Options bodies are standard PublicKeyCredential*OptionsJSON, verification accepts
 * standard Registration/AuthenticationResponseJSON plus plain request headers.
 * No passwords, biometrics, Supabase tokens or private keys are stored here.
 * Platform attachment is a client-reported property, not hardware attestation;
 * platform passkeys may sync across devices. UV requires device PIN/biometric checks.
 */
export function createOwnerPasskeys({env = {}, db = env.TEACHING_STATE, now = () => Date.now()} = {}) {
  env = {...env};
  let configured = false;
  try {
    const origin = new URL(env.SITE_ORIGIN);
    configured = origin.protocol === 'https:' && origin.origin === env.SITE_ORIGIN && !origin.username && !origin.password
      && typeof env.SESSION_SECRET === 'string' && Buffer.byteLength(env.SESSION_SECRET) >= 32
      && Buffer.byteLength(env.SESSION_SECRET) <= 1024 && new Set(env.SESSION_SECRET).size >= 8
      && (!env.OWNER_USER_ID || UUID.test(env.OWNER_USER_ID))
      && (!env.OWNER_EMAIL || env.OWNER_EMAIL === OWNER);
  } catch {}
  const unavailable = () => ({status: 503, body: {error: 'Passkeys unavailable'}});
  function authorize(user) {
    if (!user) return {status: 401, body: {error: 'Authentication required'}};
    if (!UUID.test(user.id) || user.email !== OWNER || (UUID.test(env.OWNER_USER_ID) && user.id !== env.OWNER_USER_ID)) {
      return {status: 403, body: {error: 'Owner required'}};
    }
    return null;
  }
  let initialized;
  async function initialize() {
    if (!configured || !db?.prepare) throw new Error('unavailable');
    if (!initialized) initialized = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS charisna_passkeys (
        credential_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        owner_email TEXT NOT NULL,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL CHECK (counter >= 0),
        transports TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS charisna_passkey_challenges (
        challenge_id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE,
        owner_email TEXT NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
        challenge TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      )`).run();
    })().catch(error => {initialized = null; throw error;});
    await initialized;
  }
  function guard(action) {
    return async (user, ...args) => {
      const denied = authorize(user);
      if (denied) return denied;
      try {await initialize(); return await action(user, ...args);} catch {return unavailable();}
    };
  }
  const key = configured ? createHash('sha256').update(env.SESSION_SECRET).update(':passkey-challenge').digest() : null;
  const aad = Buffer.from(configured ? `${env.SITE_ORIGIN}:passkey-challenge` : '');
  function seal(value) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(aad);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }
  const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
  const invalid = () => ({status: 400, body: {error: 'Passkey verification failed'}, cookie: clearCookie});
  function header(headers, name) {
    return Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name)?.[1];
  }
  async function consume(user, headers, purpose) {
    let payload;
    try {
      if (header(headers, 'origin') !== env.SITE_ORIGIN) return null;
      const cookies = header(headers, 'cookie');
      if (typeof cookies !== 'string' || cookies.length > 32768) return null;
      const matches = cookies.split(';').map(x => x.trim()).filter(x => x.startsWith(`${COOKIE}=`));
      if (matches.length !== 1) return null;
      const value = matches[0].slice(COOKIE.length + 1);
      if (!/^[A-Za-z0-9_-]{40,2048}$/.test(value)) return null;
      const bytes = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAAD(aad); decipher.setAuthTag(bytes.subarray(12, 28));
      payload = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
      if (payload.ownerId !== user.id || payload.purpose !== purpose || payload.expires <= now()) return null;
    } catch {return null;}
    return db.prepare(`DELETE FROM charisna_passkey_challenges WHERE owner_id = ? AND owner_email = ? AND purpose = ? AND challenge = ? AND expires_at > ? RETURNING challenge`)
      .bind(user.id, user.email, purpose, payload.challenge, now()).first();
  }
  async function issue(user, purpose, options) {
    const expires = now() + 300000;
    await db.prepare('DELETE FROM charisna_passkey_challenges WHERE owner_id = ? OR expires_at <= ?').bind(user.id, now()).run();
    await db.prepare(`INSERT INTO charisna_passkey_challenges (challenge_id, owner_id, owner_email, purpose, challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id) DO UPDATE SET challenge_id = excluded.challenge_id, owner_email = excluded.owner_email,
      purpose = excluded.purpose, challenge = excluded.challenge, expires_at = excluded.expires_at`)
      .bind(randomBytes(16).toString('hex'), user.id, user.email, purpose, options.challenge, expires).run();
    return {status: 200, body: options, cookie: `${COOKIE}=${seal({challenge: options.challenge, ownerId: user.id, purpose, expires})}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300`};
  }
  // The handler must require an unlocked owner; recent reauthentication is recommended.
  const revoke = guard(async user => {
    await db.prepare('DELETE FROM charisna_passkey_challenges WHERE owner_id = ? AND owner_email = ?').bind(user.id, user.email).run();
    await db.prepare('DELETE FROM charisna_passkeys WHERE owner_id = ? AND owner_email = ?').bind(user.id, user.email).run();
    return {status: 200, body: {ok: true}, cookie: clearCookie};
  });
  const authenticationOptions = guard(async user => {
    const credentials = (await db.prepare('SELECT credential_id, transports FROM charisna_passkeys WHERE owner_id = ? AND owner_email = ?').bind(user.id, user.email).all()).results;
    if (!credentials.length) return {status: 409, body: {error: 'No passkeys registered'}};
    const options = await generateAuthenticationOptions({rpID: new URL(env.SITE_ORIGIN).hostname, userVerification: 'required',
      allowCredentials: credentials.map(x => ({id: x.credential_id, transports: JSON.parse(x.transports)}))});
    return issue(user, 'authentication', options);
  });
  const verifyAuthentication = guard(async (user, headers, response) => {
    const challenge = await consume(user, headers, 'authentication');
    if (!challenge) return invalid();
    if (!response || typeof response.id !== 'string' || response.id.length > 2048) return invalid();
    try {if (Buffer.byteLength(JSON.stringify(response)) > 65536) return invalid();} catch {return invalid();}
    const stored = await db.prepare('SELECT * FROM charisna_passkeys WHERE credential_id = ? AND owner_id = ? AND owner_email = ?')
      .bind(response.id, user.id, user.email).first();
    if (!stored) return invalid();
    let newCounter;
    try {
      const verified = await verifyAuthenticationResponse({response, expectedChallenge: challenge.challenge,
        expectedOrigin: env.SITE_ORIGIN, expectedRPID: new URL(env.SITE_ORIGIN).hostname, requireUserVerification: true,
        credential: {id: stored.credential_id, publicKey: new Uint8Array(Buffer.from(stored.public_key, 'base64url')),
          counter: stored.counter, transports: JSON.parse(stored.transports)}});
      if (!verified.verified || !verified.authenticationInfo.userVerified) return invalid();
      newCounter = verified.authenticationInfo.newCounter;
    } catch {return invalid();}
    const updated = await db.prepare('UPDATE charisna_passkeys SET counter = ? WHERE credential_id = ? AND owner_id = ? AND owner_email = ? AND counter = ? RETURNING credential_id')
      .bind(newCounter, stored.credential_id, user.id, user.email, stored.counter).first();
    if (!updated) return invalid();
    return {status: 200, body: {ok: true}, cookie: clearCookie, user: {id: stored.owner_id, email: stored.owner_email}};
  });
  const verifyRegistration = guard(async (user, headers, response) => {
    const challenge = await consume(user, headers, 'registration');
    if (!challenge || response?.authenticatorAttachment !== 'platform') return invalid();
    try {if (Buffer.byteLength(JSON.stringify(response)) > 65536) return invalid();} catch {return invalid();}
    let credential;
    try {
      // Registration verifier currently omits the authentication verifier's iframe check.
      const client = decodeClientDataJSON(response.response.clientDataJSON);
      if (client.crossOrigin || client.topOrigin) return invalid();
      const verified = await verifyRegistrationResponse({response, expectedChallenge: challenge.challenge,
        expectedOrigin: env.SITE_ORIGIN, expectedRPID: new URL(env.SITE_ORIGIN).hostname, requireUserVerification: true});
      if (!verified.verified || !verified.registrationInfo.userVerified) return invalid();
      credential = verified.registrationInfo.credential;
    } catch {return invalid();}
    const saved = await db.prepare(`INSERT INTO charisna_passkeys (credential_id, owner_id, owner_email, public_key, counter, transports, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM charisna_passkeys WHERE owner_id = ?) < 5
      ON CONFLICT(credential_id) DO NOTHING RETURNING credential_id`)
      .bind(credential.id, user.id, user.email, Buffer.from(credential.publicKey).toString('base64url'), credential.counter,
        JSON.stringify(credential.transports || []), now(), user.id).first();
    if (!saved) return {status: 409, body: {error: 'Passkey already registered or limit reached'}, cookie: clearCookie};
    return {status: 200, body: {ok: true}, cookie: clearCookie, user: {id: user.id, email: user.email}};
  });
  const registrationOptions = guard(async user => {
    const row = await db.prepare('SELECT COUNT(*) AS count FROM charisna_passkeys WHERE owner_id = ?').bind(user.id).first();
    if (row.count >= 5) return {status: 409, body: {error: 'Maximum passkeys reached'}};
    const challenge = await generateRegistrationOptions({rpName: 'CHARISNA SuperApp', rpID: new URL(env.SITE_ORIGIN).hostname,
      userID: new Uint8Array(Buffer.from(user.id)), userName: user.email, userDisplayName: user.email, attestationType: 'none',
      authenticatorSelection: {authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required'},
      excludeCredentials: (await db.prepare('SELECT credential_id FROM charisna_passkeys WHERE owner_id = ?').bind(user.id).all()).results.map(x => ({id: x.credential_id}))});
    return issue(user, 'registration', challenge);
  });
  const status = guard(async user => {
    const row = await db.prepare('SELECT COUNT(*) AS count FROM charisna_passkeys WHERE owner_id = ? AND owner_email = ?').bind(user.id, user.email).first();
    return {status: 200, body: {ok: true, enabled: row.count > 0, count: row.count, maxCredentials: 5}};
  });
  return {configured: configured && Boolean(db?.prepare), registrationOptions, verifyRegistration, authenticationOptions,
    verifyAuthentication, revoke, status};
}
