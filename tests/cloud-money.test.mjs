import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMoneyConnector,validateMoneySnapshot} from '../cloud/money.mjs';
import {createCloudHandler} from '../cloud/handler.mjs';

const snapshot={schema:1,month:'2026-11',profiles:[{id:'personal',name:'Saya',currency:'IDR',scale:0,quality:'complete',balance_minor:'120000',income_minor:'50000',expense_minor:'30000'}]};
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
  return{rows,connector:createMoneyConnector({env,now:()=>clock}),advance:ms=>{clock+=ms;}};
}

test('money snapshot validates per-profile currency, minor units and missing FX',()=>{
  assert.deepEqual(validateMoneySnapshot(snapshot),snapshot);
  assert.throws(()=>validateMoneySnapshot({...snapshot,profiles:[{...snapshot.profiles[0],scale:2}]}));
  assert.throws(()=>validateMoneySnapshot({...snapshot,profiles:[snapshot.profiles[0],snapshot.profiles[0]]}));
  assert.throws(()=>validateMoneySnapshot({...snapshot,profiles:[{...snapshot.profiles[0],balance_minor:null}]}));
  assert.equal(validateMoneySnapshot({...snapshot,profiles:[{...snapshot.profiles[0],quality:'fx_unavailable',balance_minor:null}]}).profiles[0].balance_minor,null);
});

test('money pairing uses one-time code, stores encrypted snapshot, and disconnect revokes key',async()=>{
  const f=fixture(),c=f.connector;
  assert.equal((await c.overview()).body.state,'not_connected');
  const {body:{code}}=await c.pair();
  assert.equal(code.length,24);
  assert.equal((await c.push({pairCode:'A'.repeat(24),snapshot})).status,409);
  const first=await c.push({pairCode:code,snapshot});
  assert.equal(first.status,200);assert.equal(first.body.syncKey.length,43);
  assert.ok(!f.rows.get('money:owner').includes('120000'));
  assert.ok(!f.rows.get('money:owner').includes(first.body.syncKey));
  assert.equal((await c.push({pairCode:code,snapshot})).status,403);
  assert.equal((await c.push({syncKey:first.body.syncKey,snapshot})).status,200);
  assert.deepEqual((await c.overview()).body.snapshot,snapshot);
  f.advance(25*60*60*1000);assert.equal((await c.overview()).body.state,'stale');
  await c.disconnect();assert.equal((await c.overview()).body.state,'not_connected');
  assert.equal((await c.push({syncKey:first.body.syncKey,snapshot})).status,409);
});

test('expired pairing and old write after disconnect cannot restore data',async()=>{
  const f=fixture(),c=f.connector,{body:{code}}=await c.pair();
  f.advance(11*60*1000);assert.equal((await c.push({pairCode:code,snapshot})).status,409);
  const {body:{code:newCode}}=await c.pair();
  const linked=await c.push({pairCode:newCode,snapshot});
  const old=f.rows.get('money:owner');
  await c.disconnect();
  const updated=await f.rows.get('money:owner');assert.equal(updated,undefined);
  assert.equal((await c.push({syncKey:linked.body.syncKey,snapshot})).status,409);
  assert.notEqual(old,updated);
});

test('unreadable MONEY state requests reconnect and D1 failure stays 503',async()=>{
  const f=fixture(),c=f.connector;
  f.rows.set('money:owner','old-key-ciphertext');
  assert.equal((await c.overview()).body.state,'needs_reconnect');
  assert.equal(f.rows.has('money:owner'),false);
  const broken={prepare(){throw Error('d1 down');}};
  const down=createMoneyConnector({env:{TEACHING_STATE:broken,SESSION_SECRET:'x'.repeat(64),SITE_ORIGIN:'https://owner.example'}});
  assert.equal((await down.overview()).status,503);
});

test('financial overview is owner-only; source push is origin-bound',async()=>{
  let reads=0,pushes=0;
  const money={configured:true,async overview(){reads++;return{status:200,body:{state:'not_connected'}};},async push(){pushes++;return{status:200,body:{state:'connected'}};}};
  const auth={configured:true,async authorize(){return{status:401,body:{error:'Masuk dahulu.'}};}};
  const handle=createCloudHandler({env:{SITE_ORIGIN:'https://owner.example'},auth,money});
  const denied=await handle(new Request('https://owner.example/money/overview.json'));
  assert.equal(denied.status,401);assert.equal(reads,0);
  const foreign=await handle(new Request('https://owner.example/money/push',{method:'POST',headers:{origin:'https://attacker.example','content-type':'application/json'},body:'{}'}));
  assert.equal(foreign.status,403);assert.equal(pushes,0);
  const preflight=await handle(new Request('https://owner.example/money/push',{method:'OPTIONS',headers:{origin:'https://charisna-money.netlify.app'}}));
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),'https://charisna-money.netlify.app');
});
