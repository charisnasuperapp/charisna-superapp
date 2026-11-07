import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerAuth } from '../cloud/auth.mjs';

const EMAIL = 'charisna.superapp@gmail.com';
const ID = 'f51372b0-e63c-4c77-b7e3-584aeed56d38';
const START = 1_800_000_000_000;
const DAY = 86_400_000;
const env = () => ({ SITE_ORIGIN: 'https://charisna.example', SUPABASE_URL: 'https://fepsonesdfuyycdlbsav.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_demo', OWNER_EMAIL: EMAIL, SESSION_SECRET: 'correct-long-random-test-fixture-secret-1234567890' });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = exp => `${enc({ alg: 'HS256' })}.${enc({ exp })}.c2ln`;
const owner = (extra = {}) => ({ id: ID, email: EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z', ...extra });
const req = cookie => ({ headers: { cookie: cookie?.split(';')[0] ?? '' } });

// Fake Supabase: records calls, hands out hour-long access tokens and rotating refresh tokens.
function fake({ time, user = owner(), failPassword = false, failRefresh = false } = {}) {
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const path = url.replace(env().SUPABASE_URL, '');
    if (path.startsWith('/auth/v1/token?grant_type=password')) {
      return failPassword ? json({ error: 'private' }, 400) : json({ access_token: jwt(time() / 1000 + 3600), refresh_token: `refresh-${++n}`, user });
    }
    if (path.startsWith('/auth/v1/token?grant_type=refresh_token')) {
      return failRefresh ? json({ error: 'private' }, 400) : json({ access_token: jwt(time() / 1000 + 3600), refresh_token: `refresh-${++n}`, user });
    }
    if (path.startsWith('/auth/v1/otp')) return json({});
    if (path === '/auth/v1/user' && options.method === 'GET') return json(user);
    if (path === '/auth/v1/user' && options.method === 'PUT') return json(user);
    if (path.startsWith('/auth/v1/logout')) return json({});
    return json({}, 404);
  };
  return { fetchImpl, calls };
}
function setup(options = {}) {
  let time = START;
  const clock = () => time;
  const f = fake({ time: clock, ...options });
  const auth = createOwnerAuth({ env: env(), now: clock, fetchImpl: f.fetchImpl });
  return { auth, calls: f.calls, advance: ms => { time += ms; } };
}

test('signInPassword uses the fixed owner email and returns a 30 day sealed session', async () => {
  const { auth, calls } = setup();
  const result = await auth.signInPassword('a-long-owner-password');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(result.user.id, ID);
  assert.match(result.cookie, /^__Host-charisna=[A-Za-z0-9_-]+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000$/);
  assert.equal(calls[0].url, `${env().SUPABASE_URL}/auth/v1/token?grant_type=password`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: EMAIL, password: 'a-long-owner-password' });
  assert.ok(!result.cookie.includes('a-long-owner-password'));
  assert.equal((await auth.authorize(req(result.cookie))).status, 200);
});

test('signInPassword rejects bad input locally and maps provider failures generically', async () => {
  const { auth, calls } = setup();
  for (const bad of [undefined, null, 42, {}, '', 'short', 'x'.repeat(257)]) {
    assert.equal((await auth.signInPassword(bad)).status, 401);
  }
  assert.equal(calls.length, 0);
  const wrong = setup({ failPassword: true });
  assert.deepEqual(await wrong.auth.signInPassword('a-wrong-password-123'), { status: 401, body: { error: 'Authentication required' } });
  const stranger = setup({ user: owner({ email: 'someone@example.com' }) });
  assert.equal((await stranger.auth.signInPassword('a-long-owner-password')).status, 403);
  const down = createOwnerAuth({ env: env(), fetchImpl: async () => { throw new Error('private'); } });
  assert.deepEqual(await down.signInPassword('a-long-owner-password'), { status: 503, body: { error: 'Authentication unavailable' } });
  const off = createOwnerAuth({ env: {}, fetchImpl: () => assert.fail('no network') });
  assert.equal((await off.signInPassword('a-long-owner-password')).status, 503);
});

test('a valid access token is used without calling refresh', async () => {
  const { auth, calls, advance } = setup();
  const { cookie } = await auth.signInPassword('a-long-owner-password');
  advance(30 * 60_000);
  const before = calls.length;
  const result = await auth.authorize(req(cookie));
  assert.equal(result.status, 200);
  assert.equal(result.cookie, undefined);
  assert.equal(calls.length - before, 1);
});

test('an expiring access token is refreshed silently and the cookie is rotated', async () => {
  const { auth, calls, advance } = setup();
  const first = await auth.signInPassword('a-long-owner-password');
  advance(3_600_000 - 30_000);
  const before = calls.length;
  const result = await auth.authorize(req(first.cookie));
  assert.equal(result.status, 200);
  assert.match(result.cookie, /^__Host-charisna=.+Max-Age=2592000$/);
  assert.notEqual(result.cookie, first.cookie);
  const refresh = calls[before];
  assert.equal(refresh.url, `${env().SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`);
  assert.deepEqual(JSON.parse(refresh.options.body), { refresh_token: 'refresh-1' });
  assert.equal((await auth.authorize(req(result.cookie))).cookie, undefined);
});

test('days later an expired access token still renews while the session window is open', async () => {
  const { auth, advance } = setup();
  const first = await auth.signInPassword('a-long-owner-password');
  advance(10 * DAY);
  const renewed = await auth.authorize(req(first.cookie));
  assert.equal(renewed.status, 200);
  advance(25 * DAY);
  assert.equal((await auth.authorize(req(renewed.cookie))).status, 200, 'window slides forward on refresh');
});

