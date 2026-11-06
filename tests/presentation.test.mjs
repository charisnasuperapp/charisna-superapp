import test from 'node:test';
import assert from 'node:assert/strict';
import {formatRupiah,statusLabel,attentionOrder} from '../public/app.mjs';
test('rupiah keeps integer precision and absence distinct from zero',()=>{
 assert.equal(formatRupiah(null),'—');
 assert.equal(formatRupiah('0'),'Rp0');
 assert.equal(formatRupiah('12150000'),'Rp12.150.000');
 assert.equal(formatRupiah('9007199254740993'),'Rp9.007.199.254.740.993');
});
test('Indonesian statuses and mismatch first',()=>{
 assert.equal(statusLabel({quality_status:'unavailable',reason_code:'connector_not_connected'}),'Belum terhubung');
 assert.equal(statusLabel({quality_status:'unavailable',reason_code:'CONNECTOR_NOT_CONNECTED'}),'Belum terhubung');
 assert.equal(statusLabel({quality_status:'mismatch'}),'Ada selisih');

 const rows=[{quality_status:'incomplete'},{quality_status:'mismatch'}];
 assert.equal(rows.sort(attentionOrder)[0].quality_status,'mismatch');
});
