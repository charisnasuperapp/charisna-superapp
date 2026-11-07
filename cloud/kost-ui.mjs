const $=id=>document.getElementById(id);
const post=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
const rupiah=value=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value));
const guard=res=>{if(res.status===401)location.replace('/login');else if(res.status===423)location.replace('/unlock');};
async function load(){
  try{
    const res=await fetch('/kost/overview.json',{cache:'no-store'});guard(res);if(!res.ok)throw Error();
    const data=await res.json();$('kost-status').hidden=true;
    const connected=['connected','stale'].includes(data.state);
    $('kost-connect').hidden=connected;$('kost-summary').hidden=!connected;
    if(!connected){$('kost-properties').replaceChildren();$('kost-code').textContent=data.state==='needs_reconnect'?'Koneksi perlu dibuat ulang.':'Belum terhubung.';return;}
    $('kost-quality').textContent=data.state==='stale'?'Data tertunda':'Snapshot lokal';
    $('kost-quality').className=`badge ${data.state==='stale'?'stale':'verified'}`;
    $('kost-month').textContent=`Bulan pembayaran: ${data.snapshot.month}`;
    $('kost-time').textContent=`Diterima ${new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
    $('kost-unassigned').textContent=data.snapshot.unassigned_bills?`${data.snapshot.unassigned_bills} tagihan belum dapat dipetakan ke properti. Angkanya tidak masuk kartu di bawah.`:'';
    const cards=data.snapshot.properties.map(property=>{
      const card=document.createElement('article');card.className='business-card';
      const title=document.createElement('h3');title.textContent=property.name;card.append(title);
      for(const [label,value] of [['Kamar terisi',`${property.occupied_rooms} / ${property.total_rooms}`],['Pembayaran diterima bulan ini',rupiah(property.paid_this_month_idr)],['Tagihan belum lunas',rupiah(property.unpaid_bills_idr)]]){
        const caption=document.createElement('p');caption.className='metric-label';caption.textContent=label;
        const amount=document.createElement('p');amount.className='money-amount';amount.textContent=value;
        card.append(caption,amount);
      }
      return card;
    });
    $('kost-properties').replaceChildren(...cards);
  }catch{$('kost-summary').hidden=true;$('kost-properties').replaceChildren();$('kost-status').hidden=false;$('kost-status').textContent='Ringkasan belum tersedia. Coba muat ulang.';}
}
$('kost-pair').addEventListener('click',async()=>{
  $('kost-pair').disabled=true;
  try{const res=await fetch('/kost/pair',post());guard(res);if(!res.ok)throw Error();const data=await res.json();$('kost-code').textContent=`Kode: ${data.code} · berlaku 10 menit`;}
  catch{$('kost-code').textContent='Gagal membuat kode. Coba lagi.';}
  finally{$('kost-pair').disabled=false;}
});
$('kost-disconnect').addEventListener('click',async()=>{
  if(!confirm('Hapus ringkasan dan putuskan koneksi CHARISNA KOST?'))return;
  $('kost-disconnect').disabled=true;
  try{const res=await fetch('/kost/disconnect',post());guard(res);if(!res.ok)throw Error();await load();}
  catch{$('kost-time').textContent='Gagal memutus koneksi. Coba lagi.';}
  finally{$('kost-disconnect').disabled=false;}
});
window.addEventListener('pagehide',()=>{$('kost-properties').replaceChildren();$('kost-code').textContent='';});
load();
