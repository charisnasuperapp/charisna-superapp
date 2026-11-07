import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLoginController,mountLogin} from '../cloud/login.mjs';

test('password login posts only the password and invokes success without storing it', async()=>{
 const calls=[];let success=0,finish;
 const c=createLoginController({fetch:async(...args)=>{calls.push(args);return new Promise(r=>finish=r);},onSuccess:()=>success++});
 const pending=c.signIn('synthetic-owner-password');
 assert.equal(c.state.busy,true);
 await c.signIn('duplicate-password');assert.equal(calls.length,1);
 assert.equal(calls[0][0],'/auth/login');
 assert.equal(calls[0][1].body,JSON.stringify({password:'synthetic-owner-password'}));
 assert.equal(calls[0][1].cache,'no-store');
 finish({ok:true});await pending;
 assert.equal(success,1);assert.equal(c.state.busy,false);
 assert.ok(!JSON.stringify(c.state).includes('synthetic-owner-password'));
});

test('password rejection and rate limits display safe errors, never provider detail',async()=>{
 for(const status of [401,403,429,503]){
  const c=createLoginController({fetch:async()=>({ok:false,status,json:()=>assert.fail('no upstream errors')})});
  await c.signIn('synthetic-wrong-password');
  assert.ok(c.state.error);assert.equal(c.state.busy,false);
  assert.match(c.state.error,status===429?/Terlalu banyak/:status===401||status===403?/Sandi atau email/:/belum dapat diproses/);
 }
});

test('password form clears the secret before awaiting network and redirects on success',async()=>{
 const nodes=new Map();const node=k=>{if(!nodes.has(k))nodes.set(k,{value:'',textContent:'',disabled:false,listeners:{},setAttribute(){},addEventListener(k,f){this.listeners[k]=f;}});return nodes.get(k);};
 let finish;const paths=[];
 const window={location:{search:'',replace:p=>paths.push(p)},setInterval:()=>1,clearInterval(){},addEventListener(){}};
 mountLogin({document:{querySelector:node},window,fetch:async()=>new Promise(r=>finish=r)});
 node('#password').value='synthetic-password-123';
 const pending=node('#password-form').listeners.submit({preventDefault(){}});
 assert.equal(node('#password').value,'');assert.equal(node('#password-login').disabled,true);
 finish({ok:true});await pending;
 assert.deepEqual(paths,['/']);
});

test('password is primary; recovery link is a collapsed fallback, session wording is accurate',async()=>{
 const html=await readFile(new URL('../cloud/login.html',import.meta.url),'utf8');
 assert.match(html,/id="password-form"/);assert.match(html,/type="email"[^>]*autocomplete="username"/);
 assert.match(html,/type="password"[^>]*autocomplete="current-password"/);
 assert.match(html,/<details[\s>]/);assert.match(html,/30 hari/);
 assert.doesNotMatch(html,/15 menit|Tidak perlu kata sandi|Sesi berlaku 15/);
});
