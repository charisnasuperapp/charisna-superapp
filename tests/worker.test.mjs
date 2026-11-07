import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

const root = new URL('../', import.meta.url);
const workerModule = () => import('../cloud/worker.mjs');

test('Worker exports standard fetch and fails closed without configuration', async () => {
  const {default: worker} = await workerModule();
  const response = await worker.fetch(new Request('https://pending.workers.dev/'), {});
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.doesNotMatch(await response.text(), /<!doctype|SESSION_SECRET|SUPABASE/i);
});

const config = () => ({
  SITE_ORIGIN: 'https://adapter-test.workers.dev',
  SUPABASE_URL: 'https://adapter-test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only_not_a_real_key',
  OWNER_EMAIL: 'charisna.superapp@gmail.com',
  SESSION_SECRET: 'unit-test-only-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ'
});
const authRequest = env => new Request(`${env.SITE_ORIGIN}/auth/send-link`, {
  method: 'POST', headers: {'content-type': 'application/json', origin: env.SITE_ORIGIN}, body: '{}'
});

test('same environment retains request throttling while distinct environments stay isolated', async () => {
  const {default: worker} = await workerModule();
  const env = config();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({}); // Only replace the external OTP provider boundary.
  try {
    assert.notEqual((await worker.fetch(authRequest(env), env)).status, 429);
    assert.equal((await worker.fetch(authRequest(env), env)).status, 429);
    const other = config();
    assert.notEqual((await worker.fetch(authRequest(other), other)).status, 429);
  } finally { globalThis.fetch = realFetch; }
});

test('adapter serves embedded login but never directly exposes protected sources', async () => {
  const {default: worker} = await workerModule();
  const env = config();
  for (const [path, file] of [['/login', './login.html'], ['/login.mjs', './login.mjs'], ['/styles.css', '../public/styles.css']]) {
    const response = await worker.fetch(new Request(`${env.SITE_ORIGIN}${path}`), env);
    assert.equal(response.status, 200, path);
    const {assets} = await import('../cloud/assets.mjs');
    assert.equal(await response.text(), assets[file]);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  assert.equal((await worker.fetch(new Request(`${env.SITE_ORIGIN}/`), env)).status, 303);
  for (const path of ['/app.mjs', '/demo/overview.json', '/public/index.html', '/cloud/assets.mjs', '/cloud/worker.mjs', '/.env', '/demo/fixtures.json', '/%2e%2e/cloud/auth.mjs']) {
    const response = await worker.fetch(new Request(`${env.SITE_ORIGIN}${path}`), env);
    assert.equal(response.status, 401, path);
    assert.doesNotMatch(await response.text(), /<!doctype|export const assets|SESSION_SECRET|fixture_id/i);
  }
  assert.equal((await worker.fetch(new Request('https://untrusted.example/login'), env)).status, 403);
});

test('Wrangler configuration binds only the approved D1 Free database and cron', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.main, 'cloud/worker.mjs');
  assert.equal(config.compatibility_date, '2026-11-06');
  assert.ok(config.compatibility_flags.includes('nodejs_compat'));
  assert.equal(config.build.command, 'node scripts/build-worker.mjs');
  assert.deepEqual(config.d1_databases, [{binding:'TEACHING_STATE', database_name:'charisna-teaching-state', database_id:'34d0a6ac-1651-4b9e-baa3-0b94b42910e6'}]);
  assert.deepEqual(config.triggers, {crons:['0 */6 * * *']});
  for (const field of ['assets', 'site', 'routes', 'account_id', 'kv_namespaces', 'r2_buckets', 'durable_objects', 'services', 'unsafe', 'vars']) {
    assert.equal(Object.hasOwn(config, field), false, field);
  }
  assert.equal(config.observability.enabled, false);
});

const sourceFiles = [
  './overview.html', './overview.mjs', '../public/styles.css',
  './login.html', './login.mjs'
];

test('asset build embeds exactly the five explicit UI sources, byte for byte', async () => {
  const result = spawnSync(process.execPath, ['scripts/build-worker.mjs'], {cwd: root, encoding: 'utf8'});
  assert.equal(result.status, 0, `Asset build failed: ${result.stderr}`);
  const {assets, loadAsset} = await import(`../cloud/assets.mjs?test=${Date.now()}`);
  assert.deepEqual(Object.keys(assets).sort(), [...sourceFiles].sort());
  for (const file of sourceFiles) {
    assert.equal(await loadAsset(file), await readFile(new URL(file, new URL('../cloud/', import.meta.url)), 'utf8'));
  }
  for (const file of ['../.env', './auth.mjs', '../demo/fixtures.json', '__proto__', 'constructor']) {
    assert.throws(() => loadAsset(file), /Unknown embedded asset/);
  }
});
