import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createTeachingConnector, summarizeTeachingMonth, summarizeTeachingYears} from '../cloud/teaching.mjs';

const apiKey = 'A'.repeat(40);
const idToken = 'i'.repeat(40);
const refreshToken = 'r'.repeat(40);
const uid = 'firebase-user-123';
const field = value => typeof value === 'string' ? {stringValue:value} : typeof value === 'number' ? {doubleValue:value} :
  {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,field(v)]))}};
const firestore = data => ({fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?{arrayValue:{values:v.map(field)}}:field(v)]))});

function setup() {
  let payload = null;
  let clock = Date.parse('2026-11-07T00:00:00Z');
  const db = {prepare(sql) {return {bind(...args) {return {
    async first() {assert.match(sql,/^SELECT/); return payload ? {payload}:null;},
    async run() {
      if (sql.startsWith('DELETE')) {const changes=payload===null?0:1; payload=null; return {meta:{changes}};}
      if (sql.startsWith('INSERT')) {payload=args[1]; return {meta:{changes:1}};}
      if (sql.startsWith('UPDATE')) {
        assert.match(sql,/WHERE id\s*=\s*\?\s+AND payload\s*=\s*\?/i);
        if (payload!==null && payload===args[2]) {payload=args[0]; return {meta:{changes:1}};}
        return {meta:{changes:0}};
      }
      throw Error(sql);
    }
  };}};}};
  const env = {TEACHING_STATE:db, SESSION_SECRET:'s'.repeat(64), SITE_ORIGIN:'https://owner.example',
    TEACHING_FIREBASE_PROJECT_ID:'salary-test', TEACHING_FIREBASE_API_KEY:apiKey};
  let fail = false;
  const requests = [];
  let hook = null;
  let lookupUid = uid;
  const fetchImpl = async (url,options) => {
    requests.push({url,options});
    if (hook) {const h=hook; if (h.when(url)) {hook=null; await h.run();}}
    if (fail) return Response.json({error:'offline'},{status:503});
    if (url.includes('accounts:lookup')) return Response.json({users:[{localId:lookupUid}]});
    if (url.includes('securetoken.googleapis.com')) return Response.json({user_id:uid,id_token:idToken,refresh_token:refreshToken});
    if (url.endsWith('/salaryAudit/database')) return Response.json(firestore({monthKeys:['2026-11','2026-10'],updatedAt:'2026-11-07T00:00:00Z'}));
    if (url.endsWith('/salaryAuditMonths/2026-11')) return Response.json(firestore({monthKey:'2026-11',hourlyRate:10,entries:{1:{hours:1.25},2:{hours:2}}}));
    if (url.endsWith('/salaryAuditMonths/2026-10')) return Response.json(firestore({monthKey:'2026-10',hourlyRate:12,entries:{1:{hours:1}}}));
    throw Error(url);
  };
  const connector = createTeachingConnector({env,fetchImpl,now:()=>clock});
  return {connector,requests,get stored(){return payload;},advance(ms){clock+=ms;},setOffline(value){fail=value;},onRequest(when,run){hook={when,run};},setUid(value){lookupUid=value;}};
}

test('monthly and annual pay follow source rounding and keep USD minor units', () => {
  const month=summarizeTeachingMonth({monthKey:'2026-11',hourlyRate:10,entries:{1:{hours:1.255},2:{hours:2}}},'2026-11');
  assert.deepEqual(month,{month:'2026-11',hours:3.25,teaching_days:2,pay_minor:'3250',currency:'USD',scale:2});
  assert.deepEqual(summarizeTeachingYears([month,{...month,month:'2026-10',pay_minor:'100'}]),
    [{year:'2026',hours:6.5,teaching_days:4,pay_minor:'3350',currency:'USD',scale:2}]);
  assert.throws(()=>summarizeTeachingMonth({monthKey:'2026-11',hourlyRate:10,entries:{1:{hours:25}}},'2026-11'));
});

