const postOptions = body => ({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});

export function createLoginController({fetch:request=globalThis.fetch,now=Date.now,onChange=()=>{},initialError=''}={}) {
 let busy=false,availableAt=0,message='',error=initialError;
 const controller={
  get state(){return {busy,cooldown:Math.max(0,Math.ceil((availableAt-now())/1000)),message,error};},
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
 function render(state){
  $('#send-link').disabled=state.busy||state.cooldown>0;
  $('#send-link-form').setAttribute('aria-busy',String(state.busy));
  $('#send-cooldown').textContent=state.cooldown?`Kirim ulang tersedia dalam ${state.cooldown} detik.`:'Tautan hanya dikirim ke email pemilik terdaftar.';
  $('#send-link').textContent=state.busy?'Mohon tunggu…':'Kirim tautan masuk';
  if($('#login-status').textContent!==state.message)$('#login-status').textContent=state.message;
  if($('#login-error').textContent!==state.error)$('#login-error').textContent=state.error;
 }
 const failed=new URLSearchParams(window.location.search).has('error');
 const controller=createLoginController({fetch,now,onChange:render,initialError:failed?'Tautan tidak valid, kedaluwarsa, atau dibuka di peramban lain. Minta tautan baru.':''});
 $('#send-link-form').addEventListener('submit',async event=>{event.preventDefault();await controller.sendLink();});
 const ticker=window.setInterval(()=>render(controller.state),1000);
 window.addEventListener('pagehide',()=>window.clearInterval(ticker));
 window.addEventListener('pageshow',event=>{if(event.persisted)window.location.reload();});
 render(controller.state);
 return controller;
}
if(typeof document!=='undefined')mountLogin();