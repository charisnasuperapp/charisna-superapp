import test from 'node:test';
import assert from 'node:assert/strict';
const origin='https://charisna-superapp.vercel.app';
const baseAuth={configured:true,authorize:async()=>({status:401,body:{error:'Sesi tidak valid'}})};
async function make(auth=baseAuth,teaching=null){
 const {createCloudHandler}=await import('../cloud/handler.mjs');
 const {readFile}=await import('node:fs/promises');
 return createCloudHandler({env:{SITE_ORIGIN:origin},auth,teaching,assetLoader:file=>readFile(new URL('../cloud/'+file,import.meta.url))});
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

test('owner can read live-only dashboard; synthetic endpoints are absent',async()=>{
 const teaching={configured:true,overview:async()=>({status:200,body:{state:'not_connected'}}),config:()=>({apiKey:'public-key',projectId:'source'})};
 const handle=await make({...baseAuth,authorize:async()=>({status:200,user:{id:'owner'}})},teaching);
 const home=await handle(request('/')); assert.equal(home.status,200);const html=await home.text();assert.match(html,/Ringkasan penghasilan/);assert.doesNotMatch(html,/12150000|8750000|Data contoh/);
 const overview=await handle(request('/overview.json'));assert.equal(overview.status,200);
 assert.deepEqual(await overview.json(),{state:'not_connected'});
 assert.equal((await handle(request('/demo/overview.json'))).status,404);
 assert.equal((await handle(request('/demo/personal.json'))).status,404);
});

test('cloud perimeter rejects foreign hosts, cross-site mutations and unconfigured auth',async()=>{
 let calls=0;
 const auth={...baseAuth,sendLink:async()=>{calls++;return {status:200,body:{ok:true}};}};
 const handle=await make(auth);
 assert.equal((await handle(new Request('https://evil.example/demo/personal.json'))).status,403);
 for(const headers of [{},{origin:'https://evil.example'},{origin, 'sec-fetch-site':'cross-site'}]){
  const res=await handle(request('/auth/send-link',{method:'POST',headers:{'content-type':'application/json',...headers},body:'{}'}));assert.equal(res.status,403);
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
 let sends=0;
 const cookie='__Host-charisna-pkce=test; Path=/; HttpOnly; Secure; SameSite=Lax';
 const handle=await make({...baseAuth,sendLink:async()=>{sends++;return {status:200,body:{ok:true},cookie};},logout:async()=>({status:200,body:{ok:true},cookie:'__Host-charisna=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict'})});
 const post=(path,body,more={})=>handle(request(path,{method:'POST',headers:{origin,'content-type':'application/json',...more},body}));
 const sent=await post('/auth/send-link','{}');assert.equal(sent.status,200);assert.equal(sends,1);assert.equal(sent.headers.get('set-cookie'),cookie);
 assert.equal((await post('/auth/send-link','{}')).status,429);assert.equal(sends,1);
 assert.equal((await post('/auth/logout','{')).status,400);
 assert.equal((await post('/auth/logout','x'.repeat(2049))).status,413);
 assert.equal((await post('/auth/logout','{}',{'content-type':'text/plain'})).status,415);
 assert.equal((await post('/auth/verify','{}')).status,405);
 const logout=await post('/auth/logout','{}');assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
});

 test('unexpected auth errors become safe 503 without exception or credential detail',async()=>{
 const handle=await make({...baseAuth,authorize:async()=>{throw Error('secret-token');}});
 const res=await handle(request('/demo/personal.json'));assert.equal(res.status,503);assert.doesNotMatch(await res.text(),/secret-token|8750000/);
});

 test('callback exchanges the code, sets session, clears PKCE cookie and never echoes the code',async()=>{
 let seen;
 const handle=await make({...baseAuth,exchangeCode:async(req,code)=>{seen={code,cookie:req.headers.cookie};return {status:200,body:{ok:true},cookie:'__Host-charisna=s; Path=/; HttpOnly; Secure; SameSite=Strict'};},clearPkceCookie:()=>'__Host-charisna-pkce=; Max-Age=0'});
 const res=await handle(request('/auth/callback?code=abcdefgh12345',{headers:{cookie:'__Host-charisna-pkce=p'}}));
 assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/text\/html/);const page=await res.text();assert.match(page,/http-equiv="refresh" content="0;url=\/"/);assert.doesNotMatch(page,/abcdefgh12345|<script/);
 assert.deepEqual(res.headers.getSetCookie(),['__Host-charisna=s; Path=/; HttpOnly; Secure; SameSite=Strict','__Host-charisna-pkce=; Max-Age=0']);
 assert.deepEqual(seen,{code:'abcdefgh12345',cookie:'__Host-charisna-pkce=p'});
 assert.match(res.headers.get('cache-control'),/no-store/);
});

 test('callback failures and malformed queries redirect to login without cookies',async()=>{
 let calls=0;
 const handle=await make({...baseAuth,exchangeCode:async()=>{calls++;return {status:401,body:{}};},clearPkceCookie:()=>'x'});
 for(const q of ['','?code=','?code=a&code=b','?code=abcdefgh&x=1','?error=access_denied','?code=abcdefgh']){
  const res=await handle(request('/auth/callback'+q));assert.equal(res.status,303,q);assert.equal(res.headers.get('location'),'/login?error=1',q);assert.equal(res.headers.get('set-cookie'),null);
 }
 assert.equal(calls,1);
 assert.equal((await handle(request('/auth/callback?code=abcdefgh',{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'}))).status,405);
 const locked=await make({...baseAuth,configured:false});
 const lockedRes=await locked(request('/auth/callback?code=abcdefgh'));assert.equal(lockedRes.status,303);assert.equal(lockedRes.headers.get('location'),'/login?error=1');
 assert.equal((await handle(request('/auth/callback?code=abcdefgh',{method:'HEAD'}))).status,405);assert.equal(calls,1);
});

 test('callback brute force has a finite instance budget',async()=>{
 let attempts=0;const handle=await make({...baseAuth,exchangeCode:async()=>{attempts++;return {status:401,body:{}};}});
 for(let i=0;i<9;i++)assert.equal((await handle(request('/auth/callback?code=abcdefgh'))).status,303);
 assert.equal((await handle(request('/auth/callback?code=abcdefgh'))).status,303);
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
 const owner=await make({...baseAuth,authorize:async()=>({status:200,user:{id:'owner'}})},{configured:true,overview:async()=>({status:200,body:{state:'not_connected'}})});
 const guest=await make();
 const unconfigured=await make({...baseAuth,configured:false});
 const missingOrigin=createCloudHandler({env:{},auth:baseAuth});
 const denied=await make({...baseAuth,authorize:async()=>({status:403,body:{error:'Ditolak'}})});
 const authFailure=await make({...baseAuth,authorize:async()=>{throw Error('secret-token');}});
 const assetFailure=createCloudHandler({env:{SITE_ORIGIN:origin},auth:baseAuth,assetLoader:async()=>{throw Error('asset-failure');}});
 for(const [name,handle,url,status,extraHeaders] of [
  ['dashboard',owner,origin+'/',200],
  ['source overview',owner,origin+'/overview.json',200],
  ['public login',guest,origin+'/login',200],
  ['login redirect',guest,origin+'/',303,{location:'/login'}],
  ['unauthorized',guest,origin+'/demo/personal.json',401],
  ['foreign origin',guest,'https://evil.example/demo/personal.json',403],
  ['authorization denied',denied,origin+'/demo/personal.json',403],
  ['not found',owner,origin+'/missing',404],
  ['auth method denied',guest,origin+'/auth/send-link',405,{allow:'POST'}],
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

test('local rejections (missing PKCE cookie) do not consume the callback budget',async()=>{
 let upstream=0;const handle=await make({...baseAuth,exchangeCode:async()=>{const r={status:401,body:{}};Object.defineProperty(r,'local',{value:true});return r;}});
 for(let i=0;i<20;i++)assert.equal((await handle(request('/auth/callback?code=abcdefgh'))).status,303);
 const ok=await make({...baseAuth,exchangeCode:async()=>({status:200,body:{ok:true},cookie:'a=b'}),clearPkceCookie:()=>'c=d'});
 assert.equal((await ok(request('/auth/callback?code=abcdefgh'))).status,200);
});

test('signal endpoint: exact MySalary origin, preflight, no cookie needed, no extra fields',async()=>{
 const mysalary='https://www.mysalary.my.id';let seen=[];
 const teaching={configured:true,signal:async token=>{seen.push(token);return {status:200,body:{accepted:true}};}};
 const handle=await make(baseAuth,teaching);
 const token='t'.repeat(40);
 const post=(headers,body)=>handle(request('/connector/signal',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 for(const o of [undefined,'https://evil.example','https://mysalary.my.id',origin]){
  const res=await post(o?{origin:o}:{}, {idToken:token});assert.equal(res.status,403,String(o));assert.equal(res.headers.get('access-control-allow-origin'),null);
 }
 assert.equal(seen.length,0);
 const pre=await handle(request('/connector/signal',{method:'OPTIONS',headers:{origin:mysalary}}));
 assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),mysalary);assert.equal(pre.headers.get('access-control-allow-methods'),'POST');
 assert.equal((await handle(request('/connector/signal',{method:'OPTIONS',headers:{origin:'https://evil.example'}}))).status,403);
 const ok=await post({origin:mysalary},{idToken:token});
 assert.equal(ok.status,200);assert.equal(ok.headers.get('access-control-allow-origin'),mysalary);assert.deepEqual(await ok.json(),{accepted:true});
 assert.deepEqual(seen,[token]);
 assert.equal((await post({origin:mysalary},{idToken:token,amount:1})).status,400);
 assert.equal((await handle(request('/connector/signal',{method:'GET',headers:{origin:mysalary}}))).status,405);
 const text=await handle(request('/connector/signal',{method:'POST',headers:{origin:mysalary,'content-type':'text/plain'},body:'x'}));
 assert.equal(text.status,415);
});

test('signal endpoint is throttled per isolate and 503 when connector missing',async()=>{
 const mysalary='https://www.mysalary.my.id';
 const handle=await make(baseAuth,{configured:true,signal:async()=>({status:202,body:{accepted:true}})});
 const call=()=>handle(request('/connector/signal',{method:'POST',headers:{origin:mysalary,'content-type':'application/json'},body:JSON.stringify({idToken:'t'.repeat(40)})}));
 let last;for(let i=0;i<31;i++)last=await call();
 assert.equal(last.status,429);assert.equal(last.headers.get('access-control-allow-origin'),mysalary);
 const none=await make(baseAuth,null);
 assert.equal((await none(request('/connector/signal',{method:'POST',headers:{origin:mysalary,'content-type':'application/json'},body:'{"idToken":"x"}'}))).status,503);
});
