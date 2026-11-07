import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const ID='kost:owner', PAIR_ID='kost:pair';
const CODE=/^[A-Z2-9]{24}$/, KEY=/^[A-Za-z0-9_-]{43}$/;
const MONTH=/^\d{4}-(0[1-9]|1[0-2])$/, AMOUNT=/^-?\d{1,18}$/;
const STALE=24*60*60*1000, PAIR_TTL=10*60*1000;
const result=(status,body)=>({status,body});

export function validateKostSnapshot(input){
  if(!input||input.schema!==1||!MONTH.test(input.month)||input.source!=='local_snapshot'||!Array.isArray(input.properties)||input.properties.length>100||!Number.isSafeInteger(input.unassigned_bills)||input.unassigned_bills<0)throw Error('snapshot');
  const seen=new Set();
  const properties=input.properties.map(property=>{
    if(!property||typeof property.id!=='string'||!/^[\w-]{1,100}$/.test(property.id)||seen.has(property.id)||typeof property.name!=='string'||!property.name.trim()||property.name.length>100)throw Error('property');
    seen.add(property.id);
    if(!Number.isSafeInteger(property.occupied_rooms)||!Number.isSafeInteger(property.total_rooms)||property.occupied_rooms<0||property.occupied_rooms>property.total_rooms||property.total_rooms>100000)throw Error('rooms');
    for(const key of ['paid_this_month_idr','unpaid_bills_idr'])if(typeof property[key]!=='string'||!AMOUNT.test(property[key])||!Number.isSafeInteger(Number(property[key]))||Number(property[key])<0)throw Error('amount');
    return {id:property.id,name:property.name.trim(),occupied_rooms:property.occupied_rooms,total_rooms:property.total_rooms,paid_this_month_idr:property.paid_this_month_idr,unpaid_bills_idr:property.unpaid_bills_idr};
  });
  return {schema:1,month:input.month,source:'local_snapshot',properties,unassigned_bills:input.unassigned_bills};
}

export function createKostConnector({env,now=()=>Date.now()}={}){
  const db=env?.TEACHING_STATE;
  const configured=Boolean(db?.prepare&&typeof env?.SESSION_SECRET==='string'&&env.SESSION_SECRET.length>=32&&/^https:\/\/[^/]+$/.test(env.SITE_ORIGIN||''));
  const key=configured?createHash('sha256').update('charisna-kost-v1\0').update(env.SESSION_SECRET).digest():null;
  const aad=Buffer.from(`${env?.SITE_ORIGIN||''}|kost-v1`);
  const seal=data=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);return Buffer.concat([iv,cipher.update(JSON.stringify(data),'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64url');};
  const open=value=>{const bytes=Buffer.from(value,'base64url');if(bytes.length<29||bytes.toString('base64url')!==value)throw Error('state');const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAAD(aad);decipher.setAuthTag(bytes.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString());};
  const read=async id=>(await db.prepare('SELECT payload FROM connector_state WHERE id = ?').bind(id).first())?.payload||null;
  const write=async(id,data)=>db.prepare('INSERT INTO connector_state (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(id,seal(data)).run();
  const del=async id=>db.prepare('DELETE FROM connector_state WHERE id = ?').bind(id).run();
  async function pair(){
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code=Array.from(randomBytes(24),byte=>alphabet[byte%alphabet.length]).join('');
    await write(PAIR_ID,{hash:createHash('sha256').update(code).digest('hex'),expires:now()+PAIR_TTL});
    return result(200,{code,expires_at:new Date(now()+PAIR_TTL).toISOString()});
  }
  async function overview(){
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    let raw;try{raw=await read(ID);}catch{return result(503,{error:'Ringkasan sementara tidak tersedia.'});}
    if(!raw)return result(200,{state:'not_connected'});
    let data;try{data=open(raw);}catch{
      await db.prepare('DELETE FROM connector_state WHERE id = ? AND payload = ?').bind(ID,raw).run();
      return result(200,{state:'needs_reconnect'});
    }
    return result(200,{state:now()-data.receivedAt>STALE?'stale':'connected',snapshot:data.snapshot,received_at:new Date(data.receivedAt).toISOString()});
  }
  async function disconnect(){
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    await del(PAIR_ID);await del(ID);return result(200,{state:'not_connected'});
  }
  async function push(input){
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    let snapshot;try{snapshot=validateKostSnapshot(input?.snapshot);}catch{return result(400,{error:'Ringkasan tidak valid.'});}
    const raw=await read(ID);let existing=null;
    try{if(raw)existing=open(raw);}catch{return result(409,{error:'Hubungkan kembali dari SuperApp.'});}
    let syncKey=null;
    if(existing){
      if(!KEY.test(input?.syncKey||''))return result(403,{error:'Kunci sinkron diperlukan.'});
      const actual=createHash('sha256').update(input.syncKey).digest();
      if(!timingSafeEqual(actual,Buffer.from(existing.syncHash,'hex')))return result(403,{error:'Kunci sinkron salah.'});
    }else{
      if(!CODE.test(input?.pairCode||''))return result(409,{error:'Kode penghubung diperlukan.'});
      const pairRaw=await read(PAIR_ID);let state;
      try{state=pairRaw&&open(pairRaw);}catch{return result(409,{error:'Kode penghubung tidak valid.'});}
      const actual=createHash('sha256').update(input.pairCode).digest();
      if(!state||now()>state.expires||!timingSafeEqual(actual,Buffer.from(state.hash,'hex')))return result(409,{error:'Kode penghubung tidak valid.'});
      const consumed=await db.prepare('DELETE FROM connector_state WHERE id = ? AND payload = ?').bind(PAIR_ID,pairRaw).run();
      if(consumed?.meta?.changes!==1)return result(409,{error:'Kode sudah digunakan.'});
      syncKey=randomBytes(32).toString('base64url');
    }
    const data={syncHash:existing?.syncHash||createHash('sha256').update(syncKey).digest('hex'),snapshot,receivedAt:now()};
    if(existing){
      const updated=await db.prepare('UPDATE connector_state SET payload = ? WHERE id = ? AND payload = ?').bind(seal(data),ID,raw).run();
      if(updated?.meta?.changes!==1)return result(409,{error:'Koneksi berubah. Coba lagi.'});
    }else await write(ID,data);
    return result(200,{state:'connected',...(syncKey?{syncKey}:{})});
  }
  return {configured,pair,overview,disconnect,push};
}