test('session is refused after 30 days of inactivity, when refresh fails or without a refresh token', async () => {
  const idle = setup();
  const first = await idle.auth.signInPassword('a-long-owner-password');
  idle.advance(31 * DAY);
  assert.deepEqual(await idle.auth.authorize(req(first.cookie)), { status: 401, body: { error: 'Authentication required' } });
  const revoked = setup({ failRefresh: true });
  const second = await revoked.auth.signInPassword('a-long-owner-password');
  revoked.advance(2 * 3_600_000);
  assert.equal((await revoked.auth.authorize(req(second.cookie))).status, 401);
});

test('refresh fails closed when the refreshed identity is not the owner', async () => {
  const state = { user: owner() };
  let time = START;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    if (url.includes('grant_type=')) return json({ access_token: jwt(time / 1000 + 3600), refresh_token: 'r', user: state.user });
    return json(state.user);
  };
  const auth = createOwnerAuth({ env: env(), now: () => time, fetchImpl });
  const first = await auth.signInPassword('a-long-owner-password');
  state.user = owner({ id: '11111111-1111-4111-8111-111111111111', email: 'other@example.com' });
  time += 2 * 3_600_000;
  assert.equal((await auth.authorize(req(first.cookie))).status, 403);
});

test('setPassword requires an owner session, enforces length and updates the provider user', async () => {
  const { auth, calls } = setup();
  const { cookie } = await auth.signInPassword('a-long-owner-password');
  for (const bad of [undefined, 'short', 'x'.repeat(129), 7]) {
    assert.equal((await auth.setPassword(req(cookie), bad)).status, 400);
  }
  assert.equal((await auth.setPassword(req(), 'a-brand-new-password-1')).status, 401);
  const before = calls.length;
  const result = await auth.setPassword(req(cookie), 'a-brand-new-password-1');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  const put = calls.slice(before).find(call => call.options.method === 'PUT');
  assert.equal(put.url, `${env().SUPABASE_URL}/auth/v1/user`);
  assert.deepEqual(JSON.parse(put.options.body), { password: 'a-brand-new-password-1' });
  assert.ok(!JSON.stringify(result).includes('a-brand-new-password-1'));
});

test('setPassword maps provider rejection without leaking details', async () => {
  let time = START;
  const fetchImpl = async (url, options) => {
    if (url.includes('grant_type=password')) return json({ access_token: jwt(time / 1000 + 3600), refresh_token: 'r' });
    if (options.method === 'PUT') return json({ msg: 'private policy detail' }, 422);
    return json(owner());
  };
  const auth = createOwnerAuth({ env: env(), now: () => time, fetchImpl });
  const { cookie } = await auth.signInPassword('a-long-owner-password');
  assert.deepEqual(await auth.setPassword(req(cookie), 'a-brand-new-password-1'), { status: 400, body: { error: 'Sandi ditolak. Pilih sandi yang lebih kuat.' } });
});

test('the magic link flow also yields a long session with refresh capability', async () => {
  let time = START;
  const fetchImpl = async (url, options) => {
    if (url.includes('/otp')) return json({});
    if (url.includes('grant_type=pkce')) return json({ access_token: jwt(time / 1000 + 3600), refresh_token: 'link-refresh' });
    if (url.includes('grant_type=refresh_token')) return json({ access_token: jwt(time / 1000 + 3600), refresh_token: 'link-refresh-2' });
    return json(owner());
  };
  const auth = createOwnerAuth({ env: env(), now: () => time, fetchImpl });
  const started = await auth.sendLink();
  const exchanged = await auth.exchangeCode(req(started.cookie), 'authcode123456');
  assert.equal(exchanged.status, 200);
  assert.match(exchanged.cookie, /Max-Age=2592000$/);
  time += 2 * 3_600_000;
  const renewed = await auth.authorize(req(exchanged.cookie));
  assert.equal(renewed.status, 200);
  assert.ok(renewed.cookie);
});

test('device unlock is enforced by server and survives access-token refresh', async () => {
  const { auth, advance } = setup();
  const first = await auth.signInPassword('synthetic-owner-password');
  const enabled = await auth.enableDeviceLock(req(first.cookie));
  assert.equal(enabled.status, 200);
  advance(16 * 60_000);
  assert.equal((await auth.authorize(req(enabled.cookie))).status, 423);
  assert.equal((await auth.authorizeIdentity(req(enabled.cookie))).status, 200);
  assert.equal((await auth.setPassword(req(enabled.cookie), 'synthetic-new-password')).status, 423);
  const unlocked = await auth.unlockDevice(req(enabled.cookie));
  assert.equal(unlocked.status, 200);
  assert.equal((await auth.authorize(req(unlocked.cookie))).status, 200);
  advance(2 * 3_600_000);
  const identity = await auth.authorizeIdentity(req(unlocked.cookie));
  assert.equal(identity.status, 200);
  assert.equal((await auth.authorize(req(identity.cookie))).status, 423);
  const disabled = await auth.disableDeviceLock(req((await auth.unlockDevice(req(identity.cookie))).cookie));
  advance(16 * 60_000);
  assert.equal((await auth.authorize(req(disabled.cookie))).status, 200);
  assert.equal((await auth.unlockDevice(req())).status, 401);
});

test('other sealed cookies cannot be replayed as a session', async () => {
  const { auth } = setup();
  const started = await auth.sendLink();
  const forged = `__Host-charisna=${started.cookie.split(';')[0].split('=')[1]}`;
  assert.equal((await auth.authorize({ headers: { cookie: forged } })).status, 401);
});
