import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {generateKeyPairSync, createHash, sign, randomBytes} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';

const hash = value => createHash('sha256').update(value).digest();
const b64 = value => Buffer.from(value).toString('base64url');
function authenticator() {
  const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  const jwk = publicKey.export({format: 'jwk'});
  const id = randomBytes(32);
  const cose = isoCBOR.encode(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  return {id: b64(id), registration(options, overrides = {}) {
    const clientDataJSON = Buffer.from(JSON.stringify({type: 'webauthn.create', challenge: options.challenge, origin: env.SITE_ORIGIN, ...overrides.client}));
    const length = Buffer.alloc(2); length.writeUInt16BE(id.length);
    const counter = Buffer.alloc(4);
    const authData = Buffer.concat([hash(overrides.rpID || options.rp.id), Buffer.from([overrides.flags ?? 0x45]), counter, Buffer.alloc(16), length, id, cose]);
    const signature = sign('sha256', Buffer.concat([authData, hash(clientDataJSON)]), privateKey);
    if (overrides.badSignature) signature[signature.length - 1] ^= 1;
    return {id: b64(id), rawId: b64(id), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {}, response: {
      clientDataJSON: b64(clientDataJSON), transports: ['internal'],
      attestationObject: b64(isoCBOR.encode(new Map([['fmt', 'packed'], ['authData', authData], ['attStmt', new Map([['alg', -7], ['sig', signature]])]])))}};
  }, assertion(options, overrides = {}) {
    const clientDataJSON = Buffer.from(JSON.stringify({type: 'webauthn.get', challenge: options.challenge, origin: env.SITE_ORIGIN, ...overrides.client}));
    const counter = Buffer.alloc(4); counter.writeUInt32BE(overrides.counter ?? 1);
    const authData = Buffer.concat([hash(overrides.rpID || options.rpId), Buffer.from([overrides.flags ?? 5]), counter]);
    const signature = sign('sha256', Buffer.concat([authData, hash(clientDataJSON)]), privateKey);
    if (overrides.badSignature) signature[signature.length - 1] ^= 1;
    return {id: b64(id), rawId: b64(id), type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {}, response: {
      clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authData), signature: b64(signature)}};
  }};
}
const headersFor = result => ({origin: env.SITE_ORIGIN, cookie: result.cookie.split(';')[0]});
async function enroll(api, device = authenticator()) {
  const options = await api.registrationOptions(owner);
  const result = await api.verifyRegistration(owner, headersFor(options), device.registration(options.body));
  return {device, options, result};
}

function database() {
  const sqlite = new DatabaseSync(':memory:');
  return {sqlite, prepare(sql) {
    function statement(args = []) {
      return {bind: (...values) => statement(values),
        async run() { return sqlite.prepare(sql).run(...args); },
        async first() { return sqlite.prepare(sql).get(...args) || null; },
        async all() { return {results: sqlite.prepare(sql).all(...args)}; }};
    }
    return statement();
  }};
}

const {createOwnerPasskeys} = await import('../cloud/passkeys.mjs');
const owner = { id: 'c6e7f590-a5d2-422d-bdd7-e19cd0663a67', email: 'charisna.superapp@gmail.com' };
const env = { SITE_ORIGIN: 'https://charisna.example', SESSION_SECRET: 'test-only-secret-0123456789-abcdefghijklmnopqrstuvwxyz', OWNER_EMAIL: owner.email };

test('every passkey endpoint requires an authenticated owner before touching storage', async () => {
  assert.equal(typeof createOwnerPasskeys, 'function', 'owner passkey factory must exist');
  const api = createOwnerPasskeys({env});
  for (const [method, args] of [
    ['registrationOptions', []], ['verifyRegistration', [null, {}, {}]],
    ['authenticationOptions', []], ['verifyAuthentication', [null, {}, {}]],
    ['revoke', []], ['status', []]
  ]) {
    assert.equal((await api[method](...args)).status, 401, method);
    assert.equal((await api[method]({...owner, email: 'other@example.com'}, {}, {})).status, 403, method);
  }
});

test('status lazily creates isolated auth tables and exposes only count and availability', async () => {
  const db = database();
  const api = createOwnerPasskeys({env, db});
  assert.deepEqual(await api.status(owner), {status: 200, body: {ok: true, enabled: false, count: 0, maxCredentials: 5}});
  const names = db.sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name).sort();
  assert.deepEqual(names, ['charisna_passkey_challenges', 'charisna_passkeys']);
});

