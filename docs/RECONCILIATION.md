# Synthetic reconciliation demo

Local Node.js standard-library ES modules only. No dependencies, SQL, network calls, production credentials, source-app writes, authentication claims, or durable storage. All fixtures require `environment: 'demo'`. This is an in-memory Map simulation, not a production ingestion service.

## Run

From `C:/Users/ZENNITH/Documents/GitHub/charisna-superapp`:

```sh
node --test tests/reconcile.test.mjs
node lab/run.mjs
```

Verified on Node v24.22.1: **45 tests passed, 0 failed**. The CLI prints calculated JSON, not hard-coded PASS labels.

## UI integration contract

```js
import { getDemoOverview } from './demo/overview.mjs';
const payload = getDemoOverview(); // synchronous and JSON-safe
```

The parent local server can serialize this value for `/demo/overview.json`. No server is implemented by these modules. Do not import `lab/run.mjs` into the UI.

`getDemoOverview()` always creates fresh fixtures and an isolated engine. It returns:

- `environment: 'demo'`, `period_label: '1–6 November 2026'`.
- `businesses`: ordered metric objects for `bumi-makmur`, `charisna-kost`, `usaha-contoh`.
- `personal`: separate `Money Management` sample, `amount_minor: '8750000'`, `initially_hidden: true`. Never included in business amounts. Visual hiding is not authorization; this payload must never contain real personal data.

Every business metric contains `business_id`, `source_instance_id`, `name`, `metric_id`, `metric_label`, `basis`, `scope`, `period_start`, `period_end_exclusive`, `timezone`, `complete_through`, `received_at`, `currency`, `scale`, `amount_minor`, `quality_status`, `reason_code`, `coverage`, `comparison`, and synthetic `provenance`.

Amounts are integer strings or `null`, with IDR scale 0. `comparison.delta_minor` is **manifest minus calculated projection**. `comparison.missing_ids` lists source IDs absent from the projection; `extra_ids`, when present, lists unexpected projection IDs.

| Baseline metric | Calculated amount | Status | Evidence |
|---|---:|---|---|
| Bumi Makmur POS | `12150000` | `mismatch` | 121/123 struk, manifest `12400000`, delta `250000`, missing `pos-122`, `pos-123` |
| CHARISNA Kost | `4200000` | `incomplete` | 17/20 kamar, partial manifest total matches; deposit excluded |
| Usaha Contoh | `null` | `unavailable` | `CONNECTOR_NOT_CONNECTED`, label `Belum terhubung` |

Teaching Pay Audit is not used as the unconnected business.

The selected period is `[2026-11-01T00:00:00+07:00, 2026-11-07T00:00:00+07:00)` in `Asia/Jakarta`. POS complete-through is `2026-11-06T10:00:00+07:00`, received at `2026-11-06T10:05:00+07:00`. Kost complete-through is `2026-11-06T09:30:00+07:00`, received at `2026-11-06T09:42:00+07:00`.

## Fixtures

`demo/fixtures.mjs` exports:

- `createPosFixture()` returns `{ source_rows, baseline, complete, manifest }`. Exactly 123 synthetic rows: 120 × `100000`, one × `150000`, two × `125000`. Baseline omits the final two IDs. Source manifest control amount is calculated independently from all source rows using BigInt.
- `createKostFixture()` returns `{ rent, manifest, deposit }`. Sixteen rent rows × `250000` plus one × `200000`, covering 17 distinct rooms of 20. `deposit` uses separate `tenant_deposit` / `deposit_liability` metric and basis; it never enters the rent projection. Deposit fixture `500000` is illustrative only.

Fixtures are fresh mutable objects per call. Engine state is insulated from subsequent caller mutation.

## Engine API and rules

`demo/reconcile.mjs` exports `createDemoEngine()`:

