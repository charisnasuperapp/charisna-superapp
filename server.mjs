import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
const assets = new Map([
 ['/', ['public/index.html','text/html; charset=utf-8']],
 ['/app.mjs',['public/app.mjs','text/javascript; charset=utf-8']],
 ['/styles.css',['public/styles.css','text/css; charset=utf-8']]
]);
const headers = {
 'Cache-Control':'no-store',
 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()'
};
export function createDemoServer({getOverview}) {
 return http.createServer(async (req,res)=>{
  const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(typeof data==='string'||Buffer.isBuffer(data)?data:JSON.stringify(data));};
  try {
   if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || '')) return send(403,{error:'Loopback host only'});
   if(req.method!=='GET') return send(405,{error:'Demo is read-only'});
   const path=new URL(req.url,'http://127.0.0.1').pathname;
   if(path==='/demo/overview.json') {
    const data=structuredClone(getOverview()); delete data.personal.amount_minor;
    return send(200,data);
   }
   if(path==='/demo/personal.json') return send(200,{environment:'demo',personal:getOverview().personal});
   if(!assets.has(path)) return send(404,{error:'Not found'});
   const [file,type]=assets.get(path);
   return send(200,await readFile(new URL(file,import.meta.url)),type);
  } catch { return send(500,{error:'Prototipe tidak dapat dimuat. Periksa terminal lokal.'}); }
 });
}
if(process.argv[1] && import.meta.url===pathToFileURL(fileURLToPath(pathToFileURL(process.argv[1]))).href){
 const {getDemoOverview}=await import('./demo/overview.mjs');
 const port=Number(process.env.PORT||4173);
 if(!Number.isInteger(port)||port<1||port>65535) throw Error('Invalid PORT');
 const server=createDemoServer({getOverview:getDemoOverview});
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`CHARISNA demo only: http://127.0.0.1:${port} — no production auth or data`));
}
