export function formatRupiah(value) {
 if(value===null||value===undefined)return '—';
 return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(BigInt(value)).replace(/\s/g,'');
}
const labels={verified:'Terverifikasi',mismatch:'Ada selisih',incomplete:'Belum lengkap',stale:'Data tertunda',provisional:'Sementara',unavailable:'Belum tersedia'};
export function statusLabel(m){return m.quality_status==='unavailable'&&String(m.reason_code).toUpperCase()==='CONNECTOR_NOT_CONNECTED'?'Belum terhubung':labels[m.quality_status]||'Belum tersedia';}
export function attentionOrder(a,b){const order={mismatch:0,incomplete:1,stale:2,provisional:3,unavailable:4,verified:5};return order[a.quality_status]-order[b.quality_status];}
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)).replace('pukul','').replace(/\s+/g,' ').trim()+' WIB':'Belum ada data';
const time=value=>value?new Intl.DateTimeFormat('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value))+' WIB':'—';
const badge=m=>`<span class="badge ${escape(m.quality_status)}">${escape(statusLabel(m))}</span>`;
const coverage=m=>m.coverage?`${m.coverage.matched} dari ${m.coverage.total} ${m.coverage.unit}`:'Cakupan belum tersedia';
const button=(m,text)=>`<button class="text-button" type="button" data-detail="${escape(m.business_id)}" aria-haspopup="dialog">${text}<span aria-hidden="true">›</span></button>`;
export function mount({document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch}={}){
 const $=selector=>document.querySelector(selector);
 const dialog=$('#detail-dialog');let overview;let trigger;let balanceVisible=false;let revealPending=false;let leaving=false;let logoutPending=false;let epoch=0;
 function clearBalance(){
  epoch++;balanceVisible=false;
  $('#balance').textContent='Saldo contoh disembunyikan';$('#balance').classList.remove('visible');
  $('#toggle-balance').textContent='Tampilkan saldo contoh';$('#toggle-balance').setAttribute('aria-expanded','false');
 }
 function clearDashboard(){
  clearBalance();$('#dashboard').hidden=true;$('#attention-items').innerHTML='';$('#business-items').innerHTML='';$('#dialog-content').innerHTML='';overview=undefined;
  if(dialog.open)dialog.close();
 }
 function unauthorized(){leaving=true;clearDashboard();window.location.replace('/login');}
 window.addEventListener('pagehide',()=>{leaving=true;clearDashboard();});
 window.addEventListener('pageshow',event=>{if(event.persisted){clearDashboard();window.location.reload();}});
 $('#logout-button').disabled=false;
 $('#logout-form').addEventListener('submit',async event=>{
  event.preventDefault();if(logoutPending)return;
  logoutPending=true;clearBalance();$('#toggle-balance').disabled=true;$('#logout-button').disabled=true;$('#logout-form').setAttribute('aria-busy','true');
  $('#logout-status').textContent='Mengakhiri sesi…';
  try {
   const response=await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
   if(response.status===401){unauthorized();return;}
   if(!response.ok)throw Error('logout');
   unauthorized();
  }catch{$('#logout-status').textContent='Belum dapat keluar. Periksa koneksi, lalu coba lagi.';}
  finally{logoutPending=false;$('#logout-button').disabled=leaving;$('#toggle-balance').disabled=leaving;$('#logout-form').setAttribute('aria-busy','false');}
 });
 function detail(m,opener){
  trigger=opener;
  const isPos=m.business_id==='bumi-makmur';
  const stat=(label,value,alert=false)=>`<div class="detail-stat ${alert?'alert':''}"><span>${label}</span><strong>${escape(value)}</strong></div>`;
  const list=rows=>`<dl>${rows.map(([a,b])=>`<div><dt>${a}</dt><dd>${escape(b)}</dd></div>`).join('')}</dl>`;
  const content=isPos?`
   <p class="detail-intro">Nilai SuperApp sedang diperiksa. Ada struk sumber yang belum tercakup dalam proyeksi contoh.</p>
   <div class="detail-grid">${stat('Rekap POS',formatRupiah(m.comparison?.amount_minor))}${stat('Nilai SuperApp',formatRupiah(m.amount_minor))}${stat('Selisih',formatRupiah(m.comparison?.delta_minor),true)}${stat('Struk cocok',coverage(m))}</div>
   ${list([['Periode',overview.period_label],['Data sumber sampai',time(m.complete_through)],['Diterima SuperApp',date(m.received_at)],['Basis','Penjualan bersih · IDR, skala 0']])}
   <p class="detail-note">Selisih ini adalah masalah pencocokan data, bukan bukti uang hilang. Proyeksi dihitung dari baris struk sintetis; angka rekap POS hanya dipakai sebagai pembanding.</p>`:`
   <p class="detail-intro">Pembayaran yang sudah tercatat ditampilkan apa adanya. Rekap belum mencakup semua kamar.</p>
   <div class="detail-grid">${stat('Pembayaran sewa tercatat',formatRupiah(m.amount_minor))}${stat('Cakupan kamar',coverage(m))}</div>
   ${list([['Periode',overview.period_label],['Data sumber sampai',time(m.complete_through)],['Diterima SuperApp',date(m.received_at)],['Status cakupan','Belum lengkap; bukan total seluruh properti']])}
   <p class="detail-note"><strong>Dana titipan penyewa dicatat terpisah.</strong> Nilai sewa ini tidak memasukkan dana titipan. Nominal parsial yang cocok tidak membuat cakupan 17 dari 20 kamar menjadi lengkap.</p>`;
  $('#dialog-content').innerHTML=`<div class="dialog-body"><h2 id="dialog-title">${escape(m.name)}</h2>${badge(m)}${content}</div>`;
  dialog.showModal();$('#close-dialog').focus();
 }
 $('#close-dialog').addEventListener('click',()=>dialog.close());
 $('#done-dialog').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>trigger?.focus());
 dialog.addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const items=[...dialog.querySelectorAll('button,[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&!el.hidden);
  const first=items[0],last=items.at(-1);
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
 $('#toggle-balance').addEventListener('click',async()=>{
  if(revealPending||leaving||logoutPending)return;
  if(balanceVisible){clearBalance();return;}
  const requestEpoch=epoch;revealPending=true;$('#toggle-balance').disabled=true;
  try{const response=await fetch('/demo/personal.json',{cache:'no-store'});if(response.status===401){unauthorized();return;}if(!response.ok)throw Error('load');const data=await response.json();if(leaving||logoutPending||epoch!==requestEpoch)return;$('#balance').textContent=formatRupiah(data.personal.amount_minor);$('#balance').classList.add('visible');balanceVisible=true;$('#toggle-balance').textContent='Sembunyikan saldo contoh';$('#toggle-balance').setAttribute('aria-expanded','true');}
  catch{if(!leaving&&!logoutPending&&epoch===requestEpoch)$('#balance').textContent='Saldo contoh gagal dimuat. Coba lagi.';}
  finally{revealPending=false;$('#toggle-balance').disabled=leaving||logoutPending;}
 });
 async function load(){
  try{
   const response=await fetch('/demo/overview.json',{cache:'no-store'});if(response.status===401){unauthorized();return;}if(!response.ok)throw Error('load');const data=await response.json();if(leaving)return;overview=data;
   if(!Array.isArray(overview.businesses))throw Error('schema');
   $('#period').textContent=overview.period_label;
   const attention=overview.businesses.filter(m=>['mismatch','incomplete','stale','provisional'].includes(m.quality_status)).sort(attentionOrder);
   $('#attention-count').textContent=`${attention.length} hal`;
   $('#attention-items').innerHTML=attention.length?attention.map(m=>{
    const pos=m.business_id==='bumi-makmur';
    const missing=(m.comparison?.missing_ids||[]).length;
    const headline=pos?`${missing} struk belum cocok · ${formatRupiah(m.comparison?.delta_minor)}`:`Rekap mencakup ${coverage(m)}`;
    const explanation=pos?'Selisih antara rekap POS dan nilai SuperApp.':'Sebagian kamar belum tercakup dalam rekap.';
    return `<article class="attention-card ${escape(m.quality_status)}"><div class="card-top"><h3>${escape(m.name)}</h3>${badge(m)}</div><p>${escape(headline)}</p><p class="explanation">${explanation}</p>${button(m,pos?'Lihat rincian':'Lihat cakupan')}</article>`;
   }).join(''):'<p>Tidak ada masalah data yang terdeteksi</p>';
   $('#business-items').innerHTML=overview.businesses.map((m,index)=>{
    const unavailable=m.quality_status==='unavailable';
    const context=unavailable?'Usaha contoh terdaftar. Belum ada kiriman data.':m.business_id==='bumi-makmur'?'Nilai yang sedang diperiksa; lihat rincian selisih.':`${coverage(m)} tercakup. Bukan total seluruh properti.`;
    return `<article class="business-card"><div class="card-top"><div class="business-name"><span class="business-icon" aria-hidden="true">${['B','K','U'][index]||'U'}</span><span>${escape(m.name)}</span></div>${badge(m)}</div><p class="metric-label">${escape(m.metric_label)}</p><p class="metric-value">${formatRupiah(m.amount_minor)}</p><p class="metric-context">${escape(context)}</p><div class="card-bottom"><span class="received">${unavailable?'Belum ada data':`Diterima ${escape(date(m.received_at))}`}</span>${unavailable?'':button(m,'Rincian')}</div></article>`;
   }).join('');
   document.querySelectorAll('[data-detail]').forEach(el=>el.addEventListener('click',()=>detail(overview.businesses.find(m=>m.business_id===el.dataset.detail),el)));
   $('#load-status').hidden=true;$('#dashboard').hidden=false;
  }catch{if(!leaving)$('#load-status').textContent='Ringkasan gagal dimuat. Ini masalah pemuatan halaman, bukan status data usaha. Periksa koneksi, lalu muat ulang.';}
 }
 return {ready:load()};
}
if(typeof document!=='undefined')mount();
