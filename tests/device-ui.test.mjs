import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webAuthnOptions,credentialJSON,mountDevice} from '../cloud/device.mjs';
test('WebAuthn options decode binary fields, preserving server UV policy',()=>{
 const result=webAuthnOptions({challenge:'AQID',user:{id:'BAUG',name:'owner'},allowCredentials:[{id:'BwgJ',type:'public-key'}],excludeCredentials:[{id:'Cg',type:'public-key'}],userVerification:'required'});
 assert.deepEqual([...result.challenge],[1,2,3]);assert.deepEqual([...result.user.id],[4,5,6]);assert.equal(result.userVerification,'required');
 assert.deepEqual([...result.allowCredentials[0].id],[7,8,9]);assert.deepEqual([...result.excludeCredentials[0].id],[10]);
});
test('credential serialization includes signature and authenticator data but no device secrets',()=>{
 const buffer=new Uint8Array([1,2,3]).buffer;
 const result=credentialJSON({id:'id',rawId:buffer,type:'public-key',authenticatorAttachment:'platform',getClientExtensionResults:()=>({}),response:{clientDataJSON:buffer,authenticatorData:buffer,signature:buffer,userHandle:null}});
 assert.equal(result.response.signature,'AQID');assert.equal(result.response.userHandle,null);assert.equal(result.rawId,'AQID');
});
test('unlock starts only after user gesture and posts a browser assertion, then redirects',async()=>{
 const nodes=new Map();const $=s=>{if(!nodes.has(s))nodes.set(s,{textContent:'',disabled:false,value:'',listeners:{},addEventListener(k,f){this.listeners[k]=f;}});return nodes.get(s);};
 let ceremonies=0;const urls=[],paths=[];
 const doc={querySelector:$};
 const window={location:{replace:p=>paths.push(p)},PublicKeyCredential:function(){},navigator:{credentials:{get:async()=>{ceremonies++;return {id:'id',rawId:new Uint8Array([1]).buffer,type:'public-key',response:{clientDataJSON:new ArrayBuffer(0),authenticatorData:new ArrayBuffer(0),signature:new ArrayBuffer(0)},getClientExtensionResults:()=>({})};}}}};
 const fetch=async(url)=>{urls.push(url);return {ok:true,json:async()=>({challenge:'AQID',allowCredentials:[],userVerification:'required'})};};
 mountDevice({document:doc,window,fetch});assert.equal(ceremonies,0);
 await $('#unlock-button').listeners.click();assert.equal(ceremonies,1);assert.deepEqual(paths,['/']);
 assert.deepEqual(urls,['/auth/passkeys/authenticate-options','/auth/passkeys/authenticate']);
});
