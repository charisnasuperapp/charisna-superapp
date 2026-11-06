import test from 'node:test';
import assert from 'node:assert/strict';

const fixtures = await import('../demo/fixtures.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
const reconciliation = await import('../demo/reconcile.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

const { createDemoEngine } = reconciliation;
const { createPosFixture } = fixtures;

test('handoff 1: POS missing two receipts is calculated from 121 valid rows', () => {
  assert.equal(typeof fixtures.createPosFixture, 'function');
  assert.equal(typeof reconciliation.createDemoEngine, 'function');
  const { baseline, manifest, source_rows } = fixtures.createPosFixture();
  const result = reconciliation.createDemoEngine().ingest(baseline, manifest);
  assert.equal(source_rows.length, 123);
  assert.equal(result.metric.amount_minor, '12150000');
  assert.equal(result.metric.comparison.amount_minor, '12400000');
  assert.equal(result.metric.comparison.delta_minor, '250000');
  assert.deepEqual(result.metric.coverage, { matched: 121, total: 123, unit: 'struk' });
  assert.deepEqual(result.metric.comparison.missing_ids, ['pos-122', 'pos-123']);
  assert.equal(result.metric.quality_status, 'mismatch');
});

test('handoff 2: complete snapshot replaces baseline rather than adding totals', () => {
  const { baseline, manifest, complete } = createPosFixture();
  const engine = createDemoEngine();
  engine.ingest(baseline, manifest);
  const full = { ...complete, revision: 2 };
  const result = engine.ingest(full, { ...manifest, revision: 2 });
  assert.equal(result.metric.amount_minor, '12400000');
  assert.equal(result.metric.quality_status, 'verified');
  assert.equal(result.metric.comparison.delta_minor, '0');
  assert.deepEqual(result.metric.coverage, { matched: 123, total: 123, unit: 'struk' });
  assert.equal(engine.get(full).amount_minor, '12400000');
});

test('handoff 3: identical retry is idempotent and keeps one in-memory snapshot', () => {
  const { complete, manifest } = createPosFixture();
  const engine = createDemoEngine();
  const first = engine.ingest(complete, manifest);
  const retry = engine.ingest(complete, manifest);
  assert.equal(retry.idempotent, true);
  assert.deepEqual(retry.metric, first.metric);
  assert.equal(engine.size, 1);
  assert.equal(engine.storage, 'demo in-memory Map; not durable');
});

test('handoff 4: older revision is rejected without replacing current snapshot', () => {
  const { complete, manifest } = createPosFixture();
  const engine = createDemoEngine();
  engine.ingest({ ...complete, revision: 2 }, { ...manifest, revision: 2 });
  assert.throws(() => engine.ingest(complete, manifest), /OLD_REVISION/);
  assert.equal(engine.get(complete).revision, 2);
});

test('same revision with changed content is rejected, canonical retry ignores key and row order', () => {
  const { complete, manifest } = createPosFixture();
  const engine = createDemoEngine();
  engine.ingest(complete, manifest);
  assert.throws(() => engine.ingest({ ...complete, rows: complete.rows.slice(1) }, manifest), /REVISION_CONFLICT/);
  const reordered = Object.fromEntries(Object.entries(complete).reverse());
  reordered.rows = [...complete.rows].reverse();
  assert.equal(engine.ingest(reordered, { ...manifest, row_ids: [...manifest.row_ids].reverse() }).idempotent, true);
});

test('canonical retry preserves distinct Unicode IDs when rows and manifest IDs are reversed', () => {
  const { complete, manifest } = createPosFixture();
  const ids = ['\u00e9', 'e\u0301'];
  const snapshot = { ...complete, rows: ids.map(id => ({ id, amount_minor: '1' })) };
  const proof = {
    ...manifest, amount_minor: '2', record_count: 2, row_ids: ids,
    coverage: { covered_ids: ids, expected_ids: ids, unit: 'struk' },
  };
  const engine = createDemoEngine();
  const first = engine.ingest(snapshot, proof);
  assert.equal(first.metric.quality_status, 'verified');
  assert.equal(first.metric.amount_minor, '2');
  assert.deepEqual(first.metric.coverage, { matched: 2, total: 2, unit: 'struk' });
  const reversedIds = [...ids].reverse();
  const retry = engine.ingest({ ...snapshot, rows: [...snapshot.rows].reverse() }, {
    ...proof, row_ids: reversedIds,
    coverage: { ...proof.coverage, covered_ids: reversedIds, expected_ids: reversedIds },
  });
  assert.equal(retry.idempotent, true);
  assert.deepEqual(retry.metric, first.metric);
  assert.equal(engine.size, 1);
});

test('handoff 5: normalized scope isolates source, business, branch, period, metric, basis, currency and scale', () => {
  const { complete, manifest } = createPosFixture();
  const engine = createDemoEngine();
  const scope = { branch: 'utama', filters: { region: 'barat', lanes: ['b', 'a'] } };
  engine.ingest({ ...complete, scope }, { ...manifest, scope });
  const reordered = { filters: { lanes: ['a', 'b'], region: 'barat' }, branch: 'utama' };
  assert.equal(engine.get({ ...complete, scope: reordered }).amount_minor, '12400000');
  const changes = [
    { source_instance_id: 'demo-pos-02' }, { business_id: 'other' }, { scope: { branch: 'lain' } },
    { period_end_exclusive: '2026-11-08T00:00:00+07:00' }, { period_start: '2026-10-31T00:00:00+07:00' },
    { metric_id: 'other' }, { basis: 'gross' }, { currency: 'USD' }, { scale: 2 },
  ];
  for (const change of changes) engine.ingest({ ...complete, ...change }, { ...manifest, ...change });
  assert.equal(engine.size, 10);
});

test('handoff 6: Kost matched partial total cannot verify incomplete room coverage; deposits separate', () => {
  assert.equal(typeof fixtures.createKostFixture, 'function');
  const { rent, manifest, deposit } = fixtures.createKostFixture();
  const engine = createDemoEngine();
  const result = engine.ingest(rent, manifest);
  assert.equal(result.metric.amount_minor, '4200000');
  assert.equal(result.metric.comparison.delta_minor, '0');
  assert.equal(result.metric.quality_status, 'incomplete');
  assert.equal(result.metric.reason_code, 'COVERAGE_INCOMPLETE');
  assert.deepEqual(result.metric.coverage, { matched: 17, total: 20, unit: 'kamar' });
  assert.equal(deposit.metric_id, 'tenant_deposit');
  assert.notEqual(deposit.metric_id, rent.metric_id);
  assert.equal(rent.rows.some(row => row.id.startsWith('deposit')), false);
});

test('handoff 7: missing manifest holds verification even with all POS rows', () => {
  const { complete } = createPosFixture();
  const result = createDemoEngine().ingest(complete, null);
  assert.equal(result.metric.amount_minor, '12400000');
  assert.equal(result.metric.quality_status, 'provisional');
  assert.equal(result.metric.reason_code, 'MANIFEST_MISSING');
  assert.equal(result.metric.comparison.amount_minor, null);
});

test('BigInt preserves amounts larger than Number.MAX_SAFE_INTEGER without trusting manifest total', () => {
  const { complete, manifest } = createPosFixture();
  const rows = [{ id: 'huge', amount_minor: '9007199254740993' }, { id: 'one', amount_minor: '1' }];
  const proof = { ...manifest, amount_minor: '9007199254740995', row_ids: ['huge', 'one'], record_count: 2, coverage: { covered_ids: ['huge', 'one'], expected_ids: ['huge', 'one'], unit: 'struk' } };
  const metric = createDemoEngine().ingest({ ...complete, rows }, proof).metric;
  assert.equal(metric.amount_minor, '9007199254740994');
  assert.equal(metric.comparison.delta_minor, '1');
  assert.equal(metric.quality_status, 'mismatch');
});

for (const [name, mutate, error] of [
  ['duplicate receipt ID', s => s.rows.push({ ...s.rows[0] }), /DUPLICATE_ROW_ID/],
  ['non-integer amount', s => { s.rows[0].amount_minor = '1.2'; }, /INVALID_AMOUNT/],
  ['Number amount', s => { s.rows[0].amount_minor = 100000; }, /INVALID_AMOUNT/],
  ['wrong snapshot environment', s => { s.environment = 'production'; }, /DEMO_ONLY/],
  ['missing snapshot environment', s => { delete s.environment; }, /DEMO_ONLY/],
  ['invalid revision', s => { s.revision = -1; }, /INVALID_REVISION/],
  ['invalid period', s => { s.period_end_exclusive = s.period_start; }, /INVALID_TIME/],
  ['cutoff past period', s => { s.complete_through = '2026-11-08T10:00:00+07:00'; }, /INVALID_TIME/],
  ['received before cutoff', s => { s.received_at = '2026-11-06T09:59:00+07:00'; }, /INVALID_TIME/],
]) test(`validation rejects ${name} without storing snapshot`, () => {
  const { complete, manifest } = createPosFixture();
  mutate(complete);
  const engine = createDemoEngine();
  assert.throws(() => engine.ingest(complete, manifest), error);
  assert.equal(engine.size, 0);
});

for (const [name, mutate] of [
  ['cutoff', m => { m.complete_through = '2026-11-06T09:00:00+07:00'; }],
  ['version', m => { m.revision = 2; }],
  ['scope', m => { m.scope = { branch: 'lain' }; }],
  ['currency', m => { m.currency = 'USD'; }],
  ['record count', m => { m.record_count = 122; }],
  ['identity with same count and total', m => { m.row_ids[0] = 'different'; }],
  ['coverage identity with same count', m => { m.coverage.covered_ids[0] = 'different'; }],
  ['extra projection identity', (_m, s) => { s.rows.push({ id: 'extra', amount_minor: '0' }); }],
]) test(`verification withheld for different ${name}`, () => {
  const { complete, manifest } = createPosFixture();
  mutate(manifest, complete);
  assert.notEqual(createDemoEngine().ingest(complete, manifest).metric.quality_status, 'verified');
});

for (const field of ['revision', 'complete_through', 'record_count', 'row_ids', 'coverage']) {
  test(`verification withheld when manifest lacks ${field}`, () => {
    const { complete, manifest } = createPosFixture();
    delete manifest[field];
    const result = createDemoEngine().ingest(complete, manifest);
    assert.equal(result.metric.quality_status, 'provisional');
    assert.equal(result.metric.reason_code, 'MANIFEST_EVIDENCE_MISSING');
  });
}

test('non-demo manifest rejected even if snapshot is demo', () => {
  const { complete, manifest } = createPosFixture();
  assert.throws(() => createDemoEngine().ingest(complete, { ...manifest, environment: 'production' }), /DEMO_ONLY/);
});

test('overview is JSON-safe, baseline-only and separate from lab engine state', async () => {
  const api = await import('../demo/overview.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
    throw error;
  });
  assert.equal(typeof api.getDemoOverview, 'function');
  const overview = api.getDemoOverview();
  assert.equal(overview.period_label, '1–6 November 2026');
  assert.equal(overview.environment, 'demo');
  assert.deepEqual(overview.businesses.map(b => b.business_id), ['bumi-makmur', 'charisna-kost', 'usaha-contoh']);
  assert.deepEqual(overview.businesses.map(b => b.quality_status), ['mismatch', 'incomplete', 'unavailable']);
  assert.deepEqual(overview.businesses.map(b => b.amount_minor), ['12150000', '4200000', null]);
  for (const metric of overview.businesses) {
    for (const field of ['name', 'metric_id', 'metric_label', 'reason_code', 'complete_through', 'received_at', 'coverage', 'comparison', 'scope', 'period_start', 'period_end_exclusive', 'timezone', 'provenance']) assert.ok(field in metric, field);
    assert.equal(metric.currency, 'IDR');
    assert.equal(metric.scale, 0);
    assert.equal(metric.environment, 'demo');
  }
  assert.equal(overview.businesses[0].complete_through, '2026-11-06T10:00:00+07:00');
  assert.equal(overview.businesses[0].received_at, '2026-11-06T10:05:00+07:00');
  assert.equal(overview.businesses[1].complete_through, '2026-11-06T09:30:00+07:00');
  assert.equal(overview.businesses[1].received_at, '2026-11-06T09:42:00+07:00');
  assert.equal(overview.personal.name, 'Money Management');
  assert.equal(overview.personal.amount_minor, '8750000');
  assert.equal(overview.personal.initially_hidden, true);
  assert.deepEqual(JSON.parse(JSON.stringify(overview)), overview);
  overview.businesses[0].amount_minor = '0';
  assert.equal(api.getDemoOverview().businesses[0].amount_minor, '12150000');
});

test('lab CLI emits calculated mismatch, complete and retry without changing overview', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [new URL('../lab/run.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.environment, 'demo');
  assert.deepEqual(output.steps.map(step => step.metric.quality_status), ['mismatch', 'verified', 'verified']);
  assert.deepEqual(output.steps.map(step => step.metric.amount_minor), ['12150000', '12400000', '12400000']);
  assert.equal(output.steps[2].idempotent, true);
  assert.equal(output.active_snapshot_count, 1);
  const { getDemoOverview } = await import('../demo/overview.mjs');
  assert.equal(getDemoOverview().businesses[0].quality_status, 'mismatch');
});

for (const field of ['source_instance_id', 'business_id', 'scope', 'metric_id', 'basis', 'currency', 'scale', 'timezone']) {
  test(`snapshot requires ${field} before entering storage`, () => {
    const { complete, manifest } = createPosFixture();
    delete complete[field];
    assert.throws(() => createDemoEngine().ingest(complete, manifest), /INVALID_CONTEXT/);
  });
}

test('stored metric is insulated from caller mutation of snapshot and returned result', () => {
  const { complete, manifest } = createPosFixture();
  const lookup = structuredClone(complete);
  const engine = createDemoEngine();
  const result = engine.ingest(complete, manifest);
  complete.scope.branch = 'mutated';
  result.metric.coverage.matched = 0;
  assert.equal(engine.get(lookup).scope.branch, 'utama');
  assert.equal(engine.get(lookup).coverage.matched, 123);
});

test('scope component positions cannot alias by swapping business and source', () => {
  const { complete, manifest } = createPosFixture();
  const engine = createDemoEngine();
  engine.ingest(complete, manifest);
  const swapped = { business_id: complete.source_instance_id, source_instance_id: complete.business_id };
  engine.ingest({ ...complete, ...swapped }, { ...manifest, ...swapped });
  assert.equal(engine.size, 2);
});

test('zero is verified only with manifest evidence of zero rows and zero amount', () => {
  const { complete, manifest } = createPosFixture();
  const snapshot = { ...complete, rows: [] };
  const proof = { ...manifest, amount_minor: '0', record_count: 0, row_ids: [], coverage: { covered_ids: [], expected_ids: [], unit: 'struk' } };
  assert.equal(createDemoEngine().ingest(snapshot, proof).metric.quality_status, 'verified');
  assert.equal(createDemoEngine().ingest(snapshot, null).metric.quality_status, 'provisional');
});
