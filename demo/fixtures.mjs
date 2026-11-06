// Synthetic demo fixtures only. No source application data or connections.
export function createKostFixture() {
  const context = {
    ...period, business_id: 'charisna-kost', source_instance_id: 'demo-kost-01',
    name: 'CHARISNA Kost', metric_id: 'rent_received', metric_label: 'Sewa tercatat masuk',
    basis: 'rent_receipts_excluding_deposit', scope: { property: 'utama' }, revision: 1,
    complete_through: '2026-11-06T09:30:00+07:00', received_at: '2026-11-06T09:42:00+07:00',
  };
  const rooms = Array.from({ length: 20 }, (_, i) => `room-${String(i + 1).padStart(2, '0')}`);
  const rows = rooms.slice(0, 17).map((room, i) => ({ id: `rent-${room}`, coverage_id: room, amount_minor: i < 16 ? '250000' : '200000' }));
  const rent = { ...context, rows };
  const manifest = {
    ...context, amount_minor: rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n).toString(),
    row_ids: rows.map(row => row.id), record_count: rows.length,
    coverage: { covered_ids: rooms.slice(0, 17), expected_ids: rooms, unit: 'kamar' },
  };
  const deposit = { ...context, metric_id: 'tenant_deposit', metric_label: 'Dana titipan penyewa', basis: 'deposit_liability', rows: [{ id: 'deposit-room-01', coverage_id: 'room-01', amount_minor: '500000' }] };
  return { rent, manifest, deposit };
}
const period = {
  environment: 'demo', period_start: '2026-11-01T00:00:00+07:00',
  period_end_exclusive: '2026-11-07T00:00:00+07:00', timezone: 'Asia/Jakarta',
  currency: 'IDR', scale: 0,
};

export function createPosFixture() {
  const context = {
    ...period, business_id: 'bumi-makmur', source_instance_id: 'demo-pos-01',
    name: 'Bumi Makmur POS', metric_id: 'net_sales',
    metric_label: 'Penjualan bersih di SuperApp', basis: 'net_receipts',
    scope: { branch: 'utama' }, complete_through: '2026-11-06T10:00:00+07:00',
    received_at: '2026-11-06T10:05:00+07:00', revision: 1,
  };
  const source_rows = Array.from({ length: 123 }, (_, i) => ({
    id: `pos-${String(i + 1).padStart(3, '0')}`,
    amount_minor: i < 120 ? '100000' : i === 120 ? '150000' : '125000',
  }));
  const manifest = {
    ...context, amount_minor: source_rows.reduce((sum, row) => sum + BigInt(row.amount_minor), 0n).toString(),
    row_ids: source_rows.map(row => row.id), record_count: source_rows.length,
    coverage: { covered_ids: source_rows.map(row => row.id), expected_ids: source_rows.map(row => row.id), unit: 'struk' },
  };
  const baseline = { ...context, rows: source_rows.slice(0, -2) };
  const complete = { ...context, rows: source_rows.map(row => ({ ...row })) };
  return { source_rows, manifest, baseline, complete };
}
