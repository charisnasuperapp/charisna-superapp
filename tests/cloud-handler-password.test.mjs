import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const origin = 'https://charisna-superapp.vercel.app';
const owner = { status: 200, user: { id: 'owner' } };
async function make(auth, teaching = null, now) {
  const { createCloudHandler } = await import('../cloud/handler.mjs');
  return createCloudHandler({ env: { SITE_ORIGIN: origin }, auth: { configured: true, authorize: async () => ({ status: 401, body: { error: 'x' } }), ...auth }, teaching, now, assetLoader: file => readFile(new URL('../cloud/' + file, import.meta.url)) });
}
const post = (path, body, headers = {}) => new Request(origin + path, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });

test('POST /auth/login passes the password to auth and sets the session cookie without echoing it', async () => {
  const seen = [];
  const handle = await make({ signInPassword: async p => { seen.push(p); return { status: 200, body: { ok: true }, cookie: '__Host-charisna=abc; Path=/' }; } });
  const res = await handle(post('/auth/login', { password: 'a-long-owner-password' }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('set-cookie'), '__Host-charisna=abc; Path=/');
  assert.deepEqual(seen, ['a-long-owner-password']);
  assert.match(res.headers.get('cache-control'), /no-store/);
});

test('/auth/login rejects cross-site, wrong shapes and non-POST before touching auth', async () => {
  let calls = 0;
  const handle = await make({ signInPassword: async () => { calls++; return { status: 200, body: { ok: true } }; } });
  for (const headers of [{ origin: 'https://evil.example' }, { 'sec-fetch-site': 'cross-site' }]) assert.equal((await handle(post('/auth/login', { password: 'a-long-owner-password' }, headers))).status, 403);
  for (const body of [{}, { password: 5 }, { password: 'a-long-owner-password', extra: 1 }]) assert.equal((await handle(post('/auth/login', body))).status, 400);
  assert.equal((await handle(new Request(origin + '/auth/login'))).status, 405);
  assert.equal(calls, 0);
});

test('/auth/login locks out after 5 failures in 15 minutes and recovers', async () => {
  let t = 1_000_000, calls = 0;
  const handle = await make({ signInPassword: async () => { calls++; return { status: 401, body: { error: 'Authentication required' } }; } }, null, () => t);
  for (let i = 0; i < 5; i++) assert.equal((await handle(post('/auth/login', { password: 'a-wrong-password-1' }))).status, 401);
  const locked = await handle(post('/auth/login', { password: 'a-wrong-password-1' }));
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get('retry-after')) > 0);
  assert.equal(calls, 5);
  t += 15 * 60_000;
  assert.equal((await handle(post('/auth/login', { password: 'a-wrong-password-1' }))).status, 401);
});

test('a successful login resets the failure counter', async () => {
  let ok = false;
  const handle = await make({ signInPassword: async () => ok ? { status: 200, body: { ok: true }, cookie: 'c=1' } : { status: 401, body: { error: 'Authentication required' } } });
  for (let i = 0; i < 4; i++) await handle(post('/auth/login', { password: 'a-wrong-password-1' }));
  ok = true; assert.equal((await handle(post('/auth/login', { password: 'a-wrong-password-1' }))).status, 200);
  ok = false; for (let i = 0; i < 5; i++) assert.equal((await handle(post('/auth/login', { password: 'a-wrong-password-1' }))).status, 401);
});

test('POST /auth/password sets the owner password through the session and forwards a rotated cookie', async () => {
  const seen = [];
  const handle = await make({ setPassword: async (req, p) => { seen.push([typeof req.headers, p]); return { status: 200, body: { ok: true }, cookie: '__Host-charisna=new' }; } });
  const res = await handle(post('/auth/password', { password: 'a-brand-new-password-1' }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), '__Host-charisna=new');
  assert.deepEqual(seen, [['object', 'a-brand-new-password-1']]);
  assert.equal((await handle(post('/auth/password', {}))).status, 400);
  assert.equal((await handle(post('/auth/password', { password: 'a-brand-new-password-1' }, { origin: 'https://evil.example' }))).status, 403);
});

test('a refreshed cookie from authorize is delivered on pages and connector calls', async () => {
  const handle = await make({ authorize: async () => ({ ...owner, cookie: '__Host-charisna=rotated' }) }, { configured: true, overview: async () => ({ status: 200, body: { state: 'not_connected' } }), disconnect: async () => ({ status: 200, body: { ok: true } }), config: () => ({}) });
  const page = await handle(new Request(origin + '/'));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('set-cookie'), '__Host-charisna=rotated');
  const json = await handle(new Request(origin + '/overview.json'));
  assert.equal(json.headers.get('set-cookie'), '__Host-charisna=rotated');
  const dis = await handle(post('/connector/disconnect', {}));
  assert.equal(dis.status, 200);
  assert.equal(dis.headers.get('set-cookie'), '__Host-charisna=rotated');
});

test('login page and its script are public', async () => {
  const handle = await make({});
  for (const p of ['/login', '/login.mjs']) assert.equal((await handle(new Request(origin + p))).status, 200, p);
});
