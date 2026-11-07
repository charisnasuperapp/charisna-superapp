export const money = minor => minor == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(minor) / 100);
export const monthLabel = key => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

export function mount({ document = globalThis.document, window = globalThis.window, fetchImpl = globalThis.fetch } = {}) {
  const $ = selector => document.querySelector(selector);
  let connecting = false;
  function showConnection(message = '') {
    $('#summary-panel').hidden = true;
    $('#connect-panel').hidden = false;
    $('#connect-status').textContent = message;
    $('#load-status').hidden = true;
  }
  function showSummary(data) {
    $('#connect-panel').hidden = true;
    $('#summary-panel').hidden = false;
    $('#load-status').hidden = true;
    const months = Array.isArray(data.months) ? [...data.months].sort((a, b) => b.month.localeCompare(a.month)) : [];
    const current = months[0];
    $('#period').textContent = current ? monthLabel(current.month) : 'Belum ada bulan tercatat';
    $('#latest-pay').textContent = current ? money(current.pay_minor) : '—';
    $('#latest-hours').textContent = current ? `${current.hours} jam` : '—';
    $('#latest-days').textContent = current ? `${current.teaching_days} hari mengajar` : 'Belum ada catatan bulan';
    const years = Array.isArray(data.years) ? [...data.years].sort((a, b) => b.year.localeCompare(a.year)) : [];
    const currentYear = years[0];
    $('#latest-year-pay').textContent = currentYear ? money(currentYear.pay_minor) : '—';
    $('#latest-year-hours').textContent = currentYear ? `${currentYear.hours} jam` : '—';
    $('#latest-year').textContent = currentYear ? `Tahun ${currentYear.year}` : 'Belum ada catatan tahun';
    $('#quality').textContent = data.state === 'stale' ? 'Data tertunda' : 'Dibaca dari sumber';
    $('#quality').className = `badge ${data.state === 'stale' ? 'stale' : 'verified'}`;
    $('#sync-time').textContent = data.synced_at ? `Dibaca ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(data.synced_at))} WIB` : 'Waktu sinkron belum tersedia';
    const rows = $('#month-rows');
    rows.replaceChildren();
    for (const item of months) {
      const row = document.createElement('tr');
      for (const value of [monthLabel(item.month), `${item.hours} jam`, String(item.teaching_days), money(item.pay_minor)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      rows.append(row);
    }
    const yearRows = $('#year-rows');
    yearRows.replaceChildren();
    for (const item of years) {
      const row = document.createElement('tr');
      for (const value of [item.year, `${item.hours} jam`, String(item.teaching_days), money(item.pay_minor)]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      yearRows.append(row);
    }
  }
  async function load() {
    try {
      const response = await fetchImpl('/overview.json', { cache: 'no-store' });
      if (response.status === 423) { window.location.replace('/unlock'); return; }
      if (response.status === 401) { window.location.replace('/login'); return; }
      if (!response.ok) throw Error('source');
      const data = await response.json();
      if (data.state === 'connected' || data.state === 'stale') showSummary(data);
      else showConnection(data.state === 'needs_reconnect' ? 'Koneksi MySalary kedaluwarsa. Hubungkan kembali.' : 'Belum terhubung ke MySalary.');
    } catch { $('#load-status').textContent = 'Ringkasan belum tersedia. Periksa koneksi lalu muat ulang.'; }
  }
  $('#connect-form').addEventListener('submit', async event => {
    event.preventDefault(); if (connecting) return;
    connecting = true; $('#connect-button').disabled = true; $('#connect-status').textContent = 'Menghubungkan…';
    const email = $('#source-email').value.trim();
    const password = $('#source-password').value;
    $('#source-password').value = '';
    try {
      const configResponse = await fetchImpl('/connector/config', { cache: 'no-store' });
      if (configResponse.status === 401) { window.location.replace('/login'); return; }
      if (!configResponse.ok) throw Error('config');
      const { apiKey } = await configResponse.json();
      const auth = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }), cache: 'no-store'
      });
      if (!auth.ok) throw Error('signin');
      const { idToken, refreshToken } = await auth.json();
      const linked = await fetchImpl('/connector/connect', post({ idToken, refreshToken }));
      if (linked.status === 401) { window.location.replace('/login'); return; }
      if (!linked.ok) throw Error('connect');
      await load();
    } catch { $('#connect-status').textContent = 'Gagal menghubungkan. Periksa akun MySalary dan coba lagi.'; }
    finally { connecting = false; $('#connect-button').disabled = false; }
  });
  $('#disconnect-button').addEventListener('click', async () => {
    $('#disconnect-button').disabled = true;
    try {
      const response = await fetchImpl('/connector/disconnect', post({}));
      if (response.status === 423) { window.location.replace('/unlock'); return; }
      if (response.status === 401) { window.location.replace('/login'); return; }
      if (!response.ok) throw Error('disconnect');
      showConnection('Koneksi terputus.');
    } catch { $('#sync-time').textContent = 'Belum dapat memutus koneksi. Coba lagi.'; }
    finally { $('#disconnect-button').disabled = false; }
  });
  $('#logout-form').addEventListener('submit', async event => {
    event.preventDefault(); $('#summary-panel').hidden = true; $('#connect-panel').hidden = true;
    try { await fetchImpl('/auth/logout', post({})); } finally { window.location.replace('/login'); }
  });
  window.addEventListener('pagehide', () => { $('#summary-panel').hidden = true; });
  return { ready: load() };
}
if (typeof document !== 'undefined') mount();
