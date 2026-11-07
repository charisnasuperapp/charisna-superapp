const $=id=>document.getElementById(id);
const post=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
const format=(minor,currency,scale)=>minor===null?'—':new Intl.NumberFormat('id-ID',{style:'currency',currency}).format(Number(minor)/10**scale);
const go=res=>{if(res.status===401)location.replace('/login');else if(res.status===423)location.replace('/unlock');};

function getCookie(name, def=''){
 try{const m=document.cookie?document.cookie.match(new RegExp('(?:^|;\\s*)'+name+'=([^;]+)')):null;return m?decodeURIComponent(m[1]):def;}catch{return def;}
}
function setCookie(name, val){
 try{document.cookie=`${name}=${encodeURIComponent(val)}; Path=/; SameSite=Lax; Max-Age=31536000`;}catch{}
}

let currentLang = getCookie('charisna_lang', 'id');
let isPrivacyActive = getCookie('charisna_privacy', '0') === '1';
let cachedData = null;

const i18n = {
 id: {
  role: 'Pemilik',
  security: 'Keamanan',
  privacy: 'Privasi',
  eyebrow: 'BERANDA PEMILIK',
  subtitle: 'Ringkasan tiap akun keuangan dalam brankas Anda.',
  demoNote: 'Saldo bersih, pemasukan, dan pengeluaran ditampilkan per akun. Mata uang berbeda tidak dijumlahkan.',
  loading: 'Memuat ringkasan…',
  connectEyebrow: 'SAMBUNGKAN SUMBER',
  connectTitle: 'Hubungkan Money Management',
  connectDesc: '1. Buat kode di sini. 2. Buka Money Management dan masukkan kode pada Pengaturan. Brankas harus terbuka dan akun cloud sudah masuk.',
  pairBtn: 'Buat kode penghubung',
  connectNote: 'Kode berlaku 10 menit. PIN dan isi transaksi tidak dikirim.',
  summaryTitle: 'Akun keuangan',
  badgeStale: 'Data tertunda',
  badgeVerified: 'Ringkasan tersimpan',
  monthPrefix: 'Bulan:',
  receivedPrefix: 'Diterima',
  lblBalance: 'Saldo bersih',
  lblIncome: 'Pemasukan bulan ini',
  lblExpense: 'Pengeluaran bulan ini',
  missingFx: 'Sebagian nilai tidak tersedia karena kurs mata uang belum ada.',
  footerNote: 'Ringkasan tersimpan · khusus pemilik',
  moneyFooterNote: 'Saldo bersih memperhitungkan aset dan kewajiban. Pemasukan dan pengeluaran hanya bulan berjalan; transfer tidak dihitung.',
  disconnectBtn: 'Putuskan Money Management dan hapus ringkasan',
  disconnectConfirm: 'Hapus ringkasan dan putuskan koneksi Money Management?',
  errorLoad: 'Ringkasan belum tersedia. Coba muat ulang.',
  errorPair: 'Gagal membuat kode. Coba lagi.',
  errorDisconnect: 'Gagal memutus koneksi. Coba lagi.'
 },
 en: {
  role: 'Owner',
  security: 'Settings',
  privacy: 'Privacy',
  eyebrow: 'OWNER DASHBOARD',
  subtitle: 'Summary of financial accounts in your vault.',
  demoNote: 'Net balance, income, and expenses are shown per account. Different currencies are not aggregated.',
  loading: 'Loading summary…',
  connectEyebrow: 'CONNECT SOURCE',
  connectTitle: 'Connect Money Management',
  connectDesc: '1. Generate a code here. 2. Open Money Management and enter the code in Settings. Vault must be unlocked and cloud account signed in.',
  pairBtn: 'Generate pairing code',
  connectNote: 'Code valid for 10 minutes. PIN and transaction details are never sent.',
  summaryTitle: 'Financial Accounts',
  badgeStale: 'Delayed data',
  badgeVerified: 'Saved summary',
  monthPrefix: 'Month:',
  receivedPrefix: 'Received',
  lblBalance: 'Net balance',
  lblIncome: 'Income this month',
  lblExpense: 'Expense this month',
  missingFx: 'Some values unavailable due to missing exchange rates.',
  footerNote: 'Saved summary · owner access',
  moneyFooterNote: 'Net balance includes assets and liabilities. Income and expenses are current month only; transfers excluded.',
  disconnectBtn: 'Disconnect Money Management and delete summary',
  disconnectConfirm: 'Delete summary and disconnect Money Management?',
  errorLoad: 'Summary unavailable. Try reloading.',
  errorPair: 'Failed to generate code. Try again.',
  errorDisconnect: 'Failed to disconnect. Try again.'
 }
};

