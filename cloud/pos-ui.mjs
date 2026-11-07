const $=id=>document.getElementById(id);
const post=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
const rupiah=value=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value));
const guard=res=>{if(res.status===401)location.replace('/login');else if(res.status===423)location.replace('/unlock');};

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
  subtitle: 'Ringkasan usaha per cabang, bulan berjalan.',
  demoNote: 'Omzet bersih memperhitungkan refund dan transaksi batal. Laba adalah perkiraan setelah HPP dan beban operasional tercatat; bukan saldo kas.',
  loading: 'Memuat ringkasan…',
  connectEyebrow: 'SAMBUNGKAN SUMBER',
  connectTitle: 'Hubungkan Bumi Makmur POS',
  connectDesc: 'Buat kode di sini. Masukkan kode di POS pada Pengaturan Sistem → CHARISNA SuperApp. Gunakan akun Owner saat cloud sudah sinkron.',
  pairBtn: 'Buat kode penghubung',
  connectNote: 'Kode berlaku 10 menit. Detail transaksi dan kredensial Firebase tidak dikirim.',
  summaryTitle: 'Cabang Bumi Makmur',
  badgeStale: 'Data tertunda',
  badgeVerified: 'Ringkasan tersimpan',
  monthPrefix: 'Bulan:',
  receivedPrefix: 'Diterima',
  lblRevenue: 'Omzet bersih bulan ini',
  lblTx: 'Jumlah transaksi',
  lblProfit: 'Laba perkiraan bulan ini',
  footerNote: 'Ringkasan tersimpan · khusus pemilik',
  posFooterNote: 'Saat POS ditutup, ringkasan terakhir tetap terlihat. Buka POS dan tunggu sinkronisasi cloud untuk memperbarui angka.',
  disconnectBtn: 'Putuskan POS dan hapus ringkasan',
  disconnectConfirm: 'Hapus ringkasan dan putuskan koneksi Bumi Makmur POS?',
  errorLoad: 'Ringkasan belum tersedia. Coba muat ulang.',
  errorPair: 'Gagal membuat kode. Coba lagi.',
  errorDisconnect: 'Gagal memutus koneksi. Coba lagi.'
 },
 en: {
  role: 'Owner',
  security: 'Settings',
  privacy: 'Privacy',
  eyebrow: 'OWNER DASHBOARD',
  subtitle: 'Branch business summary, current month.',
  demoNote: 'Net revenue accounts for refunds and voided sales. Profit is an estimate after COGS and recorded operating expenses; not cash balance.',
  loading: 'Loading summary…',
  connectEyebrow: 'CONNECT SOURCE',
  connectTitle: 'Connect Bumi Makmur POS',
  connectDesc: 'Generate a code here. Enter code in POS System Settings → CHARISNA SuperApp. Use Owner account when cloud is synchronized.',
  pairBtn: 'Generate pairing code',
  connectNote: 'Code valid for 10 minutes. Transaction details and Firebase credentials are never sent.',
  summaryTitle: 'Bumi Makmur Branches',
  badgeStale: 'Delayed data',
  badgeVerified: 'Saved summary',
  monthPrefix: 'Month:',
  receivedPrefix: 'Received',
  lblRevenue: 'Net revenue this month',
  lblTx: 'Transaction count',
  lblProfit: 'Estimated profit this month',
  footerNote: 'Saved summary · owner access',
  posFooterNote: 'When POS is closed, latest summary remains visible. Open POS and wait for cloud sync to refresh numbers.',
  disconnectBtn: 'Disconnect POS and delete summary',
  disconnectConfirm: 'Delete summary and disconnect Bumi Makmur POS?',
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
 if($('pos-status')) $('pos-status').textContent = t.loading;
 if($('pos-connect-eyebrow')) $('pos-connect-eyebrow').textContent = t.connectEyebrow;
 if($('pos-connect-title')) $('pos-connect-title').textContent = t.connectTitle;
 if($('pos-connect-desc')) $('pos-connect-desc').textContent = t.connectDesc;
 if($('pos-pair')) $('pos-pair').textContent = t.pairBtn;
 if($('pos-connect-note')) $('pos-connect-note').textContent = t.connectNote;
 if($('pos-summary-title')) $('pos-summary-title').textContent = t.summaryTitle;
 if($('pos-footer-note')) $('pos-footer-note').textContent = t.posFooterNote;
 if($('pos-disconnect')) $('pos-disconnect').textContent = t.disconnectBtn;
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
 $('pos-quality').textContent = data.state === 'stale' ? t.badgeStale : t.badgeVerified;
 $('pos-quality').className = `badge ${data.state === 'stale' ? 'stale' : 'verified'}`;
 $('pos-month').textContent = `${t.monthPrefix} ${data.snapshot.month}`;
 $('pos-time').textContent = `${t.receivedPrefix} ${new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'id-ID', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
 const cards = data.snapshot.branches.map(branch => {
  const card = document.createElement('article'); card.className = 'business-card';
  const title = document.createElement('h3'); title.textContent = branch.name; card.append(title);
  for(const [label, value] of [[t.lblRevenue, rupiah(branch.revenue_idr)], [t.lblTx, String(branch.transactions)], [t.lblProfit, rupiah(branch.profit_estimate_idr)]]){
   const caption = document.createElement('p'); caption.className = 'metric-label'; caption.textContent = label;
   const amount = document.createElement('p'); amount.className = 'money-amount'; amount.textContent = value;
   card.append(caption, amount);
  }
  return card;
 });
 $('pos-branches').replaceChildren(...cards);
}

async function load(){
 try{
  const res = await fetch('/pos/overview.json', {cache:'no-store'}); guard(res); if(!res.ok) throw Error();
  const data = await res.json();
  cachedData = data;
  $('pos-status').hidden = true;
  const sk = $('pos-skeleton'); if(sk) sk.hidden = true;
  const connected = ['connected', 'stale'].includes(data.state);
  $('pos-connect').hidden = connected; $('pos-summary').hidden = !connected;
  if(connected) $('pos-summary').classList.add('fade-in'); else $('pos-connect').classList.add('fade-in');
  if(!connected){
   $('pos-code').textContent = data.state === 'needs_reconnect' ? (currentLang === 'en' ? 'Connection needs to be recreated.' : 'Koneksi perlu dibuat ulang.') : (currentLang === 'en' ? 'Not connected yet.' : 'Belum terhubung.');
   return;
  }
  renderSummary(data);
 }catch{
  const t = i18n[currentLang] || i18n.id;
  $('pos-status').hidden = false; $('pos-status').textContent = t.errorLoad;
  const sk = $('pos-skeleton'); if(sk) sk.hidden = true;
 }
}

$('pos-pair').addEventListener('click', async () => {
 $('pos-pair').disabled = true;
 try{
  const res = await fetch('/pos/pair', post()); guard(res); if(!res.ok) throw Error();
  const data = await res.json();
  $('pos-code').textContent = currentLang === 'en' ? `Code: ${data.code} · valid for 10 minutes` : `Kode: ${data.code} · berlaku 10 menit`;
 }catch{
  $('pos-code').textContent = (i18n[currentLang] || i18n.id).errorPair;
 }finally{ $('pos-pair').disabled = false; }
});

$('pos-disconnect').addEventListener('click', async () => {
 const t = i18n[currentLang] || i18n.id;
 if(!confirm(t.disconnectConfirm)) return;
 $('pos-disconnect').disabled = true;
 try{
  const res = await fetch('/pos/disconnect', post()); guard(res); if(!res.ok) throw Error();
  await load();
 }catch{
  $('pos-time').textContent = t.errorDisconnect;
 }finally{ $('pos-disconnect').disabled = false; }
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

window.addEventListener('pagehide', () => { $('pos-branches').replaceChildren(); $('pos-code').textContent = ''; });
applyPrivacy(isPrivacyActive);
applyLang(currentLang);
load();
