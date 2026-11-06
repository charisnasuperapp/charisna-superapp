import { createPosFixture } from '../demo/fixtures.mjs';
import { createDemoEngine } from '../demo/reconcile.mjs';

// Developer-only CLI; deliberately not imported by the dashboard overview.
const engine = createDemoEngine();
const { baseline, complete, manifest } = createPosFixture();
const initial = engine.ingest(baseline, manifest);
// Replacement is a new revision, bound to the same source cutoff.
const replacement = { ...complete, revision: 2 };
const replacementManifest = { ...manifest, revision: 2 };
const completed = engine.ingest(replacement, replacementManifest);
const retry = engine.ingest(replacement, replacementManifest);
console.log(JSON.stringify({
  environment: 'demo', storage: engine.storage,
  steps: [
    { step: 'mismatch', ...initial },
    { step: 'complete', ...completed },
    { step: 'retry', ...retry },
  ],
  active_snapshot_count: engine.size,
}, null, 2));
