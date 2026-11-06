import test from 'node:test';
import assert from 'node:assert/strict';
const origin='https://charisna-superapp.vercel.app';
const baseAuth={configured:true,authorize:async()=>({status:401,body:{error:'Sesi tidak valid'}})};
async function make(auth=baseAuth){
 const {createCloudHandler}=await import('../cloud/handler.mjs');
 const {readFile}=await import('node:fs/promises');
 return createCloudHandler({env:{SITE_ORIGIN:origin},auth,assetLoader:file=>readFile(new URL('../cloud/'+file,import.meta.url))});
}
const request=(path,options={})=>new Request(origin+path,options);
test('cloud handler denies overview and personal data without a session',async()=>{
 const handle=await make();
 for(const path of ['/demo/overview.json','/demo/personal.json','/api','/api/index']){
  const res=await handle(request(path)); assert.equal(res.status,401,path);
  assert.match(res.headers.get('cache-control'),/no-store/);
  assert.doesNotMatch(await res.text(),/8750000|12150000/);
 }
});

test('owner can read synthetic dashboard; overview excludes personal balance',async()=>{
 const handle=await make({...baseAuth,authorize:async()=>({status:200,user:{id:'owner'}})});
 const home=await handle(request('/')); assert.equal(home.status,200); assert.match(await home.text(),/Beranda Pemilik/);
 const overview=await handle(request('/demo/overview.json'));assert.equal(overview.status,200);
 const data=await overview.json();assert.equal(data.businesses[0].amount_minor,'12150000');assert.equal(data.personal.amount_minor,undefined);
 const personal=await handle(request('/demo/personal.json')); assert.equal(personal.status,200);assert.equal((await personal.json()).personal.amount_minor,'8750000');
});