function applyPrivacy(active){
 isPrivacyActive = active;
 setCookie('charisna_privacy', active ? '1' : '0');
 document.body.classList.toggle('privacy-active', active);
 const btn = $('privacy-btn');
 if(btn){
  btn.classList.toggle('active', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
 }
}

function applyLang(lang){
 currentLang = lang;
 setCookie('charisna_lang', lang);
 if(document.documentElement) document.documentElement.lang = lang;
 const t = i18n[lang] || i18n.id;
 if($('topbar-role')) $('topbar-role').textContent = t.role;
 if($('nav-security')) $('nav-security').textContent = t.security;
 if($('privacy-lbl')) $('privacy-lbl').textContent = t.privacy;
 if($('page-eyebrow')) $('page-eyebrow').textContent = t.eyebrow;
 if($('page-subtitle')) $('page-subtitle').textContent = t.subtitle;
 if($('demo-note-text')) $('demo-note-text').textContent = t.demoNote;
 if($('money-status')) $('money-status').textContent = t.loading;
 if($('money-connect-eyebrow')) $('money-connect-eyebrow').textContent = t.connectEyebrow;
 if($('money-connect-title')) $('money-connect-title').textContent = t.connectTitle;
 if($('money-connect-desc')) $('money-connect-desc').textContent = t.connectDesc;
 if($('money-pair')) $('money-pair').textContent = t.pairBtn;
 if($('money-connect-note')) $('money-connect-note').textContent = t.connectNote;
 if($('money-summary-title')) $('money-summary-title').textContent = t.summaryTitle;
 if($('money-footer-note')) $('money-footer-note').textContent = t.moneyFooterNote;
 if($('money-disconnect')) $('money-disconnect').textContent = t.disconnectBtn;
 if($('footer-note')) $('footer-note').textContent = t.footerNote;

 if(document.querySelectorAll){
  document.querySelectorAll('.lang-btn').forEach(btn=>{
   const active = btn.getAttribute('data-lang') === lang;
   btn.classList.toggle('active', active);
   btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
 }
 if(cachedData) renderSummary(cachedData);
}

function renderSummary(data){
 const t = i18n[currentLang] || i18n.id;
 $('money-quality').textContent = data.state === 'stale' ? t.badgeStale : t.badgeVerified;
 $('money-quality').className = `badge ${data.state === 'stale' ? 'stale' : 'verified'}`;
 $('money-month').textContent = `${t.monthPrefix} ${data.snapshot.month}`;
 $('money-time').textContent = `${t.receivedPrefix} ${new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'id-ID', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
 const cards = data.snapshot.profiles.map(p => {
  const article = document.createElement('article'); article.className = 'business-card';
  const title = document.createElement('h3'); title.textContent = p.name; article.append(title);
  for(const [label, key] of [[t.lblBalance, 'balance_minor'], [t.lblIncome, 'income_minor'], [t.lblExpense, 'expense_minor']]){
   const caption = document.createElement('p'); caption.className = 'metric-label'; caption.textContent = label; article.append(caption);
   const value = document.createElement('p'); value.className = 'money-amount'; value.textContent = format(p[key], p.currency, p.scale); article.append(value);
  }
  if(p.quality !== 'complete'){
   const note = document.createElement('p'); note.className = 'scope-note'; note.textContent = t.missingFx; article.append(note);
  }
  return article;
 });
 $('money-profiles').replaceChildren(...cards);
}

async function load(){
 try{
  const res = await fetch('/money/overview.json', {cache:'no-store'}); go(res); if(!res.ok) throw Error();
  const data = await res.json();
  cachedData = data;
  $('money-status').hidden = true;
  const sk = $('money-skeleton'); if(sk) sk.hidden = true;
  const connected = ['connected', 'stale'].includes(data.state);
  $('money-connect').hidden = connected; $('money-summary').hidden = !connected;
  if(connected) $('money-summary').classList.add('fade-in'); else $('money-connect').classList.add('fade-in');
  if(!connected){
   $('money-code').textContent = data.state === 'needs_reconnect' ? (currentLang === 'en' ? 'Connection needs to be recreated.' : 'Koneksi perlu dibuat ulang.') : (currentLang === 'en' ? 'Not connected yet.' : 'Belum terhubung.');
   return;
  }
  renderSummary(data);
 }catch{
  const t = i18n[currentLang] || i18n.id;
  $('money-status').textContent = t.errorLoad;
  const sk = $('money-skeleton'); if(sk) sk.hidden = true;
 }
}

$('money-pair').addEventListener('click', async () => {
 $('money-pair').disabled = true;
 try{
  const res = await fetch('/money/pair', post()); go(res); if(!res.ok) throw Error();
  const data = await res.json();
  $('money-code').textContent = currentLang === 'en' ? `Code: ${data.code} · valid for 10 minutes` : `Kode: ${data.code} · berlaku 10 menit`;
 }catch{
  $('money-code').textContent = (i18n[currentLang] || i18n.id).errorPair;
 }finally{ $('money-pair').disabled = false; }
});

$('money-disconnect').addEventListener('click', async () => {
 const t = i18n[currentLang] || i18n.id;
 if(!confirm(t.disconnectConfirm)) return;
 $('money-disconnect').disabled = true;
 try{
  const res = await fetch('/money/disconnect', post()); go(res); if(!res.ok) throw Error();
  await load();
 }catch{
  $('money-time').textContent = t.errorDisconnect;
 }finally{ $('money-disconnect').disabled = false; }
});

if($('privacy-btn')){
 $('privacy-btn').addEventListener('click', () => applyPrivacy(!isPrivacyActive));
}
if(document.querySelectorAll){
 document.querySelectorAll('.lang-btn').forEach(btn => {
  btn.addEventListener('click', () => applyLang(btn.getAttribute('data-lang')));
 });
}

window.addEventListener('keydown', e => {
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
 if(e.key==='1') location.href='/';
 if(e.key==='2') location.href='/money';
 if(e.key==='3') location.href='/pos';
 if(e.key==='4') location.href='/kost';
 if(e.key==='s'||e.key==='S') location.href='/security';
 if(e.key==='p'||e.key==='P') applyPrivacy(!isPrivacyActive);
});

window.addEventListener('pagehide', () => { $('money-profiles').replaceChildren(); $('money-code').textContent = ''; });
applyPrivacy(isPrivacyActive);
applyLang(currentLang);
load();
