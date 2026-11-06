import { createPosFixture, createKostFixture } from './fixtures.mjs';
import { createDemoEngine } from './reconcile.mjs';

// Read-only baseline. A fresh isolated demo engine prevents lab state leaking into UI.
export function getDemoOverview() {
  const engine = createDemoEngine();
  const pos = createPosFixture();
  const kost = createKostFixture();
  const provenance = { kind: 'synthetic_fixture', environment: 'demo', storage: engine.storage, authoritative_for_real_data: false };
  const businesses = [
    engine.ingest(pos.baseline, pos.manifest).metric,
    { ...engine.ingest(kost.rent, kost.manifest).metric, note: 'Dana titipan penyewa dicatat pada metrik terpisah; bukan pendapatan sewa.' },
    {
      environment: 'demo', business_id: 'usaha-contoh', source_instance_id: 'demo-unconnected-01',
      name: 'Usaha Contoh', metric_id: 'sales', metric_label: 'Penjualan tercatat', basis: 'unconnected',
      scope: { branch: 'utama' }, period_start: pos.baseline.period_start,
      period_end_exclusive: pos.baseline.period_end_exclusive, timezone: 'Asia/Jakarta',
      currency: 'IDR', scale: 0, amount_minor: null, quality_status: 'unavailable',
      reason_code: 'CONNECTOR_NOT_CONNECTED', status_label: 'Belum terhubung',
      complete_through: null, received_at: null,
      coverage: { matched: 0, total: null, unit: 'struk' },
      comparison: { amount_minor: null, delta_minor: null, missing_ids: [] },
    },
  ].map(metric => ({ ...metric, provenance: { ...provenance } }));
  return {
    environment: 'demo', period_label: '1–6 November 2026', businesses,
    personal: {
      environment: 'demo', name: 'Money Management', metric_id: 'sample_balance',
      metric_label: 'Saldo contoh', amount_minor: '8750000', currency: 'IDR', scale: 0,
      initially_hidden: true, quality_status: 'provisional', reason_code: 'SYNTHETIC_SAMPLE',
      as_of: '2026-11-06T10:05:00+07:00', timezone: 'Asia/Jakarta',
      provenance: { ...provenance },
      note: 'Penutup saldo hanya kenyamanan visual, bukan kontrol akses. Tidak ada data pribadi nyata.',
    },
  };
}
