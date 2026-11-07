import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createKostConnector,validateKostSnapshot} from '../cloud/kost.mjs';
import {createCloudHandler} from '../cloud/handler.mjs';

const snapshot={schema:1,month:'2026-11',source:'local_snapshot',properties:[{id:'P-1',name:'Kost Utama',occupied_rooms:2,total_rooms:3,paid_this_month_idr:'1200000',unpaid_bills_idr:'200000'}],unassigned_bills:0};
function fixture(){
 const rows=new Map();let clock=Date.parse('2026-11-07T00:00:00Z');
 const db={prepare(sql){return{bind(...args){return{
  async first(){return rows.has(args[0])?{payload:rows.get(args[0])}:null;},
  async run(){
   if(sql.startsWith('INSERT')){rows.set(args[0],args[1]);return{meta:{changes:1}};}
   if(sql.startsWith('DELETE')){const changes=rows.has(args[0])&&(!sql.includes('AND payload')||rows.get(args[0])===args[1])?1:0;if(changes)rows.delete(args[0]);return{meta:{changes}};}
   if(sql.startsWith('UPDATE')){const changes=rows.get(args[1])===args[2]?1:0;if(changes)rows.set(args[1],args[0]);return{meta:{changes}};}
   throw Error(sql);
  }
 };}};}};
 const env={TEACHING_STATE:db,SESSION_SECRET:'x'.repeat(64),SITE_ORIGIN:'https://owner.example'};
 return{rows,connector:createKostConnector({env,now:()=>clock}),advance:ms=>{clock+=ms;}};
}

test('KOST validates per-property aggregates and rejects personal details',()=>{
 assert.deepEqual(validateKostSnapshot(snapshot),snapshot);
 assert.throws(()=>validateKostSnapshot({...snapshot,properties:[snapshot.properties[0],snapshot.properties[0]]}));
 assert.throws(()=>validateKostSnapshot({...snapshot,properties:[{...snapshot.properties[0],occupied_rooms:4}]}));
 assert.throws(()=>validateKostSnapshot({...snapshot,properties:[{...snapshot.properties[0],paid_this_month_idr:-1}]}));
 const extra=validateKostSnapshot({...snapshot,tenantName:'Private Name',properties:[{...snapshot.properties[0],phone:'08123'}]});
 assert.doesNotMatch(JSON.stringify(extra),/Private Name|08123/);
});

test('KOST pairing encrypts data, stale labels, and disconnect revokes key',async()=>{
 const f=fixture(),c=f.connector;
 assert.equal((await c.overview()).body.state,'not_connected');
 const {body:{code}}=await c.pair();
 assert.equal((await c.push({pairCode:'A'.repeat(24),snapshot})).status,409);
 const linked=await c.push({pairCode:code,snapshot});
 assert.equal(linked.status,200);
 assert.ok(!f.rows.get('kost:owner').includes('1200000'));
 assert.ok(!f.rows.get('kost:owner').includes(linked.body.syncKey));
 assert.equal((await c.push({syncKey:linked.body.syncKey,snapshot})).status,200);
 assert.deepEqual((await c.overview()).body.snapshot,snapshot);
 f.advance(25*60*60*1000);assert.equal((await c.overview()).body.state,'stale');
 await c.disconnect();assert.equal((await c.overview()).body.state,'not_connected');
 assert.equal((await c.push({syncKey:linked.body.syncKey,snapshot})).status,409);
});

test('unreadable KOST state requests reconnect without deleting other connectors',async()=>{
 const f=fixture();f.rows.set('kost:owner','old-key-ciphertext');f.rows.set('money:owner','untouched');
 assert.equal((await f.connector.overview()).body.state,'needs_reconnect');
 assert.equal(f.rows.has('kost:owner'),false);
 assert.equal(f.rows.get('money:owner'),'untouched');
});

test('KOST overview requires owner; push permits only source origin',async()=>{
 let reads=0,pushes=0;
 const kost={configured:true,async overview(){reads++;return{status:200,body:{state:'not_connected'}};},async push(){pushes++;return{status:200,body:{state:'connected'}};}};
 const auth={configured:true,async authorize(){return{status:401,body:{error:'Masuk dahulu.'}};}};
 const handle=createCloudHandler({env:{SITE_ORIGIN:'https://owner.example'},auth,kost});
 assert.equal((await handle(new Request('https://owner.example/kost/overview.json'))).status,401);assert.equal(reads,0);
 assert.equal((await handle(new Request('https://owner.example/kost/push',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}))).status,403);assert.equal(pushes,0);
 const preflight=await handle(new Request('https://owner.example/kost/push',{method:'OPTIONS',headers:{origin:'https://nothingtoleft.github.io'}}));
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://nothingtoleft.github.io');
});
