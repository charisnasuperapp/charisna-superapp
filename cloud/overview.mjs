export const money = minor => minor == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(minor) / 100);
export const monthLabel = key => new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

export function mount({ document = globalThis.document, window = globalThis.window, fetchImpl = globalThis.fetch } = {}) {
  const $ = selector => document.querySelector(selector);
  if (document.createElement && $('.page-heading')) {
    const nav = document.createElement('nav'); nav.className = 'source-tabs'; nav.setAttribute('aria-label', 'Sumber data');
    const teaching = document.createElement('a'); teaching.href = '/'; teaching.className = 'button primary'; teaching.setAttribute('aria-current', 'page'); teaching.textContent = 'Teaching Pay Audit';
    const moneyTab = document.createElement('a'); moneyTab.href = '/money'; moneyTab.className = 'button secondary'; moneyTab.textContent = 'Money Management';
    const posTab = document.createElement('a'); posTab.href = '/pos'; posTab.className = 'button secondary'; posTab.textContent = 'Bumi Makmur POS';
    const kostTab = document.createElement('a'); kostTab.href = '/kost'; kostTab.className = 'button secondary'; kostTab.textContent = 'CHARISNA KOST';
    nav.append(teaching, moneyTab, posTab, kostTab); $('.page-heading').before(nav);
  }
  let connecting = false;
  function showConnection(message = '') {
    $('#summary-panel').hidden = true;
    $('#connect-panel').hidden = false;
    $('#connect-panel').classList.add('fade-in');
    $('#connect-status').textContent = message;
    $('#load-status').hidden = true;
    const skeleton = $('#skeleton-panel');
    if (skeleton) skeleton.hidden = true;
  }
  function showSummary(data) {
    $('#connect-panel').hidden = true;
    $('#summary-panel').hidden = false;
    $('#summary-panel').classList.add('fade-in');
    $('#load-status').hidden = true;
    const skeleton = $('#skeleton-panel');
    if (skeleton) skeleton.hidden = true;

    const rawMonths = Array.isArray(data.months) ? [...data.months].sort((a, b) => b.month.localeCompare(a.month)) : [];
    const latestActive = rawMonths.find(m => m.hours > 0 || Number(m.pay_minor) > 0) || rawMonths[0];

    $('#period').textContent = latestActive ? monthLabel(latestActive.month) : 'Belum ada bulan tercatat';
    $('#latest-pay').textContent = latestActive ? money(latestActive.pay_minor) : '—';
    $('#latest-hours').textContent = latestActive ? `${latestActive.hours} jam` : '—';
    $('#latest-days').textContent = latestActive ? `${latestActive.teaching_days} hari mengajar` : 'Belum ada catatan bulan';

    const years = Array.isArray(data.years) ? [...data.years].sort((a, b) => b.year.localeCompare(a.year)) : [];
    const currentYear = years[0];
    $('#latest-year-pay').textContent = currentYear ? money(currentYear.pay_minor) : '—';
    $('#latest-year-hours').textContent = currentYear ? `${currentYear.hours} jam` : '—';
    $('#latest-year').textContent = currentYear ? `Tahun ${currentYear.year}` : 'Belum ada catatan tahun';
    $('#quality').textContent = data.state === 'stale' ? 'Data tertunda' : 'Dibaca dari sumber';
    $('#quality').className = `badge ${data.state === 'stale' ? 'stale' : 'verified'}`;
    $('#sync-time').textContent = data.synced_at ? `Dibaca ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(data.synced_at))} WIB` : 'Waktu sinkron belum tersedia';

    // Populate all months for each recorded year (e.g. 12 months per year)
    const monthMap = new Map();
    for (const m of rawMonths) monthMap.set(m.month, m);

    const yearSet = new Set(years.map(y => String(y.year)));
    if (!yearSet.size && rawMonths.length) {
      for (const m of rawMonths) yearSet.add(m.month.slice(0, 4));
    }
    if (!yearSet.size) yearSet.add(String(new Date().getFullYear()));

    const allMonths = [];
    for (const y of [...yearSet].sort((a, b) => b.localeCompare(a))) {
      for (let m = 12; m >= 1; m--) {
        const key = `${y}-${String(m).padStart(2, '0')}`;
        if (monthMap.has(key)) {
          allMonths.push(monthMap.get(key));
        } else {
          allMonths.push({
            month: key,
            hours: 0,
            teaching_days: 0,
            pay_minor: '0',
            currency: 'USD',
            scale: 2
          });
        }
      }
    }

    if ($('#month-count-pill')) {
      $('#month-count-pill').textContent = `${allMonths.length} Bulan (Gulir)`;
    }

    const maxHours = Math.max(1, ...allMonths.map(m => m.hours || 0));
    const rows = $('#month-rows');
    rows.replaceChildren();
    for (const item of allMonths) {
      const row = document.createElement('tr');
      const isZero = !item.hours && !Number(item.pay_minor);
      const isLatest = latestActive && item.month === latestActive.month;
      if (isLatest) row.className = 'row-current';
      else if (isZero) row.className = 'row-zero';

      // 1. Bulan cell
      const monthCell = document.createElement('td');
      const monthWrap = document.createElement('div');
      monthWrap.className = 'cell-month-wrap';
      const monthName = document.createElement('span');
      monthName.className = 'month-name';
      monthName.textContent = monthLabel(item.month);
      monthWrap.append(monthName);
      if (isLatest) {
        const currentBadge = document.createElement('span');
        currentBadge.className = 'badge-mini current';
        currentBadge.textContent = 'Terbaru';
        monthWrap.append(currentBadge);
      }
      monthCell.append(monthWrap);

      // 2. Jam cell with micro visual track
      const hoursCell = document.createElement('td');
      const hoursWrap = document.createElement('div');
      hoursWrap.className = 'metric-cell-wrap';
      const hoursVal = document.createElement('span');
      hoursVal.className = 'hours-val';
      hoursVal.textContent = `${item.hours} jam`;
      hoursWrap.append(hoursVal);
      if (item.hours > 0) {
        const barTrack = document.createElement('span');
        barTrack.className = 'mini-bar-track';
        const barFill = document.createElement('span');
        barFill.className = 'mini-bar-fill';
        barFill.style.width = `${Math.min(100, Math.round((item.hours / maxHours) * 100))}%`;
        barTrack.append(barFill);
        hoursWrap.append(barTrack);
      }
      hoursCell.append(hoursWrap);

      // 3. Hari cell with pill
      const daysCell = document.createElement('td');
      const daysPill = document.createElement('span');
      daysPill.className = item.teaching_days > 0 ? 'days-pill' : 'days-pill zero';
      daysPill.textContent = String(item.teaching_days);
      daysCell.append(daysPill);

      // 4. Gaji cell with highlight
      const payCell = document.createElement('td');
      const payTag = document.createElement('span');
      payTag.className = Number(item.pay_minor) > 0 ? 'pay-highlight' : 'pay-zero';
      payTag.textContent = money(item.pay_minor);
      payCell.append(payTag);

      row.append(monthCell, hoursCell, daysCell, payCell);
      rows.append(row);
    }

    const yearRows = $('#year-rows');
    yearRows.replaceChildren();
    for (const item of years) {
      const row = document.createElement('tr');
      const yearCell = document.createElement('td');
      const strong = document.createElement('strong');
      strong.textContent = `Tahun ${item.year}`;
      yearCell.append(strong);
      const hoursCell = document.createElement('td');
      hoursCell.textContent = `${item.hours} jam`;
      const daysCell = document.createElement('td');
      const daysPill = document.createElement('span');
      daysPill.className = 'days-pill';
      daysPill.textContent = String(item.teaching_days);
      daysCell.append(daysPill);
      const payCell = document.createElement('td');
      const payTag = document.createElement('span');
      payTag.className = 'pay-highlight';
      payTag.textContent = money(item.pay_minor);
      payCell.append(payTag);
      row.append(yearCell, hoursCell, daysCell, payCell);
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
      else showConnection(data.state === 'needs_reconnect' ? 'Koneksi MySalary perlu dihubungkan kembali.' : 'Belum terhubung ke MySalary.');
    } catch {
      $('#load-status').textContent = 'Ringkasan belum tersedia. Periksa koneksi lalu muat ulang.';
      const skeleton = $('#skeleton-panel');
      if (skeleton) skeleton.hidden = true;
    }
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
