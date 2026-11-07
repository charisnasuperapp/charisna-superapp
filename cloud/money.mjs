import {createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const ID = 'money:owner';
const PAIR_ID = 'money:pair';
const TTL = 10 * 60 * 1000;
const STALE = 24 * 60 * 60 * 1000;
const CODE = /^[A-Z2-9]{24}$/;
const SYNC_KEY = /^[A-Za-z0-9_-]{43}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DECIMAL = /^-?\d{1,18}$/;
const currencyScale = code => new Intl.NumberFormat('en', {style:'currency', currency:code}).resolvedOptions().maximumFractionDigits;

export function validateMoneySnapshot(input) {
  if (!input || input.schema !== 1 || !MONTH.test(input.month) || !Array.isArray(input.profiles) || input.profiles.length > 100) throw Error('snapshot');
  const ids = new Set();
  const profiles = input.profiles.map(p => {
    if (!p || typeof p.id !== 'string' || !/^[\w-]{1,100}$/.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || p.name.trim().length < 1 || p.name.length > 100 || !/^[A-Z]{3}$/.test(p.currency)) throw Error('profile');
    ids.add(p.id);
    let scale;
    try { scale = currencyScale(p.currency); } catch { throw Error('currency'); }
    if (p.scale !== scale || !['complete','fx_unavailable'].includes(p.quality)) throw Error('quality');
    for (const key of ['balance_minor','income_minor','expense_minor']) {
      if (p[key] !== null && (typeof p[key] !== 'string' || !DECIMAL.test(p[key]))) throw Error('amount');
      if (p.quality === 'complete' && p[key] === null) throw Error('missing amount');
    }
    return {id:p.id,name:p.name.trim(),currency:p.currency,scale,quality:p.quality,balance_minor:p.balance_minor,income_minor:p.income_minor,expense_minor:p.expense_minor};
  });
  return {schema:1,month:input.month,profiles};
}

export function createMoneyConnector({env,now=()=>Date.now()}={}) {
  const configured = Boolean(env?.TEACHING_STATE?.prepare && typeof env?.SESSION_SECRET === 'string' && env.SESSION_SECRET.length >= 32 && /^https:\/\/[^/]+$/.test(env.SITE_ORIGIN || ''));
  const db = env?.TEACHING_STATE;
  const key = configured ? createHash('sha256').update('charisna-money-v1\0').update(env.SESSION_SECRET).digest() : null;
  const aad = Buffer.from(`${env?.SITE_ORIGIN || ''}|money-v1`);
  const seal = data => {
    const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(aad);
    return Buffer.concat([iv,cipher.update(JSON.stringify(data)),cipher.final(),cipher.getAuthTag()]).toString('base64url');
  };
  const open = value => {
    const bytes=Buffer.from(value,'base64url'); if(bytes.length<29 || bytes.toString('base64url')!==value) throw Error('state');
    const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12)); cipher.setAAD(aad); cipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString());
  };
  const read = async id => (await db.prepare('SELECT payload FROM connector_state WHERE id = ?').bind(id).first())?.payload || null;
  const write = async(id,data) => db.prepare('INSERT INTO connector_state (id,payload) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').bind(id,seal(data)).run();
  const del = async id => db.prepare('DELETE FROM connector_state WHERE id = ?').bind(id).run();
  const result=(status,body)=>({status,body});
  async function pair() {
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code=Array.from(randomBytes(24),b=>alphabet[b%alphabet.length]).join('');
    await write(PAIR_ID,{hash:createHash('sha256').update(code).digest('hex'),expires:now()+TTL});
    return result(200,{code,expires_at:new Date(now()+TTL).toISOString()});
  }
  async function overview() {
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    try {
      const raw=await read(ID); if(!raw)return result(200,{state:'not_connected'});
      const data=open(raw);
      return result(200,{state:now()-data.receivedAt>STALE?'stale':'connected',snapshot:data.snapshot,received_at:new Date(data.receivedAt).toISOString()});
    } catch {return result(200,{state:'needs_reconnect'});}
  }
  async function disconnect() {
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    await del(PAIR_ID); await del(ID); return result(200,{state:'not_connected'});
  }
  async function push(input) {
    if(!configured)return result(503,{error:'Konektor belum tersedia.'});
    if(!input || (input.syncKey && !SYNC_KEY.test(input.syncKey)))return result(400,{error:'Kunci sinkron tidak valid.'});
    let snapshot;
    try { snapshot=validateMoneySnapshot(input.snapshot); } catch {return result(400,{error:'Ringkasan tidak valid.'});}
    let existing=null,existingRaw=null;
    try {existingRaw=await read(ID); if(existingRaw)existing=open(existingRaw);} catch {return result(409,{error:'Hubungkan kembali dari SuperApp.'});}
    if(existing){
      if(!SYNC_KEY.test(input.syncKey || ''))return result(403,{error:'Kunci sinkron diperlukan.'});
      const actual=createHash('sha256').update(input.syncKey).digest();
      if(!timingSafeEqual(actual,Buffer.from(existing.syncHash,'hex')))return result(403,{error:'Kunci sinkron salah.'});
    }
    let syncKey=null;
    if(!existing) {
      if(!CODE.test(input.pairCode || ''))return result(409,{error:'Kode penghubung diperlukan.'});
      let pairState,pairRaw;
      try {pairRaw=await read(PAIR_ID); pairState=pairRaw&&open(pairRaw);} catch {return result(409,{error:'Kode penghubung tidak valid.'});}
      const hash=createHash('sha256').update(input.pairCode).digest();
      if(!pairState || now()>pairState.expires || !timingSafeEqual(hash,Buffer.from(pairState.hash,'hex')))return result(409,{error:'Kode penghubung tidak valid.'});
      const consumed=await db.prepare('DELETE FROM connector_state WHERE id = ? AND payload = ?').bind(PAIR_ID,pairRaw).run();
      if(consumed?.meta?.changes!==1)return result(409,{error:'Kode sudah digunakan.'});
      syncKey=randomBytes(32).toString('base64url');
    }
    const data={syncHash:existing?.syncHash || createHash('sha256').update(syncKey).digest('hex'),snapshot,receivedAt:now()};
    if(existing){
      const updated=await db.prepare('UPDATE connector_state SET payload = ? WHERE id = ? AND payload = ?').bind(seal(data),ID,existingRaw).run();
      if(updated?.meta?.changes!==1)return result(409,{error:'Koneksi berubah. Coba lagi.'});
    } else await write(ID,data);
    return result(200,{state:'connected',...(syncKey?{syncKey}:{})});
  }
  return {configured,pair,overview,disconnect,push};
}
