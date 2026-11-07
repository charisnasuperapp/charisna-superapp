const assets=new Map([
 ['/', ['./overview.html','text/html; charset=utf-8']],
 ['/app.mjs', ['./overview.mjs','text/javascript; charset=utf-8']],
 ['/money', ['./money.html','text/html; charset=utf-8']],
 ['/money.mjs', ['./money-ui.mjs','text/javascript; charset=utf-8']],
 ['/pos', ['./pos.html','text/html; charset=utf-8']],
 ['/pos.mjs', ['./pos-ui.mjs','text/javascript; charset=utf-8']],
 ['/kost', ['./kost.html','text/html; charset=utf-8']],
 ['/kost.mjs', ['./kost-ui.mjs','text/javascript; charset=utf-8']],
 ['/styles.css', ['../public/styles.css','text/css; charset=utf-8']]
 ,['/money.css', ['../public/money.css','text/css; charset=utf-8']]
]);
const respond=(status,body,extra={})=>Response.json(body,{status,headers:{...headers,...extra}});
const headers={
 'Cache-Control':'private, no-store, max-age=0',
 'CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store',
 'Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Strict-Transport-Security':'max-age=31536000'
};
assets.set('/security',['./security.html','text/html; charset=utf-8']);
assets.set('/unlock',['./unlock.html','text/html; charset=utf-8']);
assets.set('/device.mjs',['./device.mjs','text/javascript; charset=utf-8']);
assets.set('/login',['./login.html','text/html; charset=utf-8']);
assets.set('/login.mjs',['./login.mjs','text/javascript; charset=utf-8']);
const publicPaths=new Set(['/login','/login.mjs','/styles.css']);
const authPaths=new Set(['/auth/send-link','/auth/logout','/auth/login','/auth/password']);
const connectorPaths=new Set(['/connector/connect','/connector/disconnect']);
const SIGNAL_PATH='/connector/signal';
const DEFAULT_SIGNAL_ORIGIN='https://www.mysalary.my.id';
const connectorCsp=headers['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' https://identitytoolkit.googleapis.com");

async function readJson(req,maxBytes=2048){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')??''))return {error:415};
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>maxBytes))return {error:413};
 if(!req.body)return {value:{}};
 const reader=req.body.getReader();const chunks=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();return {error:413};}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  return value&&typeof value==='object'&&!Array.isArray(value)?{value}:{error:400};
 }catch{return {error:400};}finally{reader.releaseLock();}
}