test('cloud perimeter rejects foreign hosts, cross-site mutations and unconfigured auth',async()=>{
 let calls=0;
 const auth={...baseAuth,sendCode:async()=>{calls++;return {status:200,body:{ok:true}};}};
 const handle=await make(auth);
 assert.equal((await handle(new Request('https://evil.example/demo/personal.json'))).status,403);
 for(const headers of [{},{origin:'https://evil.example'},{origin, 'sec-fetch-site':'cross-site'}]){
  const res=await handle(request('/auth/send-code',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'}));assert.equal(res.status,403);
 }
 assert.equal(calls,0);
 const locked=await make({...baseAuth,configured:false});
 assert.equal((await locked(request('/demo/overview.json'))).status,503);
});

 test('server refuses unsupported methods and does not expose source even to owner',async()=>{
 const handle=await make({...baseAuth,authorize:async()=>({status:200,user:{id:'owner'}})});
 assert.equal((await handle(request('/demo/overview.json',{method:'POST'}))).status,405);
 for(const p of ['/server.mjs','/demo/fixtures.mjs','/.env','/cloud/auth.mjs','/public/index.html','/index.html','/PROJECT_STATUS.md'])assert.equal((await handle(request(p))).status,404,p);
});

 test('non-owner rejection and upstream failures stay closed',async()=>{
 for(const status of [403,503]){
  const handle=await make({...baseAuth,authorize:async()=>({status,body:{error:'Ditolak'}})});
  for(const p of ['/','/demo/personal.json']){const res=await handle(request(p));assert.equal(res.status,status);assert.doesNotMatch(await res.text(),/8750000/);}
 }
});

 test('unauthenticated dashboard redirects safely without retaining supplied destinations',async()=>{
 const handle=await make(); const res=await handle(request('/?next=https://evil.example'));
 assert.equal(res.status,303);assert.equal(res.headers.get('location'),'/login');
});

 test('same-origin JSON auth requests use bounded input, cookies and cooldown',async()=>{
 let sends=0;let code;
 const cookie='__Host-charisna=test; Path=/; HttpOnly; Secure; SameSite=Strict';
 const handle=await make({...baseAuth,sendCode:async()=>{sends++;return {status:200,body:{ok:true}};},verifyCode:async value=>{code=value;return {status:200,body:{ok:true},cookie};},logout:async()=>({status:200,body:{ok:true},cookie:'__Host-charisna=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict'})});
 const post=(path,body,more={})=>handle(request(path,{method:'POST',headers:{origin,'content-type':'application/json',...more},body}));
 assert.equal((await post('/auth/send-code','{}')).status,200);assert.equal(sends,1);
 assert.equal((await post('/auth/send-code','{}')).status,429);assert.equal(sends,1);
 assert.equal((await post('/auth/verify','{')).status,400);
 assert.equal((await post('/auth/verify','x'.repeat(2049))).status,413);
 assert.equal((await post('/auth/verify','{}',{'content-type':'text/plain'})).status,415);
 assert.equal((await post('/auth/verify','{"code":"not-a-code"}')).status,400);
 const verified=await post('/auth/verify','{"code":"123456"}');assert.equal(verified.status,200);assert.equal(code,'123456');assert.equal(verified.headers.get('set-cookie'),cookie);assert.doesNotMatch(await verified.text(),/123456|test/);
 const logout=await post('/auth/logout','{}');assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});

 test('unexpected auth errors become safe 503 without exception or credential detail',async()=>{
 const handle=await make({...baseAuth,authorize:async()=>{throw Error('secret-token');}});
 const res=await handle(request('/demo/personal.json'));assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/secret-token|8750000/);
});

 test('verification brute force has a finite instance budget',async()=>{
 let attempts=0;const handle=await make({...baseAuth,verifyCode:async()=>{attempts++;return {status:401,body:{error:'Ditolak'}};}});
 for(let i=0;i<9;i++)assert.equal((await handle(request('/auth/verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"code":"123456"}'}))).status,401);
 assert.equal((await handle(request('/auth/verify',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{"code":"123456"}'}))).status,429);
 assert.equal(attempts,9);
});

 test('public login assets are the only unprotected pages; all responses carry security headers',async()=>{
 const handle=await make();
 for(const p of ['/login','/login.mjs','/styles.css']){const res=await handle(request(p));assert.equal(res.status,200,p);assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.match(res.headers.get('cache-control'),/no-store/);}
});

 test('asset loading is injected for Workers rather than depending on local filesystem',async()=>{
 const {createCloudHandler}=await import('../cloud/handler.mjs');
 const files=[];const handle=createCloudHandler({env:{SITE_ORIGIN:origin},auth:baseAuth,assetLoader:async file=>{files.push(file);return 'login-test';}});
 const res=await handle(request('/login'));assert.equal(res.status,200);assert.equal(await res.text(),'login-test');assert.deepEqual(files,['./login.html']);
});

test('HEAD responses preserve status and headers but never include a body',async t=>{
 const {createCloudHandler}=await import('../cloud/handler.mjs');
 const owner=await make({...baseAuth,authorize:async()=>({status:200,user:{id:'owner'}})});
 const guest=await make();
 const unconfigured=await make({...baseAuth,configured:false});
 const missingOrigin=createCloudHandler({env:{},auth:baseAuth});
 const denied=await make({...baseAuth,authorize:async()=>({status:403,body:{error:'Ditolak'}})});
 const authFailure=await make({...baseAuth,authorize:async()=>{throw Error('secret-token');}});
 const assetFailure=createCloudHandler({env:{SITE_ORIGIN:origin},auth:baseAuth,assetLoader:async()=>{throw Error('asset-failure');}});
 for(const [name,handle,url,status,extraHeaders] of [
  ['dashboard',owner,origin+'/',200],
  ['personal data',owner,origin+'/demo/personal.json',200],
  ['public login',guest,origin+'/login',200],
  ['login redirect',guest,origin+'/',303,{location:'/login'}],
  ['unauthorized',guest,origin+'/demo/personal.json',401],
  ['foreign origin',guest,'https://evil.example/demo/personal.json',403],
  ['authorization denied',denied,origin+'/demo/personal.json',403],
  ['not found',owner,origin+'/missing',404],
  ['auth method denied',guest,origin+'/auth/verify',405,{allow:'POST'}],
  ['auth unconfigured',unconfigured,origin+'/demo/personal.json',503],
  ['origin unconfigured',missingOrigin,origin+'/demo/personal.json',503],
  ['auth exception',authFailure,origin+'/demo/personal.json',503],
  ['asset exception',assetFailure,origin+'/login',503]
 ])await t.test(name,async()=>{
  const get=await handle(new Request(url));
  const head=await handle(new Request(url,{method:'HEAD'}));
  assert.equal(get.status,status);assert.equal(head.status,status);
  assert.equal(head.statusText,get.statusText);
  assert.deepEqual([...head.headers],[...get.headers]);
  for(const [key,value] of Object.entries(extraHeaders??{}))assert.equal(head.headers.get(key),value);
  assert.match(head.headers.get('cache-control'),/no-store/);
  assert.match(head.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.equal(await head.text(),'');
  assert.equal(head.body,null);
 });
});

test('missing or malformed canonical origin fails closed',async()=>{
 const {createCloudHandler}=await import('../cloud/handler.mjs');
 for(const SITE_ORIGIN of [undefined,'http://example.com',origin+'/','not-url']){const handle=createCloudHandler({env:{SITE_ORIGIN},auth:baseAuth});assert.equal((await handle(request('/demo/personal.json'))).status,503);}
});
