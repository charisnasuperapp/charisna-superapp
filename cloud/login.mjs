const postOptions = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});

export function createLoginController({fetch:request=globalThis.fetch,now=Date.now,onChange=()=>{},onSuccess=()=>{},initialError=''}={}) {
 let busy=false,availableAt=0,message='',error=initialError;
 const controller={
  get state(){return {busy,cooldown:Math.max(0,Math.ceil((availableAt-now())/1000)),message,error};},
  async signIn(password){
   if(busy)return;
   busy=true;message='';error='';onChange(controller.state);
   try{
    const response=await request('/auth/login',postOptions({password}));
    if(response.ok){onSuccess();return;}
    error=response.status===429?'Terlalu banyak percobaan. Tunggu 15 menit, lalu coba lagi.':response.status===401||response.status===403?'Sandi atau email tidak sesuai. Coba lagi atau gunakan pemulihan akun.':'Permintaan belum dapat diproses. Coba lagi nanti.';
   }catch{error='Permintaan belum dapat diproses. Periksa koneksi internet.';}
   finally{busy=false;onChange(controller.state);}
  },
  async sendLink(){
   if(busy||controller.state.cooldown)return;
   busy=true;message='';error='';onChange(controller.state);
   // A failed request may still have delivered a link: always throttle retries.
   availableAt=now()+60000;
   try {
    const response=await request('/auth/send-link',postOptions({}));
    if(!response.ok)throw Error('request');
    message='Jika permintaan dapat diproses, tautan akan dikirim ke email pemilik terdaftar. Periksa kotak masuk dan spam, lalu buka tautan di peramban ini.';
   } catch {error='Permintaan belum dapat diproses. Tunggu sebentar, lalu coba lagi.';}
   finally {busy=false;onChange(controller.state);}
  }
 };
 return controller;
}

