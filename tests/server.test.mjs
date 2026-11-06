import test from 'node:test';
import assert from 'node:assert/strict';

const getOverview = () => ({period_label:'contoh',businesses:[], personal:{name:'Money Management',amount_minor:'8750000'}});
async function withServer(run) {
  const {createDemoServer} = await import('../server.mjs');
  const server = createDemoServer({getOverview});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('overview hides personal balance and disables caching',async()=>withServer(async base=>{
 const res=await fetch(base+'/demo/overview.json');
 assert.equal(res.status,200);
 assert.match(res.headers.get('cache-control'),/no-store/);
 assert.ok(res.headers.get('content-security-policy').includes("default-src 'self'"));
 const data=await res.json();
 assert.equal(data.personal.amount_minor,undefined);
 assert.ok(!JSON.stringify(data).includes('8750000'));
}));

test('private sample is fetched only through explicit demo endpoint; never cached',async()=>withServer(async base=>{
 const res=await fetch(base+'/demo/personal.json');
 assert.equal(res.status,200);
 assert.equal((await res.json()).personal.amount_minor,'8750000');
 assert.match(res.headers.get('cache-control'),/no-store/);
}));

test('allowlisted static files only; lab, fixtures, secrets and paths are not served',async()=>withServer(async base=>{
 for(const path of ['/demo/fixtures.mjs','/demo/reconcile.mjs','/lab/run.mjs','/.env','/PROJECT_STATUS.md','/anything']) {
  assert.equal((await fetch(base+path)).status,404,path);
 }
 const res=await fetch(base+'/demo/overview.json',{method:'POST'});
 assert.equal(res.status,405);
}));

test('rejects foreign Host to reduce local DNS-rebinding exposure',async()=>withServer(async base=>{
 const http=await import('node:http');
 const code=await new Promise((resolve,reject)=>{
  http.get(base,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);
 });
 assert.equal(code,403);
}));
