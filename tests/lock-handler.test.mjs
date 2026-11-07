import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCloudHandler} from '../cloud/handler.mjs';
const origin='https://unit.workers.dev';
const user={id:'owner-id',email:'owner@example.com'};
function setup({locked=true}={}){
 const calls=[];
 const auth={configured:true,authorize:async()=>locked?{status:423,body:{error:'locked'},cookie:'renewed-session'}:{status:200,user},authorizeIdentity:async()=>({status:200,user}),enableDeviceLock:async()=>({status:200,body:{ok:true},cookie:'enabled-session'}),unlockDevice:async()=>({status:200,body:{ok:true},cookie:'unlocked-session'}),disableDeviceLock:async()=>({status:200,body:{ok:true},cookie:'disabled-session'})};
 const passkeys={configured:true,status:async()=>({status:200,body:{enabled:true}}),registrationOptions:async()=>({status:200,body:{challenge:'registration'}}),verifyRegistration:async()=>({status:200,body:{ok:true}}),authenticationOptions:async()=>({status:200,body:{challenge:'authentication'}}),verifyAuthentication:async(_u,_h,response)=>{calls.push(response);return response.valid?{status:200,body:{ok:true}}:{status:401,body:{error:'invalid'}};},revoke:async()=>({status:200,body:{ok:true}})};
 const handle=createCloudHandler({env:{SITE_ORIGIN:origin},auth,passkeys,assetLoader:async f=>'asset:'+f});
 return {handle,calls};
}
const post=(path,body={},from=origin)=>new Request(origin+path,{method:'POST',headers:{origin:from,'content-type':'application/json'},body:JSON.stringify(body)});
test('locked dashboard redirects to unlock and retains a refreshed identity cookie',async()=>{
 const {handle}=setup();const r=await handle(new Request(origin+'/'));
 assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/unlock');assert.equal(r.headers.get('set-cookie'),'renewed-session');
 assert.equal((await handle(new Request(origin+'/overview.json'))).status,423);
 const sec=await handle(new Request(origin+'/security'));assert.equal(sec.status,303);assert.equal(sec.headers.get('location'),'/unlock');
 assert.equal((await handle(new Request(origin+'/unlock'))).status,200);
 assert.equal((await handle(new Request(origin+'/device.mjs'))).status,200);
});
test('a valid assertion unlocks only authenticated owner identity; invalid assertion cannot unlock',async()=>{
 const {handle}=setup();
 assert.equal((await handle(post('/auth/passkeys/authenticate-options'))).status,200);
 const bad=await handle(post('/auth/passkeys/authenticate',{valid:false}));assert.equal(bad.status,401);assert.equal(bad.headers.get('set-cookie'),null);
 const ok=await handle(post('/auth/passkeys/authenticate',{valid:true}));assert.equal(ok.status,200);assert.equal(ok.headers.get('set-cookie'),'unlocked-session');
 assert.equal((await handle(post('/auth/passkeys/authenticate',{valid:true},'https://other.example'))).status,403);
});
test('locked session cannot register or revoke passkeys; unlocked registration enables server lock',async()=>{
 for(const path of ['/auth/passkeys/status','/auth/passkeys/register-options','/auth/passkeys/register','/auth/passkeys/revoke'])assert.equal((await setup().handle(post(path))).status,423,path);
 const r=await setup({locked:false}).handle(post('/auth/passkeys/register',{}));assert.equal(r.status,200);assert.equal(r.headers.get('set-cookie'),'enabled-session');
});
test('unlock and passkey endpoints do not bypass expired identity session',async()=>{
 const h=createCloudHandler({env:{SITE_ORIGIN:origin},auth:{configured:true,authorizeIdentity:async()=>({status:401,body:{error:'expired'}})},passkeys:{configured:true},assetLoader:async()=>assert.fail('not authenticated')});
 const page=await h(new Request(origin+'/unlock'));assert.equal(page.status,303);assert.equal(page.headers.get('location'),'/login');
 assert.equal((await h(post('/auth/passkeys/authenticate-options'))).status,401);
});
