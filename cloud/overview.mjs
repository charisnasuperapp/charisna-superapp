export const money = minor => minor == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(minor) / 100);
export const monthLabel = (key, lang = 'id') => new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
const post = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });

export function mount({ document = globalThis.document, window = globalThis.window, fetchImpl = globalThis.fetch } = {}) {
  const $ = selector => document.querySelector(selector);

  function getLang() {
    try {
      const m = document.cookie ? document.cookie.match(/(?:^|;\s*)charisna_lang=([a-z]{2})/) : null;
      return m ? m[1] : 'id';
    } catch { return 'id'; }
  }
  function setLang(lang) {
    try {
      document.cookie = `charisna_lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`;
      if (document.documentElement) document.documentElement.lang = lang;
    } catch {}
  }

  let currentLang = getLang();

  const i18n = {
    id: {
      eyebrow: 'BERANDA PEMILIK',
      title: 'Ringkasan penghasilan',
      subtitle: 'Data MySalary dibaca langsung dari akun yang Anda hubungkan.',
      tz: 'Waktu Indonesia Barat',
      demoNote: 'Gaji mengajar adalah penghasilan pribadi dalam USD. Nilainya tidak digabung dengan omzet usaha atau saldo.',
      lblMonthPay: 'Gaji bulan terbaru',
      ctxMonthPay: 'USD · penghasilan mengajar, bukan omzet usaha',
      lblMonthHours: 'Jam bulan terbaru',
      lblYearPay: 'Gaji tahun terbaru',
      ctxYearPay: 'Total bulan tercatat tahun tersebut',
      lblYearHours: 'Jam tahun terbaru',
      titleMonthly: 'Rekap per bulan',
      titleAnnual: 'Rekap per tahun',
      thMonth: 'Bulan',
      thHours: 'Jam',
      thDays: 'Hari',
      thPay: 'Gaji (USD)',
      thYear: 'Tahun',
      badgeLatest: 'Terbaru',
      badgeVerified: 'Dibaca dari sumber',
      badgeStale: 'Data tertunda',
      btnDisconnect: 'Putuskan koneksi MySalary',
      btnSecurity: 'Keamanan',
      btnLogout: 'Keluar',
      sourceLabel: 'Sumber nyata',
      roleLabel: 'Pemilik',
      footerNote: 'Sumber nyata · hanya baca · khusus pemilik',
      sourceNote: 'Sumber: MySalary Firebase. Kelas dan catatan harian tidak disalin ke SuperApp. Sinkron terjadwal setiap 6 jam dan saat ringkasan dibuka setelah 1 jam.',
      hoursUnit: 'jam',
      daysUnit: 'hari mengajar',
      yearPrefix: 'Tahun',
      syncRead: 'Dibaca',
      syncNoTime: 'Waktu sinkron belum tersedia',
      noMonth: 'Belum ada catatan bulan',
      noYear: 'Belum ada catatan tahun',
      scrollSuffix: '(Gulir)'
    },
    en: {
      eyebrow: 'OWNER DASHBOARD',
      title: 'Earnings summary',
      subtitle: 'MySalary data read directly from your connected account.',
      tz: 'Western Indonesia Time',
      demoNote: 'Teaching salary is personal income in USD. It is never merged with business revenue or balances.',
      lblMonthPay: 'Latest month earnings',
      ctxMonthPay: 'USD · teaching income, not business revenue',
      lblMonthHours: 'Latest month hours',
      lblYearPay: 'Latest year earnings',
      ctxYearPay: 'Total recorded months for the year',
      lblYearHours: 'Latest year hours',
      titleMonthly: 'Monthly breakdown',
      titleAnnual: 'Annual breakdown',
      thMonth: 'Month',
      thHours: 'Hours',
      thDays: 'Days',
      thPay: 'Pay (USD)',
      thYear: 'Year',
      badgeLatest: 'Latest',
      badgeVerified: 'Read from source',
      badgeStale: 'Delayed data',
      btnDisconnect: 'Disconnect MySalary',
      btnSecurity: 'Settings',
      btnLogout: 'Log out',
      sourceLabel: 'Live source',
      roleLabel: 'Owner',
      footerNote: 'Live source · read-only · owner access',
      sourceNote: 'Source: MySalary Firebase. Classes and daily logs are not copied to SuperApp. Scheduled sync every 6 hours and upon opening summary after 1 hour.',
      hoursUnit: 'hours',
      daysUnit: 'teaching days',
      yearPrefix: 'Year',
      syncRead: 'Read',
      syncNoTime: 'Sync timestamp unavailable',
      noMonth: 'No monthly records',
      noYear: 'No annual records',
      scrollSuffix: '(Scroll)'
    }
  };

  if (document.createElement && $('.page-heading')) {
    const nav = document.createElement('nav'); nav.className = 'source-tabs'; nav.setAttribute('aria-label', 'Sumber data');
    const teaching = document.createElement('a'); teaching.href = '/'; teaching.className = 'button primary'; teaching.setAttribute('aria-current', 'page'); teaching.textContent = 'Teaching Pay Audit';
    const moneyTab = document.createElement('a'); moneyTab.href = '/money'; moneyTab.className = 'button secondary'; moneyTab.textContent = 'Money Management';
    const posTab = document.createElement('a'); posTab.href = '/pos'; posTab.className = 'button secondary'; posTab.textContent = 'Bumi Makmur POS';
    const kostTab = document.createElement('a'); kostTab.href = '/kost'; kostTab.className = 'button secondary'; kostTab.textContent = 'CHARISNA KOST';
    nav.append(teaching, moneyTab, posTab, kostTab); $('.page-heading').before(nav);
  }

  let connecting = false;
  let cachedData = null;

  function applyStaticTranslations(lang) {
    const t = i18n[lang] || i18n.id;
    if ($('#page-eyebrow')) $('#page-eyebrow').textContent = t.eyebrow;
    if ($('#page-title')) $('#page-title').innerHTML = `${t.title}<span class="title-dot">.</span>`;
    if ($('#page-subtitle')) $('#page-subtitle').textContent = t.subtitle;
    if ($('#period-tz')) $('#period-tz').textContent = t.tz;
    if ($('#demo-note-text')) $('#demo-note-text').textContent = t.demoNote;
    if ($('#lbl-month-pay')) $('#lbl-month-pay').textContent = t.lblMonthPay;
    if ($('#ctx-month-pay')) $('#ctx-month-pay').textContent = t.ctxMonthPay;
    if ($('#lbl-month-hours')) $('#lbl-month-hours').textContent = t.lblMonthHours;
    if ($('#lbl-year-pay')) $('#lbl-year-pay').textContent = t.lblYearPay;
    if ($('#ctx-year-pay')) $('#ctx-year-pay').textContent = t.ctxYearPay;
    if ($('#lbl-year-hours')) $('#lbl-year-hours').textContent = t.lblYearHours;
    if ($('#title-monthly-recap')) $('#title-monthly-recap').textContent = t.titleMonthly;
    if ($('#title-annual-recap')) $('#title-annual-recap').textContent = t.titleAnnual;
    if ($('#th-month')) $('#th-month').textContent = t.thMonth;
    if ($('#th-hours')) $('#th-hours').textContent = t.thHours;
    if ($('#th-days')) $('#th-days').textContent = t.thDays;
    if ($('#th-pay')) $('#th-pay').textContent = t.thPay;
    if ($('#th-year')) $('#th-year').textContent = t.thYear;
    if ($('#th-year-hours')) $('#th-year-hours').textContent = t.thHours;
    if ($('#th-year-days')) $('#th-year-days').textContent = t.thDays;
    if ($('#th-year-pay')) $('#th-year-pay').textContent = t.thPay;
    if ($('#disconnect-button')) $('#disconnect-button').textContent = t.btnDisconnect;
    if ($('#nav-security')) $('#nav-security').textContent = t.btnSecurity;
    if ($('#logout-button')) $('#logout-button').textContent = t.btnLogout;
    if ($('#topbar-source-label')) $('#topbar-source-label').textContent = t.sourceLabel;
    if ($('#topbar-role')) $('#topbar-role').textContent = t.roleLabel;
    if ($('#source-note')) $('#source-note').textContent = t.sourceNote;
    if ($('#footer-note')) $('#footer-note').textContent = t.footerNote;

    if (document.querySelectorAll) {
      document.querySelectorAll('.lang-btn').forEach(btn => {
        const active = btn.getAttribute('data-lang') === lang;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
  }

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
    cachedData = data;
    const t = i18n[currentLang] || i18n.id;
    applyStaticTranslations(currentLang);

    $('#connect-panel').hidden = true;
    $('#summary-panel').hidden = false;
    $('#summary-panel').classList.add('fade-in');
    $('#load-status').hidden = true;
    const skeleton = $('#skeleton-panel');
    if (skeleton) skeleton.hidden = true;

    const rawMonths = Array.isArray(data.months) ? [...data.months].sort((a, b) => b.month.localeCompare(a.month)) : [];
    const latestActive = rawMonths.find(m => m.hours > 0 || Number(m.pay_minor) > 0) || rawMonths[0];

    $('#period').textContent = latestActive ? monthLabel(latestActive.month, currentLang) : t.noMonth;
    $('#latest-pay').textContent = latestActive ? money(latestActive.pay_minor) : '—';
    $('#latest-hours').textContent = latestActive ? `${latestActive.hours} ${t.hoursUnit}` : '—';
    $('#latest-days').textContent = latestActive ? `${latestActive.teaching_days} ${t.daysUnit}` : t.noMonth;

    const years = Array.isArray(data.years) ? [...data.years].sort((a, b) => b.year.localeCompare(a.year)) : [];
    const currentYear = years[0];
    $('#latest-year-pay').textContent = currentYear ? money(currentYear.pay_minor) : '—';
    $('#latest-year-hours').textContent = currentYear ? `${currentYear.hours} ${t.hoursUnit}` : '—';
    $('#latest-year').textContent = currentYear ? `${t.yearPrefix} ${currentYear.year}` : t.noYear;
    $('#quality').textContent = data.state === 'stale' ? t.badgeStale : t.badgeVerified;
    $('#quality').className = `badge ${data.state === 'stale' ? 'stale' : 'verified'}`;

    const dateFormatted = data.synced_at ? new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(data.synced_at)) : null;
    $('#sync-time').textContent = dateFormatted ? `${t.syncRead} ${dateFormatted} WIB` : t.syncNoTime;

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
      $('#month-count-pill').textContent = `${allMonths.length} ${t.thMonth} ${t.scrollSuffix}`;
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

      // Bulan cell
      const monthCell = document.createElement('td');
      const monthWrap = document.createElement('div');
      monthWrap.className = 'cell-month-wrap';
      const monthName = document.createElement('span');
      monthName.className = 'month-name';
      monthName.textContent = monthLabel(item.month, currentLang);
      monthWrap.append(monthName);
      if (isLatest) {
        const currentBadge = document.createElement('span');
        currentBadge.className = 'badge-mini current';
        currentBadge.textContent = t.badgeLatest;
        monthWrap.append(currentBadge);
      }
      monthCell.append(monthWrap);

      // Jam cell
      const hoursCell = document.createElement('td');
      const hoursWrap = document.createElement('div');
      hoursWrap.className = 'metric-cell-wrap';
      const hoursVal = document.createElement('span');
      hoursVal.className = 'hours-val';
      hoursVal.textContent = `${item.hours} ${t.hoursUnit}`;
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

      // Hari cell
      const daysCell = document.createElement('td');
      const daysPill = document.createElement('span');
      daysPill.className = item.teaching_days > 0 ? 'days-pill' : 'days-pill zero';
      daysPill.textContent = String(item.teaching_days);
      daysCell.append(daysPill);

      // Gaji cell
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
      strong.textContent = `${t.yearPrefix} ${item.year}`;
      yearCell.append(strong);
      const hoursCell = document.createElement('td');
      hoursCell.textContent = `${item.hours} ${t.hoursUnit}`;
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

  // Setup language toggle buttons
  if (document.querySelectorAll) {
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang');
        if (lang === currentLang) return;
        currentLang = lang;
        setLang(lang);
        applyStaticTranslations(lang);
        if (cachedData) showSummary(cachedData);
      });
    });
  }

  applyStaticTranslations(currentLang);

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
