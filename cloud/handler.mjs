import {getDemoOverview} from '../demo/overview.mjs';
const assets=new Map([
 ['/', ['../public/index.html','text/html; charset=utf-8']],
 ['/app.mjs', ['../public/app.mjs','text/javascript; charset=utf-8']],
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
const authPaths=new Set(['/auth/send-code','/auth/verify','/auth/logout']);

async function readJson(req){
 if(!/^application\/json(?:\s*;|$)/i.test(req.headers.get('content-type')??''))return {error:415};
 const length=req.headers.get('content-length');
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>2048))return {error:413};
 if(!req.body)return {value:{}};
 const reader=req.body.getReader();const chunks=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>2048){await reader.cancel();return {error:413};}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.length;}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  return value&&typeof value==='object'&&!Array.isArray(value)?{value}:{error:400};
 }catch{return {error:400};}finally{reader.releaseLock();}
}

export function createCloudHandler({env=process.env,auth,assetLoader=async()=>{throw Error('Missing asset loader');},now=()=>Date.now()}={}){
 let siteOrigin;
 try{const site=new URL(env.SITE_ORIGIN);if(site.protocol==='https:'&&site.origin===env.SITE_ORIGIN&&!site.username&&!site.password)siteOrigin=site.origin;}catch{/* Fail closed. */}
 // Instance-local friction, not a distributed rate limiter.
 let sendAfter=0,verifyWindow=0,verifyAttempts=0;
 async function respondTo(req){
  try{
   const url=new URL(req.url);const path=url.pathname;
   if(!siteOrigin)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
   if(url.origin!==siteOrigin)return respond(403,{error:'Asal permintaan ditolak.'});
   if(authPaths.has(path)){
    if(req.method!=='POST')return respond(405,{error:'Metode tidak diizinkan.'},{Allow:'POST'});
    if(req.headers.get('origin')!==siteOrigin||req.headers.get('sec-fetch-site')==='cross-site')return respond(403,{error:'Asal permintaan ditolak.'});
    const parsed=await readJson(req);if(parsed.error)return respond(parsed.error,{error:'Permintaan tidak valid.'});
    if(path==='/auth/logout'){
     const result=await auth.logout({headers:Object.fromEntries(req.headers)});
     return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
    }
    if(!auth?.configured)return respond(503,{error:'Akses pemilik belum dikonfigurasi.'});
    let result;
    if(path==='/auth/send-code'){
     if(Object.keys(parsed.value).length)return respond(400,{error:'Permintaan tidak valid.'});
     if(now()<sendAfter)return respond(429,{error:'Tunggu sebelum meminta kode lagi.'},{'Retry-After':String(Math.ceil((sendAfter-now())/1000))});
     sendAfter=now()+60000;result=await auth.sendCode();
    }else{
     if(Object.keys(parsed.value).length!==1||typeof parsed.value.code!=='string'||!/^\d{6,10}$/.test(parsed.value.code))return respond(400,{error:'Kode tidak valid.'});
     if(now()>=verifyWindow){verifyWindow=now()+900000;verifyAttempts=0;}
     if(verifyAttempts>=9)return respond(429,{error:'Terlalu banyak percobaan.'},{'Retry-After':String(Math.ceil((verifyWindow-now())/1000))});
     verifyAttempts++;result=await auth.verifyCode(parsed.value.code);
    }
    return respond(result.status,result.body,result.cookie?{'Set-Cookie':result.cookie}:{});
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
   if(path==='/demo/overview.json'){const data=structuredClone(getDemoOverview());delete data.personal.amount_minor;response=respond(200,data);}
   else if(path==='/demo/personal.json')response=respond(200,{environment:'demo',personal:getDemoOverview().personal});
   else if(assets.has(path)){const [file,type]=assets.get(path);response=new Response(await assetLoader(file),{headers:{...headers,'Content-Type':type}});}
   else response=respond(404,{error:'Tidak ditemukan.'});
   return response;
  }catch{return respond(503,{error:'Layanan sementara tidak tersedia.'});}
 }
 return async function handle(req){
  const response=await respondTo(req);
  return req.method==='HEAD'?new Response(null,{status:response.status,statusText:response.statusText,headers:response.headers}):response;
 };
}
