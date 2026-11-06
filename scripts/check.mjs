import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
let files=0;
function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
 if(['.git','artifacts','node_modules'].includes(entry.name))continue;
 const path=join(dir,entry.name);
 if(entry.isDirectory())walk(path);
 else if(entry.name.endsWith('.mjs')){
  const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  if(result.status!==0)throw Error(result.stderr);files++;
 }
}}
walk(root);
const publicDir=join(root,'public');
for(const name of readdirSync(publicDir)){
 const text=readFileSync(join(publicDir,name),'utf8');
 if(/https?:\/\/|firebase|supabase|localStorage|sessionStorage/.test(text))throw Error('External service/storage reference found: '+name);
}
console.log(`Syntax OK: ${files} modules. Public bundle has no external URL, cloud SDK or browser storage references.`);
