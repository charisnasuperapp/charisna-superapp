const assets=new Map([
 ['/', ['./overview.html','text/html; charset=utf-8']],
 ['/app.mjs', ['./overview.mjs','text/javascript; charset=utf-8']],
 ['/styles.css', ['../public/styles.css','text/css; charset=utf-8']]
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
assets.set('/login',['./login.html','text/html; charset=utf-8']);
assets.set('/login.mjs',['./login.mjs','text/javascript; charset=utf-8']);
const publicPaths=new Set(['/login','/login.mjs','/styles.css']);
const authPaths=new Set(['/auth/send-link','/auth/logout']);
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

export function createCloudHandler({env=process.env,auth,teaching,assetLoader=async()=>{throw Error('Missing asset loader');},now=()=>Date.now()}={}){
 let siteOrigin;
 try{const site=new URL(env.SITE_ORIGIN);if(site.protocol==='https:'&&site.origin===env.SITE_ORIGIN&&!site.username&&!site.password)siteOrigin=site.origin;}catch{/* Fail closed. */}
 // Instance-local friction, not a distributed rate limiter.
 let sendAfter=0,verifyWindow=0,verifyAttempts=0,signalWindow=0,signalCount=0;
 // The only cross-origin caller allowed: the MySalary web app. CORS is a browser rule, not authentication; the Firebase ID token is.
 const signalOrigin=env.TEACHING_SIGNAL_ORIGIN??DEFAULT_SIGNAL_ORIGIN;
 const cors=origin=>({'Access-Control-Allow-Origin':origin,'Vary':'Origin'});
 async function respondTo(req){
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
     if(Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     if(now()<sendAfter)return respond(429,{error:'Tunggu sebelum meminta tautan lagi.'},{'Retry-After':String(Math.ceil((sendAfter-now())/1000))});
     sendAfter=now()+60000;const result=await auth.sendLink();
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
    if(connectorPaths.has(path)){
     if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
     if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
     if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
     const owner=await auth.authorize({headers:Object.fromEntries(req.headers)});
     if(owner.status!==200)return respond(owner.status,owner.body);
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
    const result=await auth.authorize({headers:Object.fromEntries(req.headers)});
    if(result.status!==200){
     if(result.status===401&&path==='/')return new Response(null,{status:303,headers:{...headers,Location:'/login'}});
     return respond(result.status,result.body);
    }
   }
   let response;
   if(path==='/overview.json'){
    const result=teaching?.configured?await teaching.overview():{status:503,body:{state:'source_error',message:'Konektor belum dikonfigurasi.'}};
    response=respond(result.status,result.body);
   }
   else if(path==='/connector/config')response=teaching?.configured?respond(200,teaching.config()):respond(503,{error:'Konektor belum dikonfigurasi.'});
   else if(assets.has(path)){const [file,type]=assets.get(path);response=new Response(await assetLoader(file),{headers:{...headers,'Content-Type':type,...(path==='/'?{'Content-Security-Policy':connectorCsp}:{})}});}
   else response=respond(404,{error:'Tidak ditemukan.'});
   return response;
  }catch{return new URL(req.url).pathname==='/auth/callback'&&req.method==='GET'?new Response(null,{status:303,headers:{...headers,Location:'/login?error=1'}}):respond(503,{error:'Layanan sementara tidak tersedia.'});}
 }
 return async function handle(req){
  const response=await respondTo(req);
  return req.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;
 };
}
