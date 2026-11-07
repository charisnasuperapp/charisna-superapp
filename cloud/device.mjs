const decode = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
const encode = data => btoa(String.fromCharCode(...new Uint8Array(data))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
export function webAuthnOptions(options){
 const result={...options,challenge:decode(options.challenge)};
 if(options.user)result.user={...options.user,id:decode(options.user.id)};
 for(const key of ['allowCredentials','excludeCredentials'])if(options[key])result[key]=options[key].map(c=>({...c,id:decode(c.id)}));
 return result;
}
export function credentialJSON(credential){
 const response={};
 for(const key of ['clientDataJSON','attestationObject','authenticatorData','signature','userHandle'])if(key in credential.response)response[key]=credential.response[key]==null?null:encode(credential.response[key]);
 if(credential.response.getTransports)response.transports=credential.response.getTransports();
 return {id:credential.id,rawId:encode(credential.rawId),type:credential.type,response,authenticatorAttachment:credential.authenticatorAttachment,clientExtensionResults:credential.getClientExtensionResults()};
}
export function mountDevice({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch}={}){
 const $=s=>document.querySelector(s);let busy=false;

 function getLang(){
  try{
   const m=document.cookie?document.cookie.match(/(?:^|;\s*)charisna_lang=([a-z]{2})/):null;
   return m?m[1]:'id';
  }catch{return 'id';}
 }
 function setLang(lang){
  try{
   document.cookie=`charisna_lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`;
   if(document.documentElement)document.documentElement.lang=lang;
  }catch{}
 }

 const translations={
  id:{
   eyebrow:'KHUSUS PEMILIK',
   title:'Keamanan & Pengaturan',
   desc:'Email: charisna.superapp@gmail.com. Sandi dan data biometrik tidak disimpan di kode aplikasi.',
   passTitle:'Atur sandi login',
   passHint:'Gunakan minimal 8 karakter. Sandi disimpan secara aman di hash Cloudflare.',
   lblNew:'Sandi baru',
   lblConfirm:'Ulangi sandi baru',
   btnSave:'Simpan sandi',
   deviceTitle:'Buka kunci perangkat',
   hint1:'Aktifkan sekali pada setiap perangkat pribadi. Setelah 15 menit, akses data dikunci di server sampai diverifikasi kembali. PIN Windows Hello, sidik jari, atau pengenalan wajah mengikuti fitur perangkat. SuperApp tidak membaca atau menyimpan PIN, sidik jari, maupun wajah.',
   btnRegister:'Aktifkan PIN / biometrik',
   hint2:'Sesi akun bertahan sampai 30 hari tanpa aktivitas. Jika sesi habis, cookie dihapus, atau Anda keluar, masuk kembali dengan email dan sandi. Jangan aktifkan pada perangkat bersama.',
   btnRevoke:'Hapus semua kunci perangkat',
   back:'Ringkasan',
   systemTitle:'Status Sistem & Sesi',
   statEmail:'Email Pemilik',
   statSession:'Durasi Sesi',
   statSessionVal:'30 Hari (Rolling Refresh)',
   statLock:'Kunci Otomatis',
   statLockVal:'15 Menit Tidak Aktif',
   statCloud:'Infrastruktur Edge',
   badgeStatus:'Operasional',
   badgeCipher:'Enkripsi AES-256',
   badgeBiometric:'WebAuthn Aktif',
   changelogHeading:'Catatan Pembaruan',
   v24Title:'Dashboard Eksekutif, Sensor Privasi & Navigasi Cepat',
   v24List:'<li><strong>Tata Letak Pengaturan 2-Kolom</strong>: Tampilan modular seimbang untuk kredensial, biometrik, dan sistem.</li><li><strong>Mode Privasi Finansial (Blur)</strong>: Sensor angka saldo instan dengan sekali klik untuk keamanan saat presentasi.</li><li><strong>Navigasi Pintasan Keyboard (1-4, S, P)</strong>: Pindah antar modul secara instan layaknya aplikasi desktop profesional.</li><li><strong>Ekspor CSV Langsung</strong>: Salin data rekap bulanan ke clipboard dengan format siap tempel di Excel/Google Sheets.</li><li><strong>Dukungan Multi-Bahasa Menyeluruh</strong>: Opsi bahasa ID/EN terhubung ke seluruh modul aplikasi.</li>',
   v23Title:'Rekap Lengkap 12 Bulan & Microinteraction Shimmer',
   v23List:'<li><strong>Rekap Bulanan Lengkap (12 Bulan)</strong>: Seluruh bulan per tahun dalam kotak gulir 5 baris dengan sticky header.</li><li><strong>Microinteraction & Skeleton Shimmer</strong>: Transisi tactile tombol dan animasi pemuatan shimmer di seluruh modul.</li>',
   v22Title:'Buka Kunci WebAuthn & Sesi 30 Hari',
   v22List:'<li><strong>WebAuthn & Biometrik Perangkat</strong>: Buka kunci via Windows Hello, Touch ID, dan Face ID.</li><li><strong>Perpanjangan Sesi Aman</strong>: Sesi cookie terenkripsi AES-256-GCM dengan sliding refresh 30 hari.</li>',
   v21Title:'Sinyal Sinkron Cepat MySalary & Edge Runtime',
   v21List:'<li><strong>Webhook /connector/signal</strong>: Pembaruan data otomatis beberapa detik setelah penyimpanan di MySalary.</li>',
   v20Title:'Arsitektur Multi-Bisnis Terpadu',
   v20List:'<li><strong>Multi-Konektor Usaha</strong>: Integrasi Bumi Makmur POS, CHARISNA KOST, dan Money Management.</li>',
   unlockEyebrow:'PERANGKAT TERKUNCI',
   unlockTitle:'Selamat datang kembali',
   unlockDesc:'Sesi pemilik masih aktif. Verifikasi dengan PIN atau biometrik perangkat untuk membuka ringkasan.',
   unlockBtn:'Buka dengan PIN / biometrik',
   unlockHint:'Pilihan PIN, sidik jari, atau wajah disediakan oleh sistem perangkat. Jika tidak tersedia, gunakan email dan sandi.',
   unlockLogin:'Masuk dengan sandi',
   unlockLogout:'Keluar dari akun'
  },
  en:{
   eyebrow:'OWNER ONLY',
   title:'Security & Settings',
   desc:'Email: charisna.superapp@gmail.com. Passwords and biometrics are never stored in application code.',
   passTitle:'Set login password',
   passHint:'Use at least 8 characters. Passwords are securely hashed on Cloudflare.',
   lblNew:'New password',
   lblConfirm:'Confirm new password',
   btnSave:'Save password',
   deviceTitle:'Device unlock',
   hint1:'Enable once on each personal device. After 15 minutes, data access is server-locked until re-verified. Windows Hello PIN, fingerprint, or facial recognition follow device capabilities. SuperApp never reads or stores PINs or biometrics.',
   btnRegister:'Enable PIN / biometrics',
   hint2:'Account sessions last up to 30 idle days. If your session expires or cookie is cleared, log in again with email and password. Do not enable on shared devices.',
   btnRevoke:'Remove all device keys',
   back:'Dashboard',
   systemTitle:'System & Session Status',
   statEmail:'Owner Email',
   statSession:'Session Lifetime',
   statSessionVal:'30 Days (Rolling Refresh)',
   statLock:'Auto-Lock',
   statLockVal:'15 Min Idle',
   statCloud:'Edge Infrastructure',
   badgeStatus:'Operational',
   badgeCipher:'AES-256 Encrypted',
   badgeBiometric:'WebAuthn Active',
   changelogHeading:'Changelog & Updates',
   v24Title:'Executive Dashboard, Privacy Mask & Quick Nav',
   v24List:'<li><strong>2-Column Settings Layout</strong>: Balanced modular layout for credentials, biometrics, and system metrics.</li><li><strong>Financial Privacy Mode (Blur)</strong>: Instant balance blur toggle with one click for screen privacy in public.</li><li><strong>Keyboard Shortcuts (1-4, S, P)</strong>: Instant module jumping like desktop professional software.</li><li><strong>Direct CSV Export</strong>: Copy monthly breakdown data formatted for instant Excel/Google Sheets paste.</li><li><strong>Comprehensive Multi-Language</strong>: Complete bilingual ID/EN coverage across all application modules.</li>',
   v23Title:'Complete 12-Month Recap & Shimmer Microinteractions',
   v23List:'<li><strong>Complete Monthly Breakdown (12 Months)</strong>: All months per year in a 5-row scrollable box with sticky header.</li><li><strong>Microinteractions & Skeleton Shimmer</strong>: Tactile transitions and shimmer loading across all modules.</li>',
   v22Title:'WebAuthn Device Unlock & 30-Day Sessions',
   v22List:'<li><strong>WebAuthn & Biometrics</strong>: Unlock via Windows Hello, Touch ID, and Face ID.</li><li><strong>Extended Secure Sessions</strong>: AES-256-GCM encrypted cookies with 30-day sliding refresh.</li>',
   v21Title:'MySalary Fast Sync Webhook & Edge Runtime',
   v21List:'<li><strong>Webhook /connector/signal</strong>: Fast automated sync within seconds after saving in MySalary.</li>',
   v20Title:'Unified Multi-Business Architecture',
   v20List:'<li><strong>Multi-Business Connectors</strong>: Integration of Bumi Makmur POS, CHARISNA KOST, and Money Management.</li>',
   unlockEyebrow:'DEVICE LOCKED',
   unlockTitle:'Welcome back',
   unlockDesc:'Owner session is still active. Verify with device PIN or biometrics to unlock dashboard.',
   unlockBtn:'Unlock with PIN / biometrics',
   unlockHint:'PIN, fingerprint, or facial recognition are provided by device system. If unavailable, use email and password.',
   unlockLogin:'Sign in with password',
   unlockLogout:'Sign out of account'
  }
 };

 function applyLang(lang){
  const t=translations[lang]||translations.id;
  if($('#sec-eyebrow'))$('#sec-eyebrow').textContent=t.eyebrow;
  if($('#sec-title'))$('#sec-title').textContent=t.title;
  if($('#sec-desc'))$('#sec-desc').textContent=t.desc;
  if($('#sec-pass-title'))$('#sec-pass-title').textContent=t.passTitle;
  if($('#sec-pass-hint'))$('#sec-pass-hint').textContent=t.passHint;
  if($('#lbl-new-password'))$('#lbl-new-password').textContent=t.lblNew;
  if($('#lbl-confirm-password'))$('#lbl-confirm-password').textContent=t.lblConfirm;
  if($('#save-password'))$('#save-password').textContent=t.btnSave;
  if($('#sec-device-title'))$('#sec-device-title').textContent=t.deviceTitle;
  if($('#sec-device-hint1'))$('#sec-device-hint1').textContent=t.hint1;
  if($('#register-device'))$('#register-device').textContent=t.btnRegister;
  if($('#sec-device-hint2'))$('#sec-device-hint2').textContent=t.hint2;
  if($('#revoke-device'))$('#revoke-device').textContent=t.btnRevoke;
  if($('#back-link'))$('#back-link').textContent=t.back;
  if($('#sec-system-title'))$('#sec-system-title').textContent=t.systemTitle;
  if($('#sec-stat-email-label'))$('#sec-stat-email-label').textContent=t.statEmail;
  if($('#sec-stat-session-label'))$('#sec-stat-session-label').textContent=t.statSession;
  if($('#sec-stat-session-val'))$('#sec-stat-session-val').textContent=t.statSessionVal;
  if($('#sec-stat-lock-label'))$('#sec-stat-lock-label').textContent=t.statLock;
  if($('#sec-stat-lock-val'))$('#sec-stat-lock-val').textContent=t.statLockVal;
  if($('#sec-stat-cloud-label'))$('#sec-stat-cloud-label').textContent=t.statCloud;
  if($('#sec-badge-status'))$('#sec-badge-status').textContent=t.badgeStatus;
  if($('#sec-badge-cipher'))$('#sec-badge-cipher').textContent=t.badgeCipher;
  if($('#sec-badge-biometric'))$('#sec-badge-biometric').textContent=t.badgeBiometric;
  if($('#changelog-heading'))$('#changelog-heading').textContent=t.changelogHeading;

  if($('#cl-v24-title')&&t.v24Title)$('#cl-v24-title').textContent=t.v24Title;
  if($('#cl-v24-list')&&t.v24List)$('#cl-v24-list').innerHTML=t.v24List;
  if($('#cl-v23-title')&&t.v23Title)$('#cl-v23-title').textContent=t.v23Title;
  if($('#cl-v23-list')&&t.v23List)$('#cl-v23-list').innerHTML=t.v23List;
  if($('#cl-v22-title')&&t.v22Title)$('#cl-v22-title').textContent=t.v22Title;
  if($('#cl-v22-list')&&t.v22List)$('#cl-v22-list').innerHTML=t.v22List;
  if($('#cl-v21-title')&&t.v21Title)$('#cl-v21-title').textContent=t.v21Title;
  if($('#cl-v21-list')&&t.v21List)$('#cl-v21-list').innerHTML=t.v21List;
  if($('#cl-v20-title')&&t.v20Title)$('#cl-v20-title').textContent=t.v20Title;
  if($('#cl-v20-list')&&t.v20List)$('#cl-v20-list').innerHTML=t.v20List;

  // Unlock page elements
  if($('#unlock-eyebrow'))$('#unlock-eyebrow').textContent=t.unlockEyebrow;
  if($('#unlock-title'))$('#unlock-title').textContent=t.unlockTitle;
  if($('#unlock-desc'))$('#unlock-desc').textContent=t.unlockDesc;
  if($('#unlock-button'))$('#unlock-button').textContent=t.unlockBtn;
  if($('#unlock-hint'))$('#unlock-hint').textContent=t.unlockHint;
  if($('#unlock-login-link'))$('#unlock-login-link').textContent=t.unlockLogin;
  if($('#unlock-logout-btn'))$('#unlock-logout-btn').textContent=t.unlockLogout;
  if($('#unlock-back'))$('#unlock-back').textContent=t.back;

  if(document.querySelectorAll){
   document.querySelectorAll('.lang-btn').forEach(btn=>{
    const active=btn.getAttribute('data-lang')===lang;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
   });
  }
 }

 if(document.querySelectorAll){
  document.querySelectorAll('.lang-btn').forEach(btn=>{
   btn.addEventListener('click',()=>{
    const chosen=btn.getAttribute('data-lang');
    setLang(chosen);
    applyLang(chosen);
   });
  });
 }

 applyLang(getLang());

 async function post(path,data){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data||{}),cache:'no-store'});
  if(r.status===401){window.location.replace('/login');throw Error('unauthorized');}
  if(r.status===423){window.location.replace('/unlock');throw Error('locked');}
  if(!r.ok){
   const m=await r.json().catch(()=>({}));
   throw Error(m.error||'Permintaan gagal.');
  }
  return r.json();
 }
 async function action(button,fn){
  if(busy)return;busy=true;button.disabled=true;$('#device-status').textContent='Memproses…';
  try{await fn();}catch(e){$('#device-status').textContent=['NotAllowedError','AbortError'].includes(e.name)?'Verifikasi dibatalkan atau perangkat belum siap. Coba lagi.':e.name==='InvalidStateError'?'Kunci ini sudah terdaftar. Gunakan buka kunci.':e.message;}
  finally{busy=false;button.disabled=false;}
 }
 const register=$('#register-device');
 if(register)register.addEventListener('click',()=>action(register,async()=>{
  if(!window.PublicKeyCredential||!window.navigator?.credentials)throw Error('Peramban ini belum mendukung kunci perangkat. Gunakan Chrome, Edge, atau Safari terbaru melalui HTTPS.');
  if(window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable&&!await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())throw Error('Aktifkan Windows Hello, Touch ID, Face ID, atau kunci layar perangkat terlebih dahulu.');
  const options=await post('/auth/passkeys/register-options');
  const credential=await window.navigator.credentials.create({publicKey:webAuthnOptions(options)});
  await post('/auth/passkeys/register',credentialJSON(credential));
  $('#device-status').textContent='Kunci perangkat aktif. PIN atau biometrik dipilih oleh perangkat, bukan SuperApp.';
 }));
 const unlock=$('#unlock-button');
 if(unlock)unlock.addEventListener('click',()=>action(unlock,async()=>{
  if(!window.PublicKeyCredential||!window.navigator?.credentials)throw Error('Kunci perangkat tidak tersedia. Masuk kembali dengan email dan sandi.');
  const options=await post('/auth/passkeys/authenticate-options');
  const credential=await window.navigator.credentials.get({publicKey:webAuthnOptions(options)});
  await post('/auth/passkeys/authenticate',credentialJSON(credential));window.location.replace('/');
 }));
 const form=$('#set-password-form');
 if(form)form.addEventListener('submit',event=>{event.preventDefault();
  const password=$('#new-password').value,confirmation=$('#confirm-password').value;$('#new-password').value='';$('#confirm-password').value='';
  if(password!==confirmation){$('#device-status').textContent='Konfirmasi sandi tidak sama.';return;}
  return action($('#save-password'),async()=>{await post('/auth/password',{password});$('#device-status').textContent='Sandi tersimpan. Login berikutnya gunakan email dan sandi ini.';});
 });
 const revoke=$('#revoke-device');
 if(revoke)revoke.addEventListener('click',()=>{if(!window.confirm('Hapus semua kunci perangkat? Login dengan email dan sandi tetap tersedia.'))return;return action(revoke,async()=>{await post('/auth/passkeys/revoke');$('#device-status').textContent='Semua kunci perangkat dihapus. Email dan sandi tetap dapat digunakan.';});});
 const logout=$('#logout-form');
 if(logout)logout.addEventListener('submit',async e=>{e.preventDefault();try{await post('/auth/logout');}finally{window.location.replace('/login');}});
}
if(typeof document!=='undefined'&&document.querySelector)mountDevice();