test('registration options require a platform verifier and seal a five-minute one-time owner challenge', async () => {
  const db = database();
  const api = createOwnerPasskeys({env, db, now: () => 1000});
  const result = await api.registrationOptions(owner);
  assert.equal(result.status, 200);
  assert.equal(result.body.rp.id, 'charisna.example');
  assert.equal(result.body.user.name, owner.email);
  assert.equal(result.body.authenticatorSelection.authenticatorAttachment, 'platform');
  assert.equal(result.body.authenticatorSelection.residentKey, 'preferred');
  assert.equal(result.body.authenticatorSelection.userVerification, 'required');
  assert.match(result.cookie, /^__Host-charisna-passkey=/);
  assert.match(result.cookie, /Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=300$/);
  assert.ok(!result.cookie.includes(result.body.challenge));
  const row = db.sqlite.prepare('SELECT * FROM charisna_passkey_challenges').get();
  assert.equal(row.owner_id, owner.id);
  assert.equal(row.purpose, 'registration');
  assert.equal(row.challenge, result.body.challenge);
  assert.equal(row.expires_at, 301000);
  const next = await api.registrationOptions(owner);
  assert.notEqual(next.body.challenge, result.body.challenge);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM charisna_passkey_challenges').get().n, 1);
});

test('signed packed registration stores verified owner credential once without leaking key material', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  const {device, options, result} = await enroll(api);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {ok: true});
  assert.deepEqual(result.user, owner);
  assert.match(result.cookie, /Max-Age=0$/);
  const row = db.sqlite.prepare('SELECT * FROM charisna_passkeys').get();
  assert.equal(row.credential_id, device.id);
  assert.equal(row.owner_id, owner.id);
  assert.equal(row.owner_email, owner.email);
  assert.ok(row.public_key.length > 32);
  assert.equal(row.counter, 0);
  assert.equal((await api.verifyRegistration(owner, headersFor(options), device.registration(options.body))).status, 400);
  assert.equal((await api.status(owner)).body.count, 1);
});

test('signed authentication unlocks only the stored owner and atomically advances counter', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  const {device} = await enroll(api);
  const options = await api.authenticationOptions(owner);
  assert.equal(options.status, 200);
  assert.equal(options.body.rpId, 'charisna.example');
  assert.equal(options.body.userVerification, 'required');
  assert.deepEqual(options.body.allowCredentials.map(x => x.id), [device.id]);
  const response = device.assertion(options.body);
  const result = await api.verifyAuthentication(owner, headersFor(options), response);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {ok: true});
  assert.deepEqual(result.user, owner);
  assert.match(result.cookie, /Max-Age=0$/);
  assert.equal(db.sqlite.prepare('SELECT counter FROM charisna_passkeys').get().counter, 1);
  assert.equal((await api.verifyAuthentication(owner, headersFor(options), response)).status, 400);
  const next = await api.authenticationOptions(owner);
  assert.equal((await api.verifyAuthentication(owner, headersFor(next), device.assertion(next.body, {counter: 1}))).status, 400);
});

test('authentication options without registered credentials never offer discoverable login', async () => {
  const api = createOwnerPasskeys({env, db: database()});
  assert.equal((await api.authenticationOptions(owner)).status, 409);
});

test('revoke removes every owner passkey and outstanding challenge without touching other data', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  await enroll(api); await enroll(api); await api.authenticationOptions(owner);
  db.sqlite.exec("CREATE TABLE connector_state (payload TEXT); INSERT INTO connector_state VALUES ('retained')");
  assert.deepEqual(await api.revoke(owner), {status: 200, body: {ok: true}, cookie: '__Host-charisna-passkey=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
  assert.equal((await api.status(owner)).body.count, 0);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM charisna_passkey_challenges').get().n, 0);
  assert.equal(db.sqlite.prepare('SELECT payload FROM connector_state').get().payload, 'retained');
});

test('registration rejects a cross-platform authenticator even with valid self-attestation', async () => {
  const api = createOwnerPasskeys({env, db: database()}); const device = authenticator();
  const options = await api.registrationOptions(owner);
  const response = device.registration(options.body); response.authenticatorAttachment = 'cross-platform';
  assert.equal((await api.verifyRegistration(owner, headersFor(options), response)).status, 400);
  assert.equal((await api.status(owner)).body.count, 0);
});

test('concurrent options leave only one outstanding owner challenge', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  const results = await Promise.all(Array.from({length: 12}, () => api.registrationOptions(owner)));
  assert.ok(results.every(x => x.status === 200));
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM charisna_passkey_challenges').get().n, 1);
});

