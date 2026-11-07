import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const loginURL = new URL('../cloud/login.mjs', import.meta.url);
async function loginModule() {
 assert.equal(await readFile(loginURL, 'utf8').then(()=>true, ()=>false), true, 'login controller exists');
 return import(loginURL);
}

test('send link posts an empty same-origin body, blocks duplicate requests and waits 60 seconds', async()=>{
 const {createLoginController}=await loginModule();
 let now=1000;let finish;const requests=[];
 const controller=createLoginController({now:()=>now,fetch:async(url,options)=>{requests.push({url,options});return new Promise(resolve=>finish=resolve);}});
 const pending=controller.sendLink();
 assert.equal(controller.state.busy,true);
 await controller.sendLink();
 assert.equal(requests.length,1);
 assert.deepEqual(requests[0],{url:'/auth/send-link',options:{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'}});
 finish({ok:true});await pending;
 assert.equal(controller.state.busy,false);
 assert.equal(controller.state.cooldown,60);
 assert.match(controller.state.message,/Jika permintaan dapat diproses/);
 await controller.sendLink();assert.equal(requests.length,1);
 now+=59999;assert.equal(controller.state.cooldown,1);
 now+=1;assert.equal(controller.state.cooldown,0);
});

test('HTTP and network failures never expose provider details and retry clears errors',async()=>{
 const {createLoginController}=await loginModule();let now=0;let fail=true;
 const controller=createLoginController({now:()=>now,fetch:async()=>{if(fail)return {ok:false,status:429,json:()=>assert.fail('never read provider message')};return {ok:true};}});
 await controller.sendLink();assert.match(controller.state.error,/belum dapat diproses/);assert.equal(controller.state.cooldown,60);
 now=60000;fail=false;await controller.sendLink();assert.equal(controller.state.error,'');
 const offline=createLoginController({fetch:async()=>{throw Error('private upstream details');}});
 await offline.sendLink();assert.match(offline.state.error,/belum dapat diproses/);assert.equal(offline.state.busy,false);
});


function fakePage(){
 const nodes=new Map();const events=new Map();
 const node=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{textContent:'',value:'',hidden:false,disabled:false,attributes:{},listeners:{},classList:{add(){},remove(){}},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},addEventListener(k,v){this.listeners[k]=v;},focus(){this.focused=true;},close(){this.open=false;},querySelectorAll(){return [];}});
  return nodes.get(selector);
 };
 const navigations=[];let reloads=0;
 const window={location:{search:"",replace:url=>navigations.push(url),reload:()=>reloads++},addEventListener:(key,handler)=>events.set(key,handler),setInterval:handler=>{events.set('tick',handler);return 1;},clearInterval:()=>{}};
 const document={querySelector:node,querySelectorAll:()=>[]};
 return {node,document,window,events,navigations,get reloads(){return reloads;},submit:selector=>node(selector).listeners.submit({preventDefault(){}})};
}

test('login form intercepts submission, paints busy state and reloads persisted pages',async()=>{
 const {mountLogin}=await loginModule();const page=fakePage();page.window.location.search='';let finish;let now=0;
 mountLogin({document:page.document,window:page.window,now:()=>now,fetch:async()=>new Promise(resolve=>finish=resolve)});
 assert.equal(page.node('#send-link').disabled,false);
 const send=page.submit('#send-link-form');assert.equal(page.node('#send-link').disabled,true);
 finish({ok:true});await send;assert.match(page.node('#send-cooldown').textContent,/60 detik/);
 now=60000;page.events.get('tick')();assert.equal(page.node('#send-link').disabled,false);
 page.events.get('pageshow')({persisted:true});assert.equal(page.reloads,1);
});

test('callback failure redirect shows a generic error',async()=>{
 const {mountLogin}=await loginModule();const page=fakePage();page.window.location.search='?error=1';
 mountLogin({document:page.document,window:page.window,fetch:async()=>({ok:true})});
 assert.match(page.node('#login-error').textContent,/Tautan tidak valid/);
});

test('cooldown ticks do not repeat live-region announcements',async()=>{
 const {mountLogin}=await loginModule();const page=fakePage();page.window.location.search='';let text='';let writes=0;
 Object.defineProperty(page.node('#login-status'),'textContent',{get:()=>text,set:value=>{text=value;writes++;}});
 mountLogin({document:page.document,window:page.window,fetch:async()=>({ok:true})});
 await page.submit('#send-link-form');const before=writes;
 page.events.get('tick')();page.events.get('tick')();assert.equal(writes,before);
});

