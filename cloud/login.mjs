const postOptions = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});

export function createLoginController({fetch:request=globalThis.fetch,now=Date.now,replace=url=>globalThis.location.replace(url),onChange=()=>{}}={}) {
 let busy=false,availableAt=0,message='',error='';
 const controller={
  get state(){return {busy,cooldown:Math.max(0,Math.ceil((availableAt-now())/1000)),message,error};},
  async sendCode(){
   if(busy||controller.state.cooldown)return;
   busy=true;message='';error='';onChange(controller.state);
   // A failed request may still have delivered a code: always throttle retries.
   availableAt=now()+60000;
   try {
    const response=await request('/auth/send-code',postOptions({}));
    if(!response.ok)throw Error('request');
    message='Jika permintaan dapat diproses, kode akan dikirim ke email pemilik terdaftar. Periksa kotak masuk dan spam.';
   } catch {error='Permintaan belum dapat diproses. Tunggu sebentar, lalu coba lagi.';}
   finally {busy=false;onChange(controller.state);}
  },
  async verifyCode(code){
   if(busy)return;
   error='';message='';
   if(typeof code!=='string'||!/^[0-9]{6,10}$/.test(code)||code.includes('\n')){
    error='Masukkan kode berisi 6–10 digit angka.';onChange(controller.state);return;
   }
   busy=true;onChange(controller.state);
   try {
    const response=await request('/auth/verify',postOptions({code}));
    if(!response.ok)throw Error('request');
    replace('/');
   } catch {error='Kode belum dapat diverifikasi. Periksa kode atau minta kode baru, lalu coba lagi.';}
   finally {busy=false;onChange(controller.state);}
  }
 };
 return controller;
}

export function mountLogin({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch,now=Date.now}={}) {
 const $=selector=>document.querySelector(selector);
 const code=$('#login-code');
 function render(state){
  $('#send-code').disabled=state.busy||state.cooldown>0;
  $('#verify-code').disabled=state.busy;
  code.disabled=state.busy;
  $('#send-code-form').setAttribute('aria-busy',String(state.busy));
  $('#verify-code-form').setAttribute('aria-busy',String(state.busy));
  const cooldownText=state.cooldown?`Kirim ulang tersedia dalam ${state.cooldown} detik.`:'Kode hanya dikirim ke email pemilik terdaftar.';
  $('#send-cooldown').textContent=cooldownText;
  $('#send-code').textContent=state.busy?'Mohon tunggu…':'Kirim kode masuk';
  $('#verify-code').textContent=state.busy?'Mohon tunggu…':'Masuk ke ringkasan';
  if($('#login-status').textContent!==state.message)$('#login-status').textContent=state.message;
  if($('#login-error').textContent!==state.error)$('#login-error').textContent=state.error;
  code.setAttribute('aria-invalid',String(Boolean(state.error)));
 }
 const controller=createLoginController({fetch,now,replace:url=>{code.value='';window.location.replace(url);},onChange:render});
 $('#send-code-form').addEventListener('submit',async event=>{
  event.preventDefault();await controller.sendCode();
  if(!controller.state.error)code.focus();
 });
 $('#verify-code-form').addEventListener('submit',async event=>{
  event.preventDefault();const value=code.value;code.value='';await controller.verifyCode(value);
  if(controller.state.error)code.focus();
 });
 const ticker=window.setInterval(()=>render(controller.state),1000);
 window.addEventListener('pagehide',()=>{code.value='';window.clearInterval(ticker);});
 window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
 render(controller.state);
 return controller;
}
if(typeof document!=='undefined')mountLogin();