```js
const engine = createDemoEngine();
const result = engine.ingest(snapshot, manifestOrNull);
// { accepted: true, idempotent: boolean, metric: JSON-safe object }
engine.get(snapshotContext); // cloned current metric, or null
engine.size;                // active normalized scopes, not revisions
engine.storage;             // 'demo in-memory Map; not durable'
```

A snapshot has context fields above, positive safe-integer `revision`, and `rows: [{ id, amount_minor, coverage_id? }]`. Row IDs must be nonempty unique strings. Amounts must be canonical signed integer strings; malformed rows reject the whole snapshot before storage rather than silently changing the financial population. Summation uses BigInt only; it never copies `manifest.amount_minor` into the projection.

The manifest binds the same context, revision, and source cutoff, and supplies `amount_minor`, `record_count`, `row_ids`, and `coverage: { covered_ids, expected_ids, unit }`. These are fixture controls, not authenticated source evidence.

- Scope key includes labeled source instance, business, recursively normalized scope, start/end period, timezone, basis, metric, currency, and scale. Object key order and set-like scope-array order are ignored; string values remain exact. Arrays in this demo contract are unordered collections, not positional tuples.
- Full snapshot replacement, never additive replay. The lab replaces revision 1 with revision 2 at the same source cutoff, then retries revision 2.
- Older revision throws `OLD_REVISION`. Same revision with changed snapshot **or manifest** throws `REVISION_CONFLICT`; identical canonical content returns `idempotent: true` without adding a snapshot.
- Canonical content SHA-256 is computed locally; no sender-provided hash is trusted. This is only retry/conflict detection, not sender authentication.
- Required snapshot context, revision, explicit-offset timestamps, valid period/cutoff ordering, IDs and amounts are validated before storage. Non-demo snapshot or manifest throws `DEMO_ONLY`.
- Missing manifest gives `provisional / MANIFEST_MISSING`; absent or malformed mandatory manifest evidence gives `provisional / MANIFEST_EVIDENCE_MISSING`. Neither can verify.
- Scope/version/cutoff binding, row count and exact identities, coverage identities, and BigInt total must all match. A nominal match alone is insufficient. Partial expected coverage gives `incomplete / COVERAGE_INCOMPLETE`.
- Empty rows yield zero, but zero is verified only with manifest proof of zero population and amount.
- Rejected input leaves the prior snapshot untouched. Result and read operations return clones.

This demo does not implement stale thresholds, production source identity binding, user sessions, owner permissions, durable receipts, or production database commits. Real-data integration remains blocked on those gates.

## Actual verification and TDD evidence

Tests were added in feature slices and run RED before each corresponding implementation, then rerun GREEN:

1. Missing POS calculation: missing fixture/engine assertion failed; then 1/1 passed.
2. Full replacement and retry: missing `get` / idempotent behavior failed; then 3/3 passed.
3. Older revision, conflict and normalized scopes: 3 expected failures; then 6/6 passed.
4. Partial Kost and absent manifest: 2 expected failures; then 8/8 passed.
5. Precision and ingestion/manifest validation: 22 failures exposed missing guards; then 32/32 passed. Precision and identity tests that already exercised the existing calculation remained passing.
6. Overview: missing export failed; then 33/33 passed.
7. Lab subprocess: missing CLI failed; then 34/34 passed. CLI also executed separately.
8. Required snapshot context and mutation isolation: 9 failures; then **45/45 passed**. Zero evidence and positional key-alias regression checks already passed.

The seven handoff scenarios are named `handoff 1` through `handoff 7` in `tests/reconcile.test.mjs`: POS mismatch, complete replacement, retry, older revision, different scope, same nominal with incomplete coverage, missing manifest. Additional checks cover unsafe-number precision, duplicate IDs, canonical ordering, same-revision conflicts, manifest binding, wrong environment, invalid inputs, JSON safety, CLI execution, and overview isolation.

Observed CLI sequence: mismatch `12150000` / delta `250000` / 121 of 123; complete `12400000` / delta `0` / 123 of 123; retry same amount with `idempotent: true`; active snapshot count 1.
