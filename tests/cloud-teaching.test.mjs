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
  let readFailure = false;
  let deleteHook = null;
  const db = {prepare(sql) {return {bind(...args) {return {
    async first() {assert.match(sql,/^SELECT/); if(readFailure) throw Error('D1 unavailable'); return payload ? {payload}:null;},
    async run() {
      if (sql.startsWith('DELETE')) {
        if(deleteHook) {const action=deleteHook; deleteHook=null; await action();}
        const changes=payload!==null && (!sql.includes('AND payload') || payload===args[1]) ? 1:0;
        if(changes) payload=null;
        return {meta:{changes}};
      }
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
  return {connector,requests,get stored(){return payload;},advance(ms){clock+=ms;},setOffline(value){fail=value;},
    setReadFailure(value){readFailure=value;},onDelete(run){deleteHook=run;},
    connectorWith(overrides){return createTeachingConnector({env:{...env,...overrides},fetchImpl,now:()=>clock});},
    onRequest(when,run){hook={when,run};},setUid(value){lookupUid=value;}};
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

test('scoped signal only reads the paired account and survives scheduled refresh', async () => {
  const s = setup();
  await s.connector.connect({idToken, refreshToken});
  const issued = await s.connector.setSignalKey(false);
  assert.equal(issued.status, 200);
  const key = issued.body.signalKey;
  assert.match(key, /^ms1_[A-Za-z0-9_-]{43}$/);
  s.advance(60000);
  await s.connector.scheduledSync();
  s.advance(60000);
  const before = s.requests.length;
  const result = await s.connector.signal(key);
  assert.deepEqual(result, {status: 200, body: {accepted: true}});
  assert.ok(s.requests.slice(before).every(r => !r.url.includes('accounts:lookup')));
  assert.equal((await s.connector.signal(key)).status, 429);

  const replacement = await s.connector.setSignalKey(false);
  assert.equal((await s.connector.signal(key)).status, 403);
  assert.equal((await s.connector.setSignalKey(true)).status, 200);
  assert.equal((await s.connector.signal(replacement.body.signalKey)).status, 403);
  assert.equal((await s.connector.signal(idToken)).status, 400);
});

test('daily rounding matches the MySalary detailed report', () => {
  const monthKey = '2026-11';
  const month = { monthKey, hourlyRate: 15.50, entries: { 1: { hours: 0.25 }, 2: { hours: 0.25 } } };
  assert.equal(summarizeTeachingMonth(month, monthKey).pay_minor, '776');
});

test('monthly overtime tier (Option A) matches MySalary when stored in entries[1]', () => {
  const monthKey = '2026-11';
  const entries = {};
  for (let day = 1; day <= 23; day++) entries[String(day)] = { hours: 5 };
  entries['1'].overtimeEnabled = true;
  entries['1'].overtimeThresholdHours = 100;
  entries['1'].overtimeHourlyRate = 12;
  const over = summarizeTeachingMonth({ monthKey, hourlyRate: 10, entries }, monthKey);
  assert.equal(over.hours, 115);
  assert.equal(over.teaching_days, 23);
  assert.equal(over.pay_minor, '118000');

  const underEntries = {
    '1': { hours: 10, overtimeEnabled: true, overtimeThresholdHours: 100, overtimeHourlyRate: 12 },
    '2': { hours: 10 },
  };
  const under = summarizeTeachingMonth({ monthKey, hourlyRate: 10, entries: underEntries }, monthKey);
  assert.equal(under.hours, 20);
  assert.equal(under.pay_minor, '20000');
});

test('rotated secret treats only unreadable ciphertext as reconnect and clears that row', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  const requests=s.requests.length;
  const zen=s.connectorWith({SESSION_SECRET:'z'.repeat(64)});
  assert.deepEqual(await zen.overview(),{status:200,body:{state:'needs_reconnect',source:'MySalary / Teaching Pay Audit'}});
  assert.equal(s.stored,null);
  assert.equal(s.requests.length,requests);
  assert.equal((await zen.connect({idToken,refreshToken})).status,200);
  assert.equal((await zen.overview()).body.state,'connected');
});

test('changed site origin also requires reconnect because it is authenticated data', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  const zen=s.connectorWith({SITE_ORIGIN:'https://zen.example'});
  assert.equal((await zen.overview()).body.state,'needs_reconnect');
  assert.equal(s.stored,null);
});

test('D1 read error stays a 503 and never deletes the connection', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  const before=s.stored;
  s.setReadFailure(true);
  assert.equal((await s.connector.overview()).status,503);
  assert.equal(s.stored,before);
});

test('recovery delete is conditional and preserves a concurrent new connection', async () => {
  const s=setup();
  await s.connector.connect({idToken,refreshToken});
  const zen=s.connectorWith({SESSION_SECRET:'z'.repeat(64)});
  s.onDelete(()=>zen.connect({idToken,refreshToken:'n'.repeat(40)}));
  const result=await zen.overview();
  assert.equal(result.status,200);
  assert.equal(result.body.state,'connected');
  assert.ok(s.stored);
});
