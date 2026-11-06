import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerAuth } from '../cloud/auth.mjs';

const EMAIL = 'charisna.superapp@gmail.com';
const ID = 'f51372b0-e63c-4c77-b7e3-584aeed56d38';
const START = 1_800_000_000_000;
const env = () => ({ SITE_ORIGIN: 'https://charisna.example', SUPABASE_URL: 'https://fepsonesdfuyycdlbsav.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_demo', OWNER_EMAIL: EMAIL, SESSION_SECRET: 'correct-long-random-test-fixture-secret-1234567890' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const req = cookie => ({ headers: { cookie: cookie?.split(';')[0] ?? '' } });

// Mint a real PKCE cookie with the same key, then exercise exchangeCode as a browser would.
function makeAuth(options) {
  const auth = createOwnerAuth(options);
  const minter = createOwnerAuth({ env: options.env, now: options.now, fetchImpl: async () => json({}) });
  return { ...auth, async verifyCode(code) {
    const started = await minter.sendLink();
    return auth.exchangeCode({ headers: { cookie: started.cookie?.split(';')[0] ?? '' } }, code);
  } };
}
test('sendLink requests only the fixed owner with PKCE challenge and redirect to the callback', async () => {
  const calls = [];
  const auth = makeAuth({ env: env(), now: () => START, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return json({});
  } });
  assert.equal(auth.configured, true);
  const sent = await auth.sendLink();
  assert.equal(sent.status, 200);
  assert.deepEqual(sent.body, { ok: true });
  assert.match(sent.cookie, /^__Host-charisna-pkce=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600$/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${env().SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent('https://charisna.example/auth/callback')}`);
  assert.equal(calls[0].options.method, 'POST');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual({ ...body, code_challenge: undefined }, { email: EMAIL, create_user: true, code_challenge: undefined, code_challenge_method: 's256' });
  assert.match(body.code_challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(!sent.cookie.includes(body.code_challenge));
  assert.equal(calls[0].options.headers.apikey, env().SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[0].options.redirect, 'error');
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test('unsafe configuration is rejected before network access', () => {
  const jwt = role => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;
  const invalid = [
    { SITE_ORIGIN: 'http://charisna.example' }, { SITE_ORIGIN: 'https://charisna.example/path' },
    { SITE_ORIGIN: 'https://charisna.example/' }, { SITE_ORIGIN: 'https://u:p@charisna.example' },
    { SITE_ORIGIN: 'https://charisna.example:443' }, { SUPABASE_URL: 'https://evil.example' },
    { SUPABASE_URL: 'https://fepsonesdfuyycdlbsav.supabase.co.evil.example' },
    { SUPABASE_URL: 'https://fepsonesdfuyycdlbsav.supabase.co/path' },
    { SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }, { SUPABASE_PUBLISHABLE_KEY: jwt('authenticated') },
    { SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }, { SUPABASE_PUBLISHABLE_KEY: 'garbage' },
    { OWNER_EMAIL: 'attacker@example.com' }, { OWNER_USER_ID: 'not-a-uuid' },
    { SESSION_SECRET: 'short' }, { SESSION_SECRET: 'x'.repeat(64) }
  ];
  for (const override of invalid) assert.equal(makeAuth({ env: { ...env(), ...override } }).configured, false);
  assert.equal(makeAuth({ env: { ...env(), SUPABASE_PUBLISHABLE_KEY: jwt('anon'), OWNER_USER_ID: ID } }).configured, true);
});

const token = (seconds = 3600) => `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify({ exp: START / 1000 + seconds })).toString('base64url')}.${Buffer.from('synthetic signature').toString('base64url')}`;
const owner = () => ({ id: ID, email: ` ${EMAIL.toUpperCase()} `, email_confirmed_at: '2027-01-01T00:00:00Z' });
function fixture({ user = owner(), accessToken = token(), userStatus = 200, config = {}, clock = () => START } = {}) {
  const calls = [];
  const auth = makeAuth({ env: { ...env(), ...config }, now: clock, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.includes('/token?') ? json({ access_token: accessToken, user: { role: 'owner' } }) : json(user, userStatus);
  } });
  return { auth, calls };
}

test('verified owner receives opaque secure cookie and is revalidated on every request', async () => {
  const { auth, calls } = fixture({ config: { OWNER_USER_ID: ID } });
  const result = await auth.verifyCode('authcode123456');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.match(result.cookie, /^__Host-charisna=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=900$/);
  assert.ok(!result.cookie.includes(token()));
  assert.equal(calls[0].url, `${env().SUPABASE_URL}/auth/v1/token?grant_type=pkce`);
  const exchange = JSON.parse(calls[0].options.body);
  assert.equal(exchange.auth_code, 'authcode123456');
  assert.match(exchange.code_verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(calls[1].url, `${env().SUPABASE_URL}/auth/v1/user`);
  assert.equal(calls[1].options.method, 'GET');
  assert.equal(calls[1].options.headers.Authorization, `Bearer ${token()}`);
  for (let i = 0; i < 2; i++) assert.deepEqual(await auth.authorize(req(result.cookie)), { status: 200, user: { id: ID, email: EMAIL } });
  assert.equal(calls.length, 4);
});

test('wrong owner and unverified users never receive a session', async () => {
  for (const user of [
    { ...owner(), email: 'attacker@example.com' },
    { ...owner(), email_confirmed_at: null },
    { ...owner(), email_confirmed_at: undefined, confirmed_at: '2027-01-01T00:00:00Z' },
    { ...owner(), id: 'not-a-uuid' },
    { ...owner(), id: 'a51372b0-e63c-4c77-b7e3-584aeed56d38' }
  ]) {
    const { auth } = fixture({ user, config: { OWNER_USER_ID: ID } });
    const result = await auth.verifyCode('authcode123456');
    assert.equal(result.status, 403);
    assert.equal(result.cookie, undefined);
    assert.deepEqual(result.body, { error: 'Access denied' });
  }
  const good = fixture();
  const session = await good.auth.verifyCode('authcode123456');
  const wrong = fixture({ user: { ...owner(), email: 'attacker@example.com' } });
  assert.equal((await wrong.auth.authorize(req(session.cookie))).status, 403);
});

test('malformed provider responses fail closed without credentials', async () => {
  for (const path of ['/token?grant_type=pkce', '/user']) {
    for (const body of [null, [], 'invalid', {}, { access_token: 42 }, { access_token: 'not-a-jwt' }]) {
      const auth = makeAuth({ env: env(), now: () => START, fetchImpl: async url =>
        url.endsWith(path) ? json(body) : json({ access_token: token() }) });
      const result = await auth.verifyCode('authcode123456');
      assert.deepEqual(result, { status: 503, body: { error: 'Authentication unavailable' } });
    }
  }
  for (const response of [() => new Response('not json'), () => json({ padding: 'x'.repeat(65536) }), () => new Response('{}', { headers: { 'Content-Length': '65537' } })]) {
    const auth = makeAuth({ env: env(), fetchImpl: async () => response() });
    assert.equal((await auth.verifyCode('authcode123456')).status, 503);
  }
});

test('cookie tampering, expiry, origin and key changes fail before provider access', async () => {
  let time = START;
  const { auth, calls } = fixture({ clock: () => time });
  const result = await auth.verifyCode('authcode123456');
  const cookie = result.cookie.split(';')[0];
  const value = cookie.split('=')[1];
  for (const raw of ['', '__Host-charisna=bad', `__Host-charisna=${value.slice(0, -4)}AAAA`,
    `__Host-charisna=${value}=`, `${cookie}; ${cookie}`, '__Host-charisna=' + 'x'.repeat(5000), 'unrelated=x']) {
    const before = calls.length;
    assert.equal((await auth.authorize({ headers: { cookie: raw } })).status, 401);
    assert.equal(calls.length, before);
  }
  for (const config of [{ SITE_ORIGIN: 'https://other.example' }, { SESSION_SECRET: 'different-long-random-test-fixture-secret-9876543210' }]) {
    const changed = fixture({ config });
    assert.equal((await changed.auth.authorize(req(cookie))).status, 401);
    assert.equal(changed.calls.length, 0);
  }
  time += 900_000;
  const before = calls.length;
  assert.equal((await auth.authorize(req(cookie))).status, 401);
  assert.equal(calls.length, before);
});

test('cookie lifetime is capped at token expiry and expired provider tokens are rejected', async () => {
  const short = fixture({ accessToken: token(60) });
  const result = await short.auth.verifyCode('authcode123456');
  assert.equal(result.status, 200);
  assert.match(result.cookie, /Max-Age=60$/);
  const later = fixture({ clock: () => START + 60_000 });
  assert.equal((await later.auth.authorize(req(result.cookie))).status, 401);
  assert.equal(later.calls.length, 0);
  for (const seconds of [0, -1]) {
    const expired = fixture({ accessToken: token(seconds) });
    assert.equal((await expired.auth.verifyCode('authcode123456')).status, 401);
    assert.equal(expired.calls.length, 1);
  }
});

test('provider status and fetch failures are contained without leaking details', async () => {
  for (const status of [401, 429, 500]) {
    for (const action of ['sendLink', 'verifyCode', 'authorize']) {
      const issued = await fixture().auth.verifyCode('authcode123456');
      const auth = makeAuth({ env: env(), now: () => START, fetchImpl: async () => json({ message: 'private upstream details', access_token: token() }, status) });
      const result = await auth[action](action === 'authorize' ? req(issued.cookie) : 'authcode123456');
      assert.deepEqual(result, status === 401 && action !== 'sendLink'
        ? { status: 401, body: { error: 'Authentication required' } }
        : { status: 503, body: { error: 'Authentication unavailable' } });
    }
  }
  for (const action of ['sendLink', 'verifyCode', 'authorize']) {
    const issued = await fixture().auth.verifyCode('authcode123456');
    const auth = makeAuth({ env: env(), now: () => START, fetchImpl: async () => { throw new Error('private credentials'); } });
    assert.deepEqual(await auth[action](action === 'authorize' ? req(issued.cookie) : 'authcode123456'), { status: 503, body: { error: 'Authentication unavailable' } });
  }
});

test('exchangeCode rejects malformed auth codes before network access', async () => {
  const { auth, calls } = fixture();
  for (const code of ['123456\n', '\n123456', ' 123456', '123456 ', '12345', '1234567', 'a'.repeat(201), '１２３４５６', 123456, null, {}, undefined]) {
    assert.deepEqual(await auth.verifyCode(code), { status: 400, body: { error: 'Invalid code' } });
  }
  assert.equal(calls.length, 0);
});

test('logout revokes upstream best effort and always expires the secure cookie', async () => {
  const { auth, calls } = fixture();
  const issued = await auth.verifyCode('authcode123456');
  const expected = { status: 200, body: { ok: true }, cookie: '__Host-charisna=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT' };
  assert.equal(auth.clearCookie(), expected.cookie);
  assert.deepEqual(await auth.logout(req(issued.cookie)), expected);
  const call = calls.at(-1);
  assert.equal(call.url, `${env().SUPABASE_URL}/auth/v1/logout?scope=global`);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers.Authorization, `Bearer ${token()}`);
  assert.equal(call.options.redirect, 'error');
  assert.ok(call.options.signal instanceof AbortSignal);
  for (const response of [async () => json({ private: 'details' }, 500), async () => { throw new Error('private'); }]) {
    const failed = makeAuth({ env: env(), now: () => START, fetchImpl: response });
    assert.deepEqual(await failed.logout(req(issued.cookie)), expected);
  }
  const missing = makeAuth({ env: {}, fetchImpl: () => assert.fail('no network') });
  assert.deepEqual(await missing.logout(req()), expected);
  const before = calls.length;
  assert.deepEqual(await auth.logout(req('__Host-charisna=bad')), expected);
  assert.equal(calls.length, before);
});

test('invalid and expired provider OTP responses become generic unauthorized', async () => {
  for (const status of [400, 403, 422]) {
    const auth = makeAuth({ env: env(), fetchImpl: async () => json({ error: 'private OTP details' }, status) });
    assert.deepEqual(await auth.verifyCode('authcode123456'), { status: 401, body: { error: 'Authentication required' } });
  }
});

test('token structure and expiry are strictly bounded before user lookup', async () => {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const head = encode({ alg: 'HS256' });
  for (const accessToken of [
    'x'.repeat(2049), 'a.b.c', `${head}.${encode({})}.sig`,
    `${head}.${encode({ exp: '1800000001' })}.sig`,
    `${head}.${encode({ exp: 1800000001.5 })}.sig`,
    `${head}.${encode({ exp: Number.MAX_SAFE_INTEGER })}.sig`,
    `${head}.${encode({ exp: START / 1000 + 1 })}.s`,
    `${head}.${encode({ exp: START / 1000 + 1 })}=.sig`,
    `${head}.${encode({ exp: START / 1000 + 1 })}.c2ln\n`
  ]) {
    const { auth, calls } = fixture({ accessToken });
    assert.equal((await auth.verifyCode('authcode123456')).status, 503);
    assert.equal(calls.length, 1);
  }
});

test('oversized provider content-length cancels unread response body', async () => {
  let cancelled = false;
  const auth = makeAuth({ env: env(), fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('{}')); },
    cancel() { cancelled = true; }
  }), { headers: { 'content-length': '65537' } }) });
  assert.equal((await auth.verifyCode('authcode123456')).status, 503);
  assert.equal(cancelled, true);
});

test('invalid typed configuration still constructs fail-closed auth', async () => {
  for (const config of [{ SITE_ORIGIN: 42 }, { SITE_ORIGIN: {} }, { SUPABASE_URL: 42 }, { OWNER_USER_ID: 42 }]) {
    const auth = makeAuth({ env: { ...env(), ...config }, fetchImpl: () => assert.fail('network forbidden') });
    assert.equal(auth.configured, false);
    assert.equal((await auth.sendLink()).status, 503);
    assert.equal((await auth.authorize(req())).status, 503);
    assert.equal((await auth.logout(req())).status, 200);
  }
});

test('auth codes of realistic lengths are supported', async () => {
  for (const code of ['12345678', 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', 'x'.repeat(200)]) {
    const { auth, calls } = fixture();
    assert.equal((await auth.verifyCode(code)).status, 200);
    assert.equal(JSON.parse(calls[0].options.body).auth_code, code);
  }
});

test('missing configuration fails closed without contacting provider', async () => {
  const auth = makeAuth({ env: {}, fetchImpl: () => assert.fail('network forbidden') });
  assert.equal(auth.configured, false);
  for (const result of [await auth.sendLink(), await auth.verifyCode('authcode123456'), await auth.authorize(req())]) {
    assert.deepEqual(result, { status: 503, body: { error: 'Authentication unavailable' } });
  }
});

test('exchangeCode requires a valid, unexpired, untampered PKCE cookie and never calls the provider otherwise', async () => {
  let time = START;
  const calls = [];
  const auth = createOwnerAuth({ env: env(), now: () => time, fetchImpl: async (url, options) => { calls.push({ url, options }); return json({ access_token: token(), user: owner() }); } });
  const started = await auth.sendLink();
  const cookie = started.cookie.split(';')[0];
  const value = cookie.split('=')[1];
  for (const raw of ['', 'unrelated=x', '__Host-charisna-pkce=bad', `__Host-charisna-pkce=${value.slice(0, -4)}AAAA`, `${cookie}; ${cookie}`]) {
    const before = calls.length;
    assert.equal((await auth.exchangeCode({ headers: { cookie: raw } }, 'authcode123456')).status, 401);
    assert.equal(calls.length, before);
  }
  const other = createOwnerAuth({ env: { ...env(), SESSION_SECRET: 'different-long-random-test-fixture-secret-9876543210' }, now: () => time, fetchImpl: () => assert.fail('network forbidden') });
  assert.equal((await other.exchangeCode({ headers: { cookie } }, 'authcode123456')).status, 401);
  time += 3_600_001;
  const before = calls.length;
  assert.equal((await auth.exchangeCode({ headers: { cookie } }, 'authcode123456')).status, 401);
  assert.equal(calls.length, before);
});

test('a session cookie cannot be replayed as a PKCE cookie', async () => {
  const { auth, calls } = fixture();
  const session = await auth.verifyCode('authcode123456');
  const before = calls.length;
  const forged = `__Host-charisna-pkce=${session.cookie.split(';')[0].split('=')[1]}`;
  assert.equal((await auth.exchangeCode({ headers: { cookie: forged } }, 'authcode123456')).status, 401);
  assert.equal(calls.length, before);
});