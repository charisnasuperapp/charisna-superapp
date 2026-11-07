const $=id=>document.getElementById(id);
const post=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
const rupiah=value=>new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(value));
const guard=res=>{if(res.status===401)location.replace('/login');else if(res.status===423)location.replace('/unlock');};
async function load(){
  try{
    const res=await fetch('/pos/overview.json',{cache:'no-store'});guard(res);if(!res.ok)throw Error();
    const data=await res.json();$('pos-status').hidden=true;
    const connected=['connected','stale'].includes(data.state);
    $('pos-connect').hidden=connected;$('pos-summary').hidden=!connected;
    if(!connected){$('pos-code').textContent=data.state==='needs_reconnect'?'Koneksi perlu dibuat ulang.':'Belum terhubung.';return;}
    $('pos-quality').textContent=data.state==='stale'?'Data tertunda':'Ringkasan tersimpan';
    $('pos-quality').className=`badge ${data.state==='stale'?'stale':'verified'}`;
    $('pos-month').textContent=`Bulan: ${data.snapshot.month}`;
    $('pos-time').textContent=`Diterima ${new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
    const cards=data.snapshot.branches.map(branch=>{
      const card=document.createElement('article');card.className='business-card';
      const title=document.createElement('h3');title.textContent=branch.name;card.append(title);
      for(const [label,value] of [['Omzet bersih bulan ini',rupiah(branch.revenue_idr)],['Jumlah transaksi',String(branch.transactions)],['Laba perkiraan bulan ini',rupiah(branch.profit_estimate_idr)]]){
        const caption=document.createElement('p');caption.className='metric-label';caption.textContent=label;
        const amount=document.createElement('p');amount.className='money-amount';amount.textContent=value;
        card.append(caption,amount);
      }
      return card;
    });
    $('pos-branches').replaceChildren(...cards);
  }catch{$('pos-status').hidden=false;$('pos-status').textContent='Ringkasan belum tersedia. Coba muat ulang.';}
}
$('pos-pair').addEventListener('click',async()=>{
  $('pos-pair').disabled=true;
  try{const res=await fetch('/pos/pair',post());guard(res);if(!res.ok)throw Error();const data=await res.json();$('pos-code').textContent=`Kode: ${data.code} · berlaku 10 menit`;}
  catch{$('pos-code').textContent='Gagal membuat kode. Coba lagi.';}
  finally{$('pos-pair').disabled=false;}
});
$('pos-disconnect').addEventListener('click',async()=>{
  if(!confirm('Hapus ringkasan dan putuskan koneksi Bumi Makmur POS?'))return;
  $('pos-disconnect').disabled=true;
  try{const res=await fetch('/pos/disconnect',post());guard(res);if(!res.ok)throw Error();await load();}
  catch{$('pos-time').textContent='Gagal memutus koneksi. Coba lagi.';}
  finally{$('pos-disconnect').disabled=false;}
});
window.addEventListener('pagehide',()=>{$('pos-branches').replaceChildren();$('pos-code').textContent='';});
load();
