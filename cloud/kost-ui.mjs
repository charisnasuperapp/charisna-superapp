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
  subtitle: 'Okupansi dan tagihan per properti.',
  demoNote: 'Ringkasan berasal dari data lokal perangkat Owner yang terhubung. Cloud KOST masih ditransfer manual. Tanggal snapshot terlihat di bawah.',
  loading: 'Memuat ringkasan…',
  connectEyebrow: 'SAMBUNGKAN SUMBER',
  connectTitle: 'Hubungkan CHARISNA KOST',
  connectDesc: 'Buat kode di sini. Buka aplikasi KOST sebagai Owner, lalu masukkan kode pada Cloud & Akun → CHARISNA SuperApp.',
  pairBtn: 'Buat kode penghubung',
  connectNote: 'Kode berlaku 10 menit. Data bawaan boleh dikirim dengan label contoh. Identitas penghuni, foto, dan detail tagihan tidak dikirim.',
  summaryTitle: 'Properti',
  badgeDemoStale: 'Data contoh · tertunda',
  badgeDemo: 'Data contoh',
  badgeStale: 'Data tertunda',
  badgeLocal: 'Snapshot lokal',
  demoWarning: 'Data contoh bawaan KOST. Angka ini belum mewakili usaha nyata. Label hilang setelah semua data contoh diganti.',
  monthPrefix: 'Bulan pembayaran:',
  receivedPrefix: 'Diterima',
  lblRooms: 'Kamar terisi',
  lblPaid: 'Pembayaran diterima bulan ini',
  lblUnpaid: 'Tagihan belum lunas',
  footerNote: 'Ringkasan tersimpan · khusus pemilik',
  kostFooterNote: 'Pembayaran diterima dihitung dari tagihan berstatus LUNAS dengan tanggal bayar bulan ini. Tagihan belum lunas mencakup semua periode.',
  disconnectBtn: 'Putuskan KOST dan hapus ringkasan',
  disconnectConfirm: 'Hapus ringkasan dan putuskan koneksi CHARISNA KOST?',
  errorLoad: 'Ringkasan belum tersedia. Coba muat ulang.',
  errorPair: 'Gagal membuat kode. Coba lagi.',
  errorDisconnect: 'Gagal memutus koneksi. Coba lagi.'
 },
 en: {
  role: 'Owner',
  security: 'Settings',
  privacy: 'Privacy',
  eyebrow: 'OWNER DASHBOARD',
  subtitle: 'Occupancy and billing per property.',
  demoNote: 'Summary is derived from connected Owner device local data. KOST cloud is currently transferred manually. Snapshot date is shown below.',
  loading: 'Loading summary…',
  connectEyebrow: 'CONNECT SOURCE',
  connectTitle: 'Connect CHARISNA KOST',
  connectDesc: 'Generate a code here. Open KOST app as Owner, then enter code under Cloud & Account → CHARISNA SuperApp.',
  pairBtn: 'Generate pairing code',
  connectNote: 'Code valid for 10 minutes. Demo data may be sent with sample tags. Tenant identities, photos, and itemized bills are never sent.',
  summaryTitle: 'Properties',
  badgeDemoStale: 'Sample data · delayed',
  badgeDemo: 'Sample data',
  badgeStale: 'Delayed data',
  badgeLocal: 'Local snapshot',
  demoWarning: 'Built-in sample KOST data. These figures do not represent real business yet. Label disappears once sample data is replaced.',
  monthPrefix: 'Billing month:',
  receivedPrefix: 'Received',
  lblRooms: 'Occupied rooms',
  lblPaid: 'Payments collected this month',
  lblUnpaid: 'Unpaid bills',
  footerNote: 'Saved summary · owner access',
  kostFooterNote: 'Collected payments are calculated from PAID bills dated this month. Unpaid bills include all outstanding periods.',
  disconnectBtn: 'Disconnect KOST and delete summary',
  disconnectConfirm: 'Delete summary and disconnect CHARISNA KOST?',
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
 if($('kost-status')) $('kost-status').textContent = t.loading;
 if($('kost-connect-eyebrow')) $('kost-connect-eyebrow').textContent = t.connectEyebrow;
 if($('kost-connect-title')) $('kost-connect-title').textContent = t.connectTitle;
 if($('kost-connect-desc')) $('kost-connect-desc').textContent = t.connectDesc;
 if($('kost-pair')) $('kost-pair').textContent = t.pairBtn;
 if($('kost-connect-note')) $('kost-connect-note').textContent = t.connectNote;
 if($('kost-summary-title')) $('kost-summary-title').textContent = t.summaryTitle;
 if($('kost-demo-note')) $('kost-demo-note').textContent = t.demoWarning;
 if($('kost-footer-note')) $('kost-footer-note').textContent = t.kostFooterNote;
 if($('kost-disconnect')) $('kost-disconnect').textContent = t.disconnectBtn;
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
 const isDemo = data.snapshot.is_demo === true;
 $('kost-quality').textContent = isDemo ? (data.state === 'stale' ? t.badgeDemoStale : t.badgeDemo) : (data.state === 'stale' ? t.badgeStale : t.badgeLocal);
 $('kost-quality').className = `badge ${isDemo || data.state === 'stale' ? 'stale' : 'verified'}`;
 $('kost-demo-note').hidden = !isDemo;
 $('kost-month').textContent = `${t.monthPrefix} ${data.snapshot.month}`;
 $('kost-time').textContent = `${t.receivedPrefix} ${new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'id-ID', {dateStyle:'medium', timeStyle:'short', timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
 if(data.snapshot.unassigned_bills){
  $('kost-unassigned').textContent = currentLang === 'en' ? `${data.snapshot.unassigned_bills} bills could not be mapped to a property. Not included in cards below.` : `${data.snapshot.unassigned_bills} tagihan belum dapat dipetakan ke properti. Angkanya tidak masuk kartu di bawah.`;
 } else {
  $('kost-unassigned').textContent = '';
 }
 const cards = data.snapshot.properties.map(property => {
  const card = document.createElement('article'); card.className = 'business-card';
  const title = document.createElement('h3'); title.textContent = property.name; card.append(title);
  for(const [label, value] of [[t.lblRooms, `${property.occupied_rooms} / ${property.total_rooms}`], [t.lblPaid, rupiah(property.paid_this_month_idr)], [t.lblUnpaid, rupiah(property.unpaid_bills_idr)]]){
   const caption = document.createElement('p'); caption.className = 'metric-label'; caption.textContent = label;
   const amount = document.createElement('p'); amount.className = 'money-amount'; amount.textContent = value;
   card.append(caption, amount);
  }
  return card;
 });
 $('kost-properties').replaceChildren(...cards);
}

async function load(){
 try{
  const res = await fetch('/kost/overview.json', {cache:'no-store'}); guard(res); if(!res.ok) throw Error();
  const data = await res.json();
  cachedData = data;
  $('kost-status').hidden = true;
  const sk = $('kost-skeleton'); if(sk) sk.hidden = true;
  const connected = ['connected', 'stale'].includes(data.state);
  $('kost-connect').hidden = connected; $('kost-summary').hidden = !connected;
  if(connected) $('kost-summary').classList.add('fade-in'); else $('kost-connect').classList.add('fade-in');
  if(!connected){
   $('kost-properties').replaceChildren();
   $('kost-code').textContent = data.state === 'needs_reconnect' ? (currentLang === 'en' ? 'Connection needs to be recreated.' : 'Koneksi perlu dibuat ulang.') : (currentLang === 'en' ? 'Not connected yet.' : 'Belum terhubung.');
   return;
  }
  renderSummary(data);
 }catch{
  const t = i18n[currentLang] || i18n.id;
  $('kost-summary').hidden = true; $('kost-properties').replaceChildren(); $('kost-demo-note').hidden = true;
  $('kost-status').hidden = false; $('kost-status').textContent = t.errorLoad;
  const sk = $('kost-skeleton'); if(sk) sk.hidden = true;
 }
}

$('kost-pair').addEventListener('click', async () => {
 $('kost-pair').disabled = true;
 try{
  const res = await fetch('/kost/pair', post()); guard(res); if(!res.ok) throw Error();
  const data = await res.json();
  $('kost-code').textContent = currentLang === 'en' ? `Code: ${data.code} · valid for 10 minutes` : `Kode: ${data.code} · berlaku 10 menit`;
 }catch{
  $('kost-code').textContent = (i18n[currentLang] || i18n.id).errorPair;
 }finally{ $('kost-pair').disabled = false; }
});

$('kost-disconnect').addEventListener('click', async () => {
 const t = i18n[currentLang] || i18n.id;
 if(!confirm(t.disconnectConfirm)) return;
 $('kost-disconnect').disabled = true;
 try{
  const res = await fetch('/kost/disconnect', post()); guard(res); if(!res.ok) throw Error();
  await load();
 }catch{
  $('kost-time').textContent = t.errorDisconnect;
 }finally{ $('kost-disconnect').disabled = false; }
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

window.addEventListener('pagehide', () => { $('kost-properties').replaceChildren(); $('kost-code').textContent = ''; });
applyPrivacy(isPrivacyActive);
applyLang(currentLang);
load();
