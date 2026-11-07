import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPosConnector,validatePosSnapshot} from '../cloud/pos.mjs';
import {createCloudHandler} from '../cloud/handler.mjs';

const snapshot={schema:1,month:'2026-11',branches:[{id:'BMP-001',name:'Cabang Utama',revenue_idr:'120000',transactions:4,profit_estimate_idr:'30000'}]};
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
 return{rows,connector:createPosConnector({env,now:()=>clock}),advance:ms=>{clock+=ms;}};
}

test('POS snapshot keeps branch identity and rejects duplicate or malformed amounts',()=>{
 assert.deepEqual(validatePosSnapshot(snapshot),snapshot);
 assert.throws(()=>validatePosSnapshot({...snapshot,branches:[snapshot.branches[0],snapshot.branches[0]]}));
 assert.throws(()=>validatePosSnapshot({...snapshot,branches:[{...snapshot.branches[0],revenue_idr:120000}]}));
 assert.throws(()=>validatePosSnapshot({...snapshot,branches:[{...snapshot.branches[0],transactions:-1}]}));
});

test('POS pairing encrypts branch data and disconnect revokes sync key',async()=>{
 const f=fixture(),c=f.connector;
 assert.equal((await c.overview()).body.state,'not_connected');
 const {body:{code}}=await c.pair();
 assert.equal((await c.push({pairCode:'A'.repeat(24),snapshot})).status,409);
 const linked=await c.push({pairCode:code,snapshot});
 assert.equal(linked.status,200);
 assert.ok(!f.rows.get('pos:owner').includes('120000'));
 assert.ok(!f.rows.get('pos:owner').includes(linked.body.syncKey));
 assert.equal((await c.push({syncKey:linked.body.syncKey,snapshot})).status,200);
 assert.deepEqual((await c.overview()).body.snapshot,snapshot);
 f.advance(25*60*60*1000);assert.equal((await c.overview()).body.state,'stale');
 await c.disconnect();assert.equal((await c.overview()).body.state,'not_connected');
 assert.equal((await c.push({syncKey:linked.body.syncKey,snapshot})).status,409);
});

test('unreadable POS state requests reconnect and removes only its own row',async()=>{
 const f=fixture();f.rows.set('pos:owner','old-key-ciphertext');f.rows.set('money:owner','untouched');
 assert.equal((await f.connector.overview()).body.state,'needs_reconnect');
 assert.equal(f.rows.has('pos:owner'),false);
 assert.equal(f.rows.get('money:owner'),'untouched');
 const {body:{code}}=await f.connector.pair();
 assert.equal((await f.connector.push({pairCode:code,snapshot})).status,200);
});

test('POS overview requires owner and push requires approved source origin',async()=>{
 let reads=0,pushes=0;
 const pos={configured:true,async overview(){reads++;return{status:200,body:{state:'not_connected'}};},async push(){pushes++;return{status:200,body:{state:'connected'}};}};
 const auth={configured:true,async authorize(){return{status:401,body:{error:'Masuk dahulu.'}};}};
 const handle=createCloudHandler({env:{SITE_ORIGIN:'https://owner.example'},auth,pos});
 assert.equal((await handle(new Request('https://owner.example/pos/overview.json'))).status,401);assert.equal(reads,0);
 assert.equal((await handle(new Request('https://owner.example/pos/push',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}))).status,403);assert.equal(pushes,0);
 const preflight=await handle(new Request('https://owner.example/pos/push',{method:'OPTIONS',headers:{origin:'https://bumi-makmur.my.id'}}));
 assert.equal(preflight.status,204);
 assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://bumi-makmur.my.id');
});