test('initial unauthorized dashboard clears balance and replaces login history',async()=>{
 const {mount}=await import('../public/app.mjs');assert.equal(typeof mount,'function','dashboard supports a testable mount');
 const page=fakePage();page.node('#balance').textContent='Rp8.750.000';
 const app=mount({document:page.document,window:page.window,fetch:async()=>({ok:false,status:401})});await app.ready;
 assert.equal(page.node('#balance').textContent,'Saldo contoh disembunyikan');assert.equal(page.node('#dashboard').hidden,true);assert.deepEqual(page.navigations,['/login']);
});

test('personal 401 and pagehide erase balance; persisted page reloads for authorization',async()=>{
 const {mount}=await import('../public/app.mjs');assert.equal(typeof mount,'function');const page=fakePage();
 let unauthorized=false;let pending;let delay=false;
 const app=mount({document:page.document,window:page.window,fetch:async url=>url.includes('overview')?{ok:true,json:async()=>({businesses:[]})}:delay?new Promise(resolve=>pending=resolve):{ok:!unauthorized,status:unauthorized?401:200,json:async()=>({personal:{amount_minor:'8750000'}})}});await app.ready;
 await page.node('#toggle-balance').listeners.click();assert.equal(page.node('#balance').textContent,'Rp8.750.000');
 page.events.get('pagehide')();assert.equal(page.node('#balance').textContent,'Saldo contoh disembunyikan');
 page.events.get('pageshow')({persisted:true});assert.equal(page.reloads,1);
 const other=fakePage();unauthorized=true;
 const another=mount({document:other.document,window:other.window,fetch:async url=>url.includes('overview')?{ok:true,json:async()=>({businesses:[]})}:{ok:false,status:401}});await another.ready;
 await other.node('#toggle-balance').listeners.click();assert.deepEqual(other.navigations,['/login']);assert.equal(other.node('#balance').textContent,'Saldo contoh disembunyikan');
 const late=fakePage();delay=true;const last=mount({document:late.document,window:late.window,fetch:async url=>url.includes('overview')?{ok:true,json:async()=>({businesses:[]})}:new Promise(resolve=>pending=resolve)});await last.ready;
 const reveal=late.node('#toggle-balance').listeners.click();late.events.get('pagehide')();pending({ok:true,json:async()=>({personal:{amount_minor:'8750000'}})});await reveal;
 assert.equal(late.node('#balance').textContent,'Saldo contoh disembunyikan');
});

test('logout intercepts form, blocks duplicate submits, clears balance and redirects only after server response',async()=>{
 const {mount}=await import('../public/app.mjs');assert.equal(typeof mount,'function');const page=fakePage();const requests=[];let finish;
 const app=mount({document:page.document,window:page.window,fetch:async(url,options)=>{if(url.includes('overview'))return {ok:true,json:async()=>({businesses:[]})};requests.push({url,options});return new Promise(resolve=>finish=resolve);}});await app.ready;
 page.node('#balance').textContent='Rp8.750.000';const logout=page.submit('#logout-form');
 assert.equal(page.node('#balance').textContent,'Saldo contoh disembunyikan');assert.equal(page.node('#logout-button').disabled,true);assert.deepEqual(page.navigations,[]);
 await page.submit('#logout-form');assert.equal(requests.length,1);assert.deepEqual(requests[0],{url:'/auth/logout',options:{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'}});
 finish({ok:false,status:503});await logout;assert.deepEqual(page.navigations,[]);assert.match(page.node('#logout-status').textContent,/Belum dapat keluar/);assert.equal(page.node('#logout-button').disabled,false);
 const retry=page.submit('#logout-form');finish({ok:true});await retry;assert.deepEqual(page.navigations,['/login']);assert.equal(page.node('#dashboard').hidden,true);
});

test('cloud wording distinguishes server access from visual privacy and logout is a safe form',async()=>{
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8');
 assert.match(html,/<form[^>]*id="logout-form"[^>]*action="\/auth\/logout"[^>]*method="post"/);
 assert.match(html,/id="logout-button"[^>]*disabled/);assert.match(html,/Demo cloud/);assert.match(html,/autentikasi server/);assert.doesNotMatch(html,/Prototipe lokal/);
 const css=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
 assert.match(css,/input:focus-visible/);assert.match(css,/\.login-card/);assert.match(css,/button:disabled/);
});

test('login document is an accessible, amount-free, same-origin owner sign-in',async()=>{
 const html=await readFile(new URL('../cloud/login.html',import.meta.url),'utf8').catch(()=> '');
 assert.match(html,/<html lang="id"/);
    assert.match(html,/id="send-link"/);
 assert.match(html,/role="alert"/);assert.match(html,/role="status"/);
 assert.match(html,/src="\/login.mjs"/);assert.match(html,/href="\/styles.css"/);
 assert.match(html,/30 hari/);assert.match(html,/SUMBER NYATA/);
 assert.doesNotMatch(html,/Rp[\d .]|<style|style=|<script(?![^>]*src=)|https?:\/\//);
});
