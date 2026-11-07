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
 async function post(path,body={}){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  if(r.status===401){window.location.replace('/login');throw Error('Silakan masuk kembali.');}
  if(r.status===423){window.location.replace('/unlock');throw Error('Buka kunci perangkat terlebih dahulu.');}
  if(!r.ok){
   let msg;try{const d=await r.json();msg=d.error||d.message;}catch{}
   throw Error(msg||(r.status===429?'Terlalu banyak percobaan. Coba lagi nanti.':'Permintaan belum berhasil. Coba lagi atau masuk dengan sandi.'));
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
if(typeof document!=='undefined')mountDevice();
