import test from 'node:test';
import assert from 'node:assert/strict';
import { createOwnerAuth } from '../cloud/auth.mjs';

const START = 1_800_000_000_000;
const EMAIL = 'charisna.superapp@gmail.com';
const env = { SITE_ORIGIN: 'https://charisna.example', SUPABASE_URL: 'https://testproject.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_demo', OWNER_EMAIL: EMAIL, SESSION_SECRET: 'synthetic-only-fixture-secret-1234567890' };
const owner = { id: 'f51372b0-e63c-4c77-b7e3-584aeed56d38', email: EMAIL, email_confirmed_at: '2026-01-01T00:00:00Z' };
const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (expires, extra = {}) => `${enc({ alg: 'HS256' })}.${enc({ exp: Math.floor(expires / 1000), ...extra })}.c2ln`;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const req = cookie => ({ headers: { cookie: cookie?.split(';')[0] ?? '' } });
function setup() {
  let time = START;
  const calls = [];
  const state = { userStatus: 200, logoutStatus: 200, refreshStatus: 200, accessDelta: 3_600_000, refreshToken: 'refresh-old', extra: {} };
  const auth = createOwnerAuth({ env, now: () => time, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    if (url.includes('grant_type=')) {
      if (url.includes('refresh_token')) {
        if (state.beforeRefresh) await state.beforeRefresh();
        if (state.refreshStatus !== 200) return json({}, state.refreshStatus);
      }
      return json({ access_token: jwt(time + state.accessDelta, state.extra), refresh_token: state.refreshToken });
    }
    if (url.includes('/logout')) {
      if (state.logoutThrows) throw new Error('synthetic network failure');
      return json({}, state.logoutStatus);
    }
    if (state.userThrows) throw new Error('synthetic network failure');
    return json(owner, state.userStatus);
  } });
  return { auth, state, calls, advance: ms => { time += ms; } };
}

test('logout always clears locally without claiming failed upstream revocation', async () => {
  for (const failure of [{ logoutStatus: 401 }, { logoutStatus: 403 }, { logoutStatus: 500 }, { logoutThrows: true }, { refreshStatus: 400 }]) {
    const { auth, state, advance } = setup();
    const first = await auth.signInPassword('synthetic-password');
    Object.assign(state, failure);
    advance(7_200_000);
    const result = await auth.logout(req(first.cookie));
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ok: true, revoked: false });
    assert.equal(result.cookie, auth.clearCookie());
  }
  const { auth } = setup();
  assert.deepEqual((await auth.logout(req())).body, { ok: true, revoked: false });
  const off = createOwnerAuth({ env: {} });
  const result = await off.logout(req());
  assert.deepEqual(result.body, { ok: true, revoked: false });
  assert.equal(result.cookie, off.clearCookie());
});

test('logout refreshes an expired access token before reporting successful upstream revocation', async () => {
  const { auth, calls, advance } = setup();
  const first = await auth.signInPassword('synthetic-password');
  advance(7_200_000);
  const result = await auth.logout(req(first.cookie));
  assert.deepEqual(result.body, { ok: true, revoked: true });
  assert.equal(result.cookie, auth.clearCookie());
  const refresh = calls.findIndex(call => call.url.includes('grant_type=refresh_token'));
  const logout = calls.findIndex(call => call.url.includes('/logout'));
  assert.ok(refresh >= 0 && logout > refresh);
  assert.equal(calls[logout].options.headers.Authorization, `Bearer ${jwt(START + 10_800_000)}`);
});

test('definitive /user 401 and 403 clear the cookie and require authentication', async () => {
  for (const userStatus of [401, 403]) {
    for (const age of [0, 7_200_000]) {
      const { auth, state, advance } = setup();
      const first = await auth.signInPassword('synthetic-password');
      state.userStatus = userStatus;
      advance(age);
      const result = await auth.authorize(req(first.cookie));
      assert.equal(result.status, 401);
      assert.equal(result.cookie, auth.clearCookie());
      assert.deepEqual(result.body, { error: 'Authentication required' });
    }
  }
});

test('newly issued expired access tokens are rejected even with a refresh token', async () => {
  for (const accessDelta of [0, -1000]) {
    const { auth, state, calls } = setup();
    state.accessDelta = accessDelta;
    const result = await auth.signInPassword('synthetic-password');
    assert.equal(result.status, 401);
    assert.equal(result.cookie, undefined);
    assert.equal(calls.filter(call => call.url.endsWith('/user')).length, 0);
  }
});

