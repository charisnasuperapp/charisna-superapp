import { createHash } from 'node:crypto';

// Object keys and set-like fixture arrays are normalized recursively.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const stringify = value => JSON.stringify(canonical(value));
const keyOf = s => stringify(Object.fromEntries(['source_instance_id', 'business_id', 'scope', 'period_start', 'period_end_exclusive', 'timezone', 'basis', 'metric_id', 'currency', 'scale'].map(field => [field, s[field]])));

const integer = value => typeof value === 'string' && /^(0|-?[1-9]\d*)$/.test(value);
const validIds = ids => Array.isArray(ids) && ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;
const sameIds = (a, b) => a.size === b.size && [...a].every(id => b.has(id));
const timestamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(value) ? Date.parse(value) : NaN;

function validateSnapshot(snapshot, manifest) {
  if (snapshot?.environment !== 'demo' || (manifest != null && manifest.environment !== 'demo')) throw new Error('DEMO_ONLY');
  if (['source_instance_id', 'business_id', 'metric_id', 'basis', 'currency', 'timezone'].some(field => typeof snapshot[field] !== 'string' || !snapshot[field])
    || !snapshot.scope || typeof snapshot.scope !== 'object' || Array.isArray(snapshot.scope)
    || !Number.isSafeInteger(snapshot.scale) || snapshot.scale < 0) throw new Error('INVALID_CONTEXT');
  if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) throw new Error('INVALID_REVISION');
  const [start, end, cutoff, received] = ['period_start', 'period_end_exclusive', 'complete_through', 'received_at'].map(field => timestamp(snapshot[field]));
  if (![start, end, cutoff, received].every(Number.isFinite) || !(start < end && start <= cutoff && cutoff < end && cutoff <= received)) throw new Error('INVALID_TIME');
  if (!Array.isArray(snapshot.rows)) throw new Error('INVALID_ROWS');
  const ids = new Set();
  for (const row of snapshot.rows) {
    if (typeof row?.id !== 'string' || !row.id) throw new Error('INVALID_ROW_ID');
    if (ids.has(row.id)) throw new Error('DUPLICATE_ROW_ID');
    ids.add(row.id);
    if (!integer(row.amount_minor)) throw new Error('INVALID_AMOUNT');
  }
}

function manifestHasEvidence(manifest) {
  return manifest && Number.isSafeInteger(manifest.revision) && manifest.revision > 0
    && Number.isFinite(timestamp(manifest.complete_through)) && integer(manifest.amount_minor)
    && Number.isSafeInteger(manifest.record_count) && manifest.record_count >= 0
    && validIds(manifest.row_ids) && validIds(manifest.coverage?.covered_ids)
    && validIds(manifest.coverage?.expected_ids) && typeof manifest.coverage.unit === 'string' && !!manifest.coverage.unit;
}

// Demo calculation only; this module does not provide durable storage.
export function createDemoEngine() {
  const snapshots = new Map();
  return {
    storage: 'demo in-memory Map; not durable',
    get size() { return snapshots.size; },
    get(context) { return structuredClone(snapshots.get(keyOf(context))?.metric ?? null); },
    ingest(snapshot, manifest) {
      validateSnapshot(snapshot, manifest);
      const key = keyOf(snapshot);
      const fingerprint = createHash('sha256').update(stringify({ snapshot, manifest })).digest('hex');
      const previous = snapshots.get(key);
      if (previous && snapshot.revision < previous.metric.revision) throw new Error('OLD_REVISION');
      if (previous && snapshot.revision === previous.metric.revision) {
        if (previous.fingerprint !== fingerprint) throw new Error('REVISION_CONFLICT');
        return { accepted: true, idempotent: true, metric: structuredClone(previous.metric) };
      }
      const amount = snapshot.rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n);
      const ids = new Set(snapshot.rows.map(row => row.id));
      const evidence = manifestHasEvidence(manifest);
      const manifestIds = evidence ? new Set(manifest.row_ids) : new Set();
      const missing = [...manifestIds].filter(id => !ids.has(id)).sort();
      const extra = [...ids].filter(id => !manifestIds.has(id)).sort();
      const covered = new Set(snapshot.rows.map(row => row.coverage_id ?? row.id));
      const expected = evidence ? manifest.coverage.expected_ids : [];
      const matched = expected.filter(id => covered.has(id)).length;
      let quality_status = 'verified';
      let reason_code = 'MATCHED';
      if (!manifest) { quality_status = 'provisional'; reason_code = 'MANIFEST_MISSING'; }
      else if (!evidence) { quality_status = 'provisional'; reason_code = 'MANIFEST_EVIDENCE_MISSING'; }
      else if (keyOf(manifest) !== key || manifest.revision !== snapshot.revision || manifest.complete_through !== snapshot.complete_through) {
        quality_status = 'mismatch'; reason_code = 'MANIFEST_BINDING_MISMATCH';
      } else if (manifest.record_count !== snapshot.rows.length || manifest.record_count !== manifest.row_ids.length || missing.length || extra.length) {
        quality_status = 'mismatch'; reason_code = 'ROW_IDENTITY_MISMATCH';
      } else if (!sameIds(covered, new Set(manifest.coverage.covered_ids)) || [...covered].some(id => !expected.includes(id))) {
        quality_status = 'mismatch'; reason_code = 'COVERAGE_IDENTITY_MISMATCH';
      } else if (amount !== BigInt(manifest.amount_minor)) { quality_status = 'mismatch'; reason_code = 'TOTAL_MISMATCH'; }
      else if (matched < expected.length) { quality_status = 'incomplete'; reason_code = 'COVERAGE_INCOMPLETE'; }
      const { rows: _rows, ...context } = snapshot;
      const comparisonAmount = integer(manifest?.amount_minor) ? manifest.amount_minor : null;
      const metric = {
        ...context, amount_minor: amount.toString(), quality_status, reason_code,
        coverage: { matched, total: evidence ? expected.length : null, unit: manifest?.coverage?.unit ?? 'records' },
        comparison: { amount_minor: comparisonAmount, delta_minor: comparisonAmount === null ? null : (BigInt(comparisonAmount) - amount).toString(), missing_ids: missing, extra_ids: extra },
      };
      snapshots.set(key, { fingerprint, metric: structuredClone(metric) });
      return { accepted: true, idempotent: false, metric: structuredClone(metric) };
    },
  };
}