test('oversized registration responses fail closed before credential verification', async () => {
  const api = createOwnerPasskeys({env, db: database()}); const device = authenticator();
  const options = await api.registrationOptions(owner); const response = device.registration(options.body);
  response.unexpected = 'x'.repeat(65536);
  assert.equal((await api.verifyRegistration(owner, headersFor(options), response)).status, 400);
  assert.equal((await api.status(owner)).body.count, 0);
});

test('oversized assertion responses fail closed without advancing credential counter', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db}); const {device} = await enroll(api);
  const options = await api.authenticationOptions(owner); const response = device.assertion(options.body);
  response.unexpected = 'x'.repeat(65536);
  assert.equal((await api.verifyAuthentication(owner, headersFor(options), response)).status, 400);
  assert.equal(db.sqlite.prepare('SELECT counter FROM charisna_passkeys').get().counter, 0);
});

test('real signed registration rejects origin, RP, challenge, UV, presence and signature violations', async () => {
  const cases = [
    {client: {origin: 'https://evil.example'}}, {rpID: 'evil.example'},
    {client: {challenge: b64(randomBytes(32))}}, {flags: 0x41}, {flags: 0x44},
    {badSignature: true}, {client: {crossOrigin: true, topOrigin: 'https://evil.example'}}
  ];
  for (const overrides of cases) {
    const api = createOwnerPasskeys({env, db: database()}); const device = authenticator();
    const options = await api.registrationOptions(owner);
    const result = await api.verifyRegistration(owner, headersFor(options), device.registration(options.body, overrides));
    assert.equal(result.status, 400, JSON.stringify(overrides));
    assert.equal((await api.status(owner)).body.count, 0);
  }
});

test('real signed assertion rejects origin, RP, challenge, UV, presence, unknown keys and bad signatures', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db}); const {device} = await enroll(api);
  const cases = [
    {client: {origin: 'https://evil.example'}}, {rpID: 'evil.example'},
    {client: {challenge: b64(randomBytes(32))}}, {flags: 1}, {flags: 4},
    {badSignature: true}, {client: {crossOrigin: true, topOrigin: 'https://evil.example'}}
  ];
  for (const overrides of cases) {
    const options = await api.authenticationOptions(owner);
    const result = await api.verifyAuthentication(owner, headersFor(options), device.assertion(options.body, overrides));
    assert.equal(result.status, 400, JSON.stringify(overrides));
    assert.equal(db.sqlite.prepare('SELECT counter FROM charisna_passkeys').get().counter, 0);
    assert.equal((await api.verifyAuthentication(owner, headersFor(options), device.assertion(options.body))).status, 400, 'invalid attempts consume challenge');
  }
  const options = await api.authenticationOptions(owner);
  assert.equal((await api.verifyAuthentication(owner, headersFor(options), authenticator().assertion(options.body))).status, 400);
});

test('challenge cookies reject tampering, wrong purpose, expiry, duplicate cookies, foreign origin and other identities', async () => {
  const db = database(); let time = 1000; const api = createOwnerPasskeys({env, db, now: () => time});
  const {device} = await enroll(api);
  const options = await api.authenticationOptions(owner); const response = device.assertion(options.body);
  const headers = headersFor(options);
  const token = headers.cookie.split('=')[1];
  for (const bad of [
    {}, {...headers, origin: 'https://evil.example'},
    {...headers, cookie: headers.cookie + '; ' + headers.cookie},
    {...headers, cookie: '__Host-charisna-passkey=' + (token[0] === 'A' ? 'B' : 'A') + token.slice(1)}
  ]) assert.equal((await api.verifyAuthentication(owner, bad, response)).status, 400);
  assert.equal((await api.verifyAuthentication({...owner, id: 'b92fabbe-f86b-47d7-891d-dca41911d760'}, headers, response)).status, 400);
  const wrongKey = createOwnerPasskeys({env: {...env, SESSION_SECRET: env.SESSION_SECRET + '-different'}, db, now: () => time});
  assert.equal((await wrongKey.verifyAuthentication(owner, headers, response)).status, 400);
  const wrongOrigin = createOwnerPasskeys({env: {...env, SITE_ORIGIN: 'https://different.example'}, db, now: () => time});
  assert.equal((await wrongOrigin.verifyAuthentication(owner, {...headers, origin: 'https://different.example'}, response)).status, 400);
  assert.equal((await api.verifyRegistration(owner, headers, response)).status, 400);
  time = 301000;
  assert.equal((await api.verifyAuthentication(owner, headers, response)).status, 400);
});