export function createCloudHandler({env=process.env,auth,teaching,money,pos,kost,passkeys,assetLoader=async()=>{throw Error('Missing asset loader');},now=()=>Date.now()}={}){
 let siteOrigin;
 try{const site=new URL(env.SITE_ORIGIN);if(site.protocol==='https:'&&site.origin===env.SITE_ORIGIN&&!site.username&&!site.password)siteOrigin=site.origin;}catch{/* Fail closed. */}
 // Instance-local friction, not a distributed rate limiter.
 let loginWindow=0,loginFailures=0,sendAfter=0,verifyWindow=0,verifyAttempts=0,signalWindow=0,signalCount=0;
 // The only cross-origin caller allowed: the MySalary web app. CORS is a browser rule, not authentication; the Firebase ID token is.
 const signalOrigin=env.TEACHING_SIGNAL_ORIGIN??DEFAULT_SIGNAL_ORIGIN;
 const cors=origin=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin'});
 async function respondTo(req,ctx={}){
  try{
   const url=new URL(req.url);const path=url.pathname;
   if(!siteOrigin)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
   if(url.origin!==siteOrigin)return respond(403,{error:'Asal permintaan ditolak.'});
    if(path==='/auth/callback'){
     if(req.method!=='GET')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'GET'});
     const fail=()=>new Response(null,{status:303,headers:{...headers,Location:'/login?error=1'}});
     if(!auth?.configured)return fail();
     const code=url.searchParams.get('code');
     if([...url.searchParams.keys()].some(k=>k!=='code')||url.searchParams.getAll('code').length!==1||!code)return fail();
     if(now()>=verifyWindow){verifyWindow=now()+900000;verifyAttempts=0;}
     if(verifyAttempts>=9)return fail();
     const result=await auth.exchangeCode({headers:Object.fromEntries(req.headers)},code);
     if(result.status!==200){if(!result.local)verifyAttempts++;return fail();}
     // Strict session cookie: land on a same-site page first, because a redirect chain that began in the mail client is cross-site.
     const res=new Response('<!doctype html><html lang="id"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/"><title>Masuk</title></head><body><p>Masuk berhasil. <a href="/">Lanjut</a></p></body></html>',{status:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
     res.headers.append('Set-Cookie',result.cookie);res.headers.append('Set-Cookie',auth.clearPkceCookie());
     return res;
    }
    if(authPaths.has(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     const parsed=await readJson(req);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'});
     if(path==='/auth/logout'){
      const result=await auth.logout({headers:Object.fromEntries(req.headers)});
      return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
     }
     if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
     if(path==='/auth/login'){
      if(Object.keys(parsed.value).join(',')!=='password'||typeof parsed.value.password!=='string')return respond(400,{error:'Permintaan tidak valid.'});
      // Instance-local friction against guessing; Supabase applies its own limits as well.
      if(now()>=loginWindow){loginWindow=now()+900000;loginFailures=0;}
      if(loginFailures>=5)return respond(429,{error:'Terlalu banyak percobaan. Coba lagi nanti.'},{'Retry-After':String(Math.max(1,Math.ceil((loginWindow-now())/1000)))});
      const result=await auth.signInPassword(parsed.value.password);
      if(result.status===200)loginFailures=0;else if(result.status===401||result.status===403)loginFailures++;
      return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
     }
     if(path==='/auth/password'){
      if(Object.keys(parsed.value).join(',')!=='password'||typeof parsed.value.password!=='string')return respond(400,{error:'Permintaan tidak valid.'});
      const result=await auth.setPassword({headers:Object.fromEntries(req.headers)},parsed.value.password);
      return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
     }
     if(Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     if(now()<sendAfter)return respond(429,{error:'Tunggu sebelum meminta tautan lagi.'},{'Retry-After':String(Math.ceil((sendAfter-now())/1000))});
     sendAfter=now()+60000;const result=await auth.sendLink();
     return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
    }
    if(path.startsWith('/auth/passkeys/')){
     const action=path.slice('/auth/passkeys/'.length);
     if(!['status','register-options','register','authenticate-options','authenticate','revoke'].includes(action))return respond(404,{error:'Tidak ditemukan.'});
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
     const identityOnly=['authenticate-options','authenticate'].includes(action);
     const owner=await auth[identityOnly?'authorizeIdentity':'authorize']({headers:Object.fromEntries(req.headers)});
     ctx.cookie=owner.cookie;
     if(owner.status!==200)return respond(owner.status,owner.body);
     if(!passkeys?.configured)return respond(503,{error:'Kunci perangkat belum tersedia.'});
     const parsed=await readJson(req,32768);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'});
     if(!['register','authenticate'].includes(action)&&Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     const methods={'status':'status','register-options':'registrationOptions','register':'verifyRegistration','authenticate-options':'authenticationOptions','authenticate':'verifyAuthentication','revoke':'revoke'};
     const result=await passkeys[methods[action]](owner.user,Object.fromEntries(req.headers),parsed.value);
     if(result.status===200&&['register','authenticate','revoke'].includes(action)){
      // Use renewed session when identity resolution rotated a Supabase refresh token.
      const original=Object.fromEntries(req.headers);
      if(owner.cookie)original.cookie=owner.cookie.split(';',1)[0];
      const update=await auth[action==='register'?'enableDeviceLock':action==='authenticate'?'unlockDevice':'disableDeviceLock']({headers:original});
      ctx.cookie=update.cookie??ctx.cookie;
      return respond(update.status,update.body,result.cookie?{'Set-Cookie':result.cookie}:{});
     }
     return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
    }
    if(path===SIGNAL_PATH){
     const origin=req.headers.get('origin');
     if(origin!==signalOrigin)return respond(403,{error:'Asal permintaan ditolak.'});
     if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,...cors(origin),'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST, OPTIONS',...cors(origin)});
     if(!teaching?.configured)return respond(503,{error:'Konektor belum dikonfigurasi.'},cors(origin));
     // Isolate-local burst limit; the persisted cooldown in D1 is the cross-isolate guard.
     if(now()>=signalWindow){signalWindow=now()+60000;signalCount=0;}
     if(++signalCount>30)return respond(429,{error:'Terlalu banyak sinyal.'},{'Retry-After':'60',...cors(origin)});
     const parsed=await readJson(req,6144);
     if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'},cors(origin));
     if(Object.keys(parsed.value).join(',')!=='idToken')return respond(400,{error:'Permintaan tidak valid.'},cors(origin));
     const result=await teaching.signal(parsed.value.idToken);
     return respond(result.status,result.body,cors(origin));
    }
    if(path==='/money/push'){
     const origin=req.headers.get('origin');
     const allowed=new Set(['https://charisna-money.netlify.app','capacitor://localhost','https://localhost','http://localhost']);
     const extra=allowed.has(origin)?{...cors(origin),'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
     if(req.method==='OPTIONS')return allowed.has(origin)?new Response(null,{status:204,headers:{...headers,...extra}}):respond(403,{error:'Asal permintaan ditolak.'});
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST, OPTIONS',...extra});
     if(!allowed.has(origin))return respond(403,{error:'Asal permintaan ditolak.'});
     const parsed=await readJson(req,32768);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'},extra);
     const result=money?.configured?await money.push(parsed.value):{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body,extra);
    }
    if(path==='/pos/push'){
     const origin=req.headers.get('origin');
     const allowed=new Set(['https://bumi-makmur.my.id','https://www.bumi-makmur.my.id','https://bumi-makmur-pos-ultimate.pages.dev','capacitor://localhost','https://localhost','http://localhost']);
     const extra=allowed.has(origin)?{...cors(origin),'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
     if(req.method==='OPTIONS')return allowed.has(origin)?new Response(null,{status:204,headers:{...headers,...extra}}):respond(403,{error:'Asal permintaan ditolak.'});
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST, OPTIONS',...extra});
     if(!allowed.has(origin))return respond(403,{error:'Asal permintaan ditolak.'});
     const parsed=await readJson(req,32768);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'},extra);
     const result=pos?.configured?await pos.push(parsed.value):{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body,extra);
    }
    if(path==='/kost/push'){
     const origin=req.headers.get('origin');
     const allowed=new Set(['https://nothingtoleft.github.io','capacitor://localhost','https://localhost','http://localhost']);
     const extra=allowed.has(origin)?{...cors(origin),'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{};
     if(req.method==='OPTIONS')return allowed.has(origin)?new Response(null,{status:204,headers:{...headers,...extra}}):respond(403,{error:'Asal permintaan ditolak.'});
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST, OPTIONS',...extra});
     if(!allowed.has(origin))return respond(403,{error:'Asal permintaan ditolak.'});
     const parsed=await readJson(req,32768);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'},extra);
     const result=kost?.configured?await kost.push(parsed.value):{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body,extra);
    }
    if(['/kost/pair','/kost/disconnect'].includes(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     const owner=await auth.authorize({headers:Object.fromEntries(req.headers)});
     if(owner.status!==200)return respond(owner.status,owner.body);
     ctx.cookie=owner.cookie;
     const parsed=await readJson(req);if(parsed.error||Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     const result=kost?.configured?await kost[path==='/kost/pair'?'pair':'disconnect']():{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body);
    }
    if(['/pos/pair','/pos/disconnect'].includes(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     const owner=await auth.authorize({headers:Object.fromEntries(req.headers)});
     if(owner.status!==200)return respond(owner.status,owner.body);
     ctx.cookie=owner.cookie;
     const parsed=await readJson(req);if(parsed.error||Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     const result=pos?.configured?await pos[path==='/pos/pair'?'pair':'disconnect']():{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body);
    }
    if(['/money/pair','/money/disconnect'].includes(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     const owner=await auth.authorize({headers:Object.fromEntries(req.headers)});
     if(owner.status!==200)return respond(owner.status,owner.body);
     ctx.cookie=owner.cookie;
     const parsed=await readJson(req);if(parsed.error||Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     const result=money?.configured?await money[path==='/money/pair'?'pair':'disconnect']():{status:503,body:{error:'Konektor belum tersedia.'}};
     return respond(result.status,result.body);
    }
    if(connectorPaths.has(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
     const owner=await auth.authorize({headers:Object.fromEntries(req.headers)});
     if(owner.status!==200)return respond(owner.status,owner.body);
     ctx.cookie=owner.cookie;
     if(!teaching?.configured)return respond(503,{error:'Konektor belum dikonfigurasi.'});
     const parsed=await readJson(req,path==='/connector/connect'?8192:2048);
     if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'});
     if(path==='/connector/disconnect'){
      if(Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
      const result=await teaching.disconnect();return respond(result.status,result.body);
     }
     if(Object.keys(parsed.value).sort().join(',')!=='idToken,refreshToken')return respond(400,{error:'Permintaan tidak valid.'});
     const result=await teaching.connect(parsed.value);return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
    }
   if(!['GET','HEAD'].includes(req.method))return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'GET, HEAD'});
   if(!publicPaths.has(path)){
    if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
    const result=await auth[['/unlock','/device.mjs'].includes(path)?'authorizeIdentity':'authorize']({headers:Object.fromEntries(req.headers)});
    ctx.cookie=result.cookie;
    if(result.status!==200){
     if(result.status===401&&['/','/unlock','/security'].includes(path))return new Response(null,{status:303,headers:{...headers,Location:'/login'}});
     if(result.status===423&&['/','/security'].includes(path))return new Response(null,{status:303,headers:{...headers,Location:'/unlock'}});
     return respond(result.status,result.body);
    }
    ctx.cookie=result.cookie;
   }
   let response;
   if(path==='/overview.json'){
    const result=teaching?.configured?await teaching.overview():{status:503,body:{state:'source_error',message:'Konektor belum dikonfigurasi.'}};
    response=respond(result.status,result.body);
   }
   else if(path==='/money/overview.json'){
    // The shared GET guard above calls auth.authorize before any financial summary is read.
    const result=money?.configured?await money.overview():{status:503,body:{error:'Konektor belum tersedia.'}};
    response=respond(result.status,result.body);
   }
   else if(path==='/pos/overview.json'){
    const result=pos?.configured?await pos.overview():{status:503,body:{error:'Konektor belum tersedia.'}};
    response=respond(result.status,result.body);
   }
   else if(path==='/kost/overview.json'){
    const result=kost?.configured?await kost.overview():{status:503,body:{error:'Konektor belum tersedia.'}};
    response=respond(result.status,result.body);
   }
   else if(path==='/connector/config')response=teaching?.configured?respond(200,teaching.config()):respond(503,{error:'Konektor belum dikonfigurasi.'});
   else if(assets.has(path)){const [file,type]=assets.get(path);response=new Response(await assetLoader(file),{headers:{...headers,'Content-Type':type,...(path==='/'?{'Content-Security-Policy':connectorCsp}:{})}});}
   else response=respond(404,{error:'Tidak ditemukan.'});
   return response;
  }catch{return new URL(req.url).pathname==='/auth/callback'&&req.method==='GET'?new Response(null,{status:303,headers:{...headers,Location:'/login?error=1'}}):respond(503,{error:'Layanan sementara tidak tersedia.'});}
 }
 return async function handle(req){
  const ctx={};
  const response=await respondTo(req,ctx);
  if(ctx.cookie&&response.status!==401)response.headers.append('Set-Cookie',ctx.cookie);
  return req.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;
 };
}
