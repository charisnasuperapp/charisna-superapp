const $=id=>document.getElementById(id);
const post=()=>({method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store'});
const format=(minor,currency,scale)=>minor===null?'Tidak tersedia':new Intl.NumberFormat('id-ID',{style:'currency',currency}).format(Number(minor)/10**scale);
const go=res=>{if(res.status===401)location.replace('/login');else if(res.status===423)location.replace('/unlock');};
async function load(){
  try{
    const res=await fetch('/money/overview.json',{cache:'no-store'});go(res);if(!res.ok)throw Error();
    const data=await res.json();$('money-status').hidden=true;
    const connected=['connected','stale'].includes(data.state);
    $('money-connect').hidden=connected;$('money-summary').hidden=!connected;
    if(!connected){$('money-code').textContent=data.state==='needs_reconnect'?'Koneksi perlu dibuat ulang.':'Belum terhubung.';return;}
    $('money-quality').textContent=data.state==='stale'?'Data tertunda':'Ringkasan tersimpan';
    $('money-quality').className=`badge ${data.state==='stale'?'stale':'verified'}`;
    $('money-month').textContent=`Bulan: ${data.snapshot.month}`;
    $('money-time').textContent=`Diterima ${new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(data.received_at))} WIB`;
    const cards=data.snapshot.profiles.map(p=>{
      const article=document.createElement('article');article.className='business-card';
      const title=document.createElement('h3');title.textContent=p.name;article.append(title);
      for(const [label,key] of [['Saldo bersih','balance_minor'],['Pemasukan bulan ini','income_minor'],['Pengeluaran bulan ini','expense_minor']]){
        const caption=document.createElement('p');caption.className='metric-label';caption.textContent=label;article.append(caption);
        const value=document.createElement('p');value.className='money-amount';value.textContent=format(p[key],p.currency,p.scale);article.append(value);
      }
      if(p.quality!=='complete'){const note=document.createElement('p');note.className='scope-note';note.textContent='Sebagian nilai tidak tersedia karena kurs mata uang belum ada.';article.append(note);}
      return article;
    });
    $('money-profiles').replaceChildren(...cards);
  }catch{$('money-status').textContent='Ringkasan belum tersedia. Coba muat ulang.';}
}
$('money-pair').addEventListener('click',async()=>{
  $('money-pair').disabled=true;
  try{const res=await fetch('/money/pair',post());go(res);if(!res.ok)throw Error();const data=await res.json();$('money-code').textContent=`Kode: ${data.code} · berlaku 10 menit`;}
  catch{$('money-code').textContent='Gagal membuat kode. Coba lagi.';}
  finally{$('money-pair').disabled=false;}
});
$('money-disconnect').addEventListener('click',async()=>{
  if(!confirm('Hapus ringkasan dan putuskan koneksi Money Management?'))return;
  $('money-disconnect').disabled=true;
  try{const res=await fetch('/money/disconnect',post());go(res);if(!res.ok)throw Error();await load();}
  catch{$('money-time').textContent='Gagal memutus koneksi. Coba lagi.';}
  finally{$('money-disconnect').disabled=false;}
});
window.addEventListener('pagehide',()=>{$('money-profiles').replaceChildren();$('money-code').textContent='';});
load();