test('refresh rejects expired replacement tokens while old expired cookies remain refreshable', async () => {
  for (const accessDelta of [0, -1000]) {
    const { auth, state, calls, advance } = setup();
    const first = await auth.signInPassword('synthetic-password');
    advance(7_200_000);
    state.accessDelta = accessDelta;
    const before = calls.length;
    const result = await auth.authorize(req(first.cookie));
    assert.equal(result.status, 401);
    assert.ok(!result.cookie || result.cookie === auth.clearCookie());
    assert.equal(calls.length - before, 1);
    assert.ok(calls[before].url.includes('grant_type=refresh_token'));
  }
});

  test('oversized session cookie serialization fails closed and rejects issuance', async () => {
  const { auth, state, advance } = setup();
  state.extra = { pad: 'x'.repeat(4000) };
  const login = await auth.signInPassword('synthetic-password');
  assert.equal(login.status, 401);
  assert.equal(login.cookie, undefined);

  state.extra = {};
  const okLogin = await auth.signInPassword('synthetic-password');
  assert.ok(okLogin.cookie);

  state.extra = { pad: 'x'.repeat(4000) };
  advance(7_200_000);
  const refreshed = await auth.authorize(req(okLogin.cookie));
  assert.equal(refreshed.status, 401);
  assert.equal(refreshed.cookie, undefined);
});

test('concurrent duplicate refresh single-flights within instance and respects per-request device lock claims', async () => {
  const { auth, state, calls, advance } = setup();
  const first = await auth.signInPassword('synthetic-password');
  advance(7_200_000);
  // first has no deviceLock. Now enable it on another request with same refresh token:
  const enabled = await auth.enableDeviceLock(req(first.cookie));
  // At this point both have expired access tokens (or enabled just refreshed access token, let's make sure both have expired access token)
  advance(7_200_000);
  // Now unlocked:
  const unlocked = await auth.unlockDevice(req(enabled.cookie));
  // unlocked is valid for 15 min. But let's say access token expired again after 1 hour:
  advance(3_600_000);
  // Here unlocked has expired access token, but unlockUntil has also expired if advance is 1 hour.
  // Instead: have locked session (deviceLock: true, unlockUntil: 0) and unlocked session (deviceLock: false) sharing the same refresh token!
  // first has deviceLock: false. enabled has deviceLock: true (locked).
  let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  let refreshCount = 0;
  state.beforeRefresh = async () => {
    refreshCount++;
    await gate;
  };

  const before = calls.length;
  const p1 = auth.authorize(req(first.cookie));
  const p2 = auth.authorize(req(enabled.cookie));
  unblock();
  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(r1.status, 200); // first had no deviceLock, so authorize returns 200
  assert.equal(r2.status, 423); // enabled had deviceLock, so authorize returns 423 lockError
  const refreshCalls = calls.slice(before).filter(call => call.url.includes('grant_type=refresh_token'));
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCount, 1);
  assert.notEqual(r1.cookie, r2.cookie);
  assert.equal((await auth.authorizeIdentity(req(r2.cookie))).status, 200);
});

test('refresh reuse cache survives bounded short interval then triggers fresh exchange', async () => {
  const { auth, calls, advance } = setup();
  const first = await auth.signInPassword('synthetic-password');
  advance(7_200_000);

  const before = calls.length;
  const r1 = await auth.authorize(req(first.cookie));
  assert.equal(r1.status, 200);
  assert.equal(calls.slice(before).filter(call => call.url.includes('grant_type=refresh_token')).length, 1);

  // Replay original cookie within 3 seconds -> reused cached fresh token without second upstream call
  advance(3000);
  const r2 = await auth.authorize(req(first.cookie));
  assert.equal(r2.status, 200);
  assert.equal(calls.slice(before).filter(call => call.url.includes('grant_type=refresh_token')).length, 1);

  // Beyond cache window (5s) -> triggers new refresh
  advance(3000);
  const r3 = await auth.authorize(req(first.cookie));
  assert.equal(r3.status, 200);
  assert.equal(calls.slice(before).filter(call => call.url.includes('grant_type=refresh_token')).length, 2);
});

test('/user transient failures remain 503 without clearing a potentially valid session', async () => {
  for (const failure of [{ userStatus: 429 }, { userStatus: 500 }, { userStatus: 503 }, { userThrows: true }]) {
    const { auth, state } = setup();
    const first = await auth.signInPassword('synthetic-password');
    Object.assign(state, failure);
    const result = await auth.authorize(req(first.cookie));
    assert.equal(result.status, 503);
    assert.equal(result.cookie, undefined);
  }
});