test('atomic challenge consumption permits exactly one concurrent assertion verification', async () => {
  const api = createOwnerPasskeys({env, db: database()}); const {device} = await enroll(api);
  const options = await api.authenticationOptions(owner); const response = device.assertion(options.body);
  const results = await Promise.all(Array.from({length: 6}, () => api.verifyAuthentication(owner, headersFor(options), response)));
  assert.equal(results.filter(x => x.status === 200).length, 1);
  assert.equal(results.filter(x => x.status === 400).length, 5);
});

test('registration bounds credentials to five and rejects duplicate credential IDs', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  const {device} = await enroll(api);
  assert.equal((await enroll(api, device)).result.status, 409);
  for (let i = 0; i < 4; i++) assert.equal((await enroll(api)).result.status, 200);
  assert.equal((await api.registrationOptions(owner)).status, 409);
  assert.deepEqual((await api.status(owner)).body, {ok: true, enabled: true, count: 5, maxCredentials: 5});
});

test('factory reports configuration readiness and registration uses a stable owner handle', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db});
  assert.equal(api.configured, true);
  assert.equal(createOwnerPasskeys({env}).configured, false);
  assert.equal(createOwnerPasskeys({env: {...env, SESSION_SECRET: 'short'}, db}).configured, false);
  const first = await api.registrationOptions(owner); const second = await api.registrationOptions(owner);
  assert.equal(first.body.user.id, b64(Buffer.from(owner.id)));
  assert.equal(first.body.user.id, second.body.user.id);
});

test('zero-counter authenticators are accepted while challenges remain one-time', async () => {
  const api = createOwnerPasskeys({env, db: database()}); const {device} = await enroll(api);
  for (let i = 0; i < 2; i++) {
    const options = await api.authenticationOptions(owner);
    const response = device.assertion(options.body, {counter: 0});
    assert.equal((await api.verifyAuthentication(owner, headersFor(options), response)).status, 200);
    assert.equal((await api.verifyAuthentication(owner, headersFor(options), response)).status, 400);
  }
});

test('credential counter compare-and-swap rejects writes racing another verification', async () => {
  const db = database(); const api = createOwnerPasskeys({env, db}); const {device} = await enroll(api);
  const options = await api.authenticationOptions(owner);
  const original = db.prepare.bind(db);
  db.prepare = sql => {
    if (sql.startsWith('UPDATE charisna_passkeys SET counter')) {
      db.sqlite.prepare('UPDATE charisna_passkeys SET counter = 3').run();
    }
    return original(sql);
  };
  assert.equal((await api.verifyAuthentication(owner, headersFor(options), device.assertion(options.body))).status, 400);
});

test('configured owner ID denies a different owner identity on every endpoint', async () => {
  const api = createOwnerPasskeys({env: {...env, OWNER_USER_ID: 'b92fabbe-f86b-47d7-891d-dca41911d760'}, db: database()});
  for (const method of ['registrationOptions','verifyRegistration','authenticationOptions','verifyAuthentication','status','revoke']) {
    assert.equal((await api[method](owner, {}, {})).status, 403, method);
  }
});

test('missing or failed D1 and invalid security configuration fail closed', async () => {
  for (const settings of [
    {env}, {env, db: {prepare() {throw new Error('offline');}}},
    {env: {...env, SITE_ORIGIN: 'http://localhost'}, db: database()},
    {env: {...env, SESSION_SECRET: 'short'}, db: database()},
    {env: {...env, OWNER_USER_ID: 'invalid'}, db: database()}
  ]) {
    const api = createOwnerPasskeys(settings);
    for (const method of ['registrationOptions','authenticationOptions','status','revoke']) {
      assert.equal((await api[method](owner)).status, 503, method);
    }
  }
});
