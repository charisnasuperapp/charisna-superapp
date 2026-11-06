import test from 'node:test';
import assert from 'node:assert/strict';
import {getDemoOverview} from '../demo/overview.mjs';
import {statusLabel} from '../public/app.mjs';
test('real demo fixture and presentation agree on baseline contract',()=>{
 const data=getDemoOverview();
 const pos=data.businesses.find(m=>m.business_id==='bumi-makmur');
 const kost=data.businesses.find(m=>m.business_id==='charisna-kost');
 const unavailable=data.businesses.find(m=>m.business_id==='usaha-contoh');
 assert.equal(pos.amount_minor,'12150000');
 assert.equal(pos.quality_status,'mismatch');
 assert.equal(pos.comparison.amount_minor,'12400000');
 assert.equal(pos.comparison.delta_minor,'250000');
 assert.equal(pos.coverage.matched,121);
 assert.equal(kost.amount_minor,'4200000');
 assert.equal(kost.quality_status,'incomplete');
 assert.equal(kost.coverage.total,20);
 assert.equal(unavailable.amount_minor,null);
 assert.equal(statusLabel(unavailable),'Belum terhubung');
 assert.equal(data.personal.amount_minor,'8750000');
 for(const m of [pos,kost]){
  for(const key of ['source_instance_id','metric_id','period_start','period_end_exclusive','timezone','complete_through','received_at','currency','scale','reason_code'])assert.notEqual(m[key],undefined,key);
 }
 assert.doesNotThrow(()=>JSON.stringify(data));
});