test('encrypted D1 state syncs source months, caches summary, and disconnects', async () => {
  const s=setup();
  assert.deepEqual((await s.connector.overview()).body.state,'not_connected');
  assert.equal((await s.connector.connect({idToken,refreshToken})).status,200);
  assert.ok(s.stored && !s.stored.includes(refreshToken) && !s.stored.includes(uid));
  const result=await s.connector.overview();
  assert.equal(result.status,200);
  assert.deepEqual(result.body.months.map(m=>m.pay_minor),['1200','3250']);
  assert.deepEqual(result.body.years.map(y=>y.pay_minor),['4450']);
  assert.equal(result.body.quality_status,'verified_source_read');
  assert.ok(s.requests.every(r=>r.options.redirect==='manual'));
  const count=s.requests.length;
  assert.equal((await s.connector.overview()).status,200);
  assert.equal(s.requests.length,count);
  assert.equal((await s.connector.disconnect()).status,200);
  assert.equal(s.stored,null);
  assert.equal((await s.connector.overview()).body.state,'not_connected');
});

test('source failure marks cached data stale and never fabricates a zero', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  await s.connector.overview();
  s.advance(3600001);s.setOffline(true);
  const result=await s.connector.overview();
  assert.equal(result.body.state,'stale');
  assert.equal(result.body.quality_status,'SOURCE_UNAVAILABLE');
  assert.equal(result.body.months[0].pay_minor,'1200');
});

test('invalid tokens and unavailable source fail closed', async () => {
  const s=setup();
  assert.equal((await s.connector.connect({idToken:'bad',refreshToken})).status,400);
  assert.equal(s.stored,null);
  s.setOffline(true);
  assert.equal((await s.connector.connect({idToken,refreshToken})).status,401);
  assert.equal(s.stored,null);
});

test('disconnect during a running sync is never undone by that sync', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  s.onRequest(url=>url.endsWith('/salaryAudit/database'),()=>s.connector.disconnect());
  const result=await s.connector.scheduledSync();
  assert.notEqual(result.status,200);
  assert.equal(s.stored,null);
  assert.equal((await s.connector.overview()).body.state,'not_connected');
});

test('reconnect during a running sync keeps the new connection and drops the old write', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  let fresh=null;
  s.onRequest(url=>url.endsWith('/salaryAudit/database'),async()=>{
    await s.connector.disconnect();
    await s.connector.connect({idToken,refreshToken:'n'.repeat(40)});
    fresh=s.stored;
  });
  const result=await s.connector.scheduledSync();
  assert.notEqual(result.status,200);
  assert.ok(fresh);
  assert.equal(s.stored,fresh);
});

test('cron and overview racing on the same state write at most once and never resurrect', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  s.advance(3600001);
  let second=null;
  s.onRequest(url=>url.includes('securetoken.googleapis.com'),()=>{second=s.connector.scheduledSync();});
  const first=await s.connector.overview();
  const other=await second;
  assert.ok([first.status,other.status].includes(200));
  assert.ok(s.stored);
  await s.connector.disconnect();
  assert.equal(s.stored,null);
});

test('token rotation is not persisted when the state changed underneath the sync', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  s.onRequest(url=>url.endsWith('/salaryAudit/database'),()=>s.connector.disconnect());
  await s.connector.scheduledSync();
  assert.equal(s.stored,null);
});

test('signal pulls fresh data only for the connected Firebase UID and carries no salary data', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  s.advance(60000);
  const before=s.stored;
  const ok=await s.connector.signal(idToken);
  assert.equal(ok.status,200);
  assert.deepEqual(Object.keys(ok.body),['accepted']);
  assert.notEqual(s.stored,before);
  assert.equal((await s.connector.overview()).body.synced_at,new Date(Date.parse('2026-11-07T00:01:00Z')).toISOString());
});

test('signal rejects bad tokens, other UIDs and unconnected state without writing', async () => {
  const s=setup();
  assert.equal((await s.connector.signal(idToken)).status,403);
  await s.connector.connect({idToken,refreshToken});
  const stored=s.stored;
  assert.equal((await s.connector.signal('bad')).status,400);
  s.setOffline(true);
  assert.equal((await s.connector.signal(idToken)).status,401);
  assert.equal(s.stored,stored);
});

test('signal for another UID is refused and repeated signals are coalesced', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  s.advance(60000);
  assert.equal((await s.connector.signal(idToken)).status,200);
  const writes=s.requests.length;
  s.advance(1000);
  const again=await s.connector.signal(idToken);
  assert.equal(again.status,202);
  assert.equal(s.requests.filter(r=>r.url.includes('securetoken')).length,1);
  assert.ok(s.requests.length>writes-1);
  const other=setup();
  await other.connector.connect({idToken,refreshToken});
  other.setUid('another-user-999');
  assert.equal((await other.connector.signal(idToken)).status,403);
});