export function mountLogin({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch,now=Date.now}={}) {
 const $=selector=>document.querySelector(selector);

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

 const i18n = {
  id: {
   demoLabel: 'Sumber nyata',
   eyebrow: 'RUANG PEMILIK · SUMBER NYATA',
   introTitle: 'Satu ruang.<br>Fokus yang tepat<span class="title-dot">.</span>',
   introSub: 'Masuk untuk melihat ringkasan MySalary dalam ruang khusus pemilik.',
   ctxNote: 'MySalary perlu dihubungkan sekali pada browser ini. Gaji mengajar tetap terpisah dari omzet usaha.',
   sessionNote: 'Tetap masuk di perangkat pribadi. Sesi diperpanjang otomatis dan berakhir setelah 30 hari tidak digunakan. Keluar jika memakai perangkat bersama.',
   cardEyebrow: 'AKSES KHUSUS PEMILIK',
   cardTitle: 'Selamat datang kembali',
   cardDesc: 'Masuk dengan email dan sandi pemilik. Perangkat pribadi akan mengingat sesi Anda.',
   lblEmail: 'Email pemilik',
   lblPass: 'Sandi',
   btnLogin: 'Masuk',
   summary: 'Belum punya sandi atau lupa sandi?',
   hint: 'Gunakan tautan pemulihan sekali, lalu atur sandi dari pengaturan keamanan. Buka tautan di peramban yang sama.',
   privacyNote: 'Akses diverifikasi oleh server. Data MySalary hanya dibaca setelah akun sumber dihubungkan.',
   footerNote: 'Data MySalary · hanya baca · khusus pemilik'
  },
  en: {
   demoLabel: 'Live source',
   eyebrow: 'OWNER SPACE · LIVE SOURCE',
   introTitle: 'One space.<br>The right focus<span class="title-dot">.</span>',
   introSub: 'Sign in to view your MySalary summary in an owner-only space.',
   ctxNote: 'MySalary needs to be connected once on this browser. Teaching salary remains separate from business turnover.',
   sessionNote: 'Stay signed in on personal devices. Sessions refresh automatically and expire after 30 idle days. Log out on shared devices.',
   cardEyebrow: 'OWNER ACCESS ONLY',
   cardTitle: 'Welcome back',
   cardDesc: 'Sign in with owner email and password. Personal devices remember your session.',
   lblEmail: 'Owner email',
   lblPass: 'Password',
   btnLogin: 'Sign In',
   summary: 'No password or forgot password?',
   hint: 'Use a one-time recovery link, then set your password in security settings. Open link in this browser.',
   privacyNote: 'Access verified by server. MySalary data is only read after connecting your source account.',
   footerNote: 'MySalary data · read-only · owner access'
  }
 };

 function applyLang(lang) {
  const t = i18n[lang] || i18n.id;
  if ($('#login-demo-label')) $('#login-demo-label').textContent = t.demoLabel;
  if ($('#login-intro-eyebrow')) $('#login-intro-eyebrow').textContent = t.eyebrow;
  if ($('#intro-title')) $('#intro-title').innerHTML = t.introTitle;
  if ($('#login-intro-sub')) $('#login-intro-sub').textContent = t.introSub;
  if ($('#login-ctx-note')) $('#login-ctx-note').textContent = t.ctxNote;
  if ($('#login-session-note')) $('#login-session-note').textContent = t.sessionNote;
  if ($('#login-card-eyebrow')) $('#login-card-eyebrow').textContent = t.cardEyebrow;
  if ($('#login-title')) $('#login-title').textContent = t.cardTitle;
  if ($('#login-card-desc')) $('#login-card-desc').textContent = t.cardDesc;
  if ($('#lbl-owner-email')) $('#lbl-owner-email').textContent = t.lblEmail;
  if ($('#lbl-password')) $('#lbl-password').textContent = t.lblPass;
  if ($('#password-login')) $('#password-login').textContent = t.btnLogin;
  if ($('#login-details-summary')) $('#login-details-summary').textContent = t.summary;
  if ($('#login-details-hint')) $('#login-details-hint').textContent = t.hint;
  if ($('#login-privacy-note')) $('#login-privacy-note').textContent = t.privacyNote;
  if ($('#login-footer-note')) $('#login-footer-note').textContent = t.footerNote;

  if (document.querySelectorAll) {
   document.querySelectorAll('.lang-btn').forEach(btn => {
    const active = btn.getAttribute('data-lang') === lang;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
   });
  }
 }

 if (document.querySelectorAll) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
   btn.addEventListener('click', () => {
    const chosen = btn.getAttribute('data-lang');
    setLang(chosen);
    applyLang(chosen);
   });
  });
 }

 applyLang(getLang());

 function render(state){
  $('#password-login').disabled=state.busy;
  $('#password-form').setAttribute('aria-busy',String(state.busy));
  $('#send-link').disabled=state.busy||state.cooldown>0;
  $('#send-link-form').setAttribute('aria-busy',String(state.busy));
  $('#send-cooldown').textContent=state.cooldown?`Kirim ulang tersedia dalam ${state.cooldown} detik.`:'Tautan hanya dikirim ke email pemilik terdaftar.';
  $('#send-link').textContent=state.busy?'Mohon tunggu…':'Kirim tautan masuk';
  if($('#login-status').textContent!==state.message)$('#login-status').textContent=state.message;
  if($('#login-error').textContent!==state.error)$('#login-error').textContent=state.error;
 }
 const failed=new URLSearchParams(window.location.search).has('error');
 const controller=createLoginController({fetch,now,onChange:render,onSuccess:()=>window.location.replace('/'),initialError:failed?'Tautan tidak valid, kedaluwarsa, atau dibuka di peramban lain. Minta tautan baru.':''});
 $('#password-form').addEventListener('submit',async event=>{
  event.preventDefault();const password=$('#password').value;$('#password').value='';await controller.signIn(password);
 });
 $('#send-link-form').addEventListener('submit',async event=>{event.preventDefault();await controller.sendLink();});
 window.addEventListener('pagehide',()=>{$('#password').value='';});
 const ticker=window.setInterval(()=>render(controller.state),1000);
 window.addEventListener('pagehide',()=>window.clearInterval(ticker));
 window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
 render(controller.state);
 return controller;
}
if(typeof document!=='undefined'&&document.querySelector)mountLogin();
