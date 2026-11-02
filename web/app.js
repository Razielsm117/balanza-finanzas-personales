import {analyze, money, monthLabel, parseCSV, mergeRows, toCSV} from './analytics.mjs';
const $=s=>document.querySelector(s), esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palette=['#466b45','#86a271','#b0c689','#d5e5b0','#b99d76','#e8bc94','#dcd9bf','#a6b8a2'];
let rows=[],current=null,view='overview',page=1,search='',version=0,custom=false;
const filters=()=>({month:$('#month-filter').value,category:$('#category-filter').value,account:$('#account-filter').value});
const status=(message,error=false)=>{$('#status').textContent=message;$('#status').classList.toggle('error',error);};
const signed=r=>(r.type==='ingreso'?'+':'−')+money(r.amount_cents);
const shortMonth=m=>new Intl.DateTimeFormat('es-MX',{month:'short',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z')).replace('.','');

function options(){
  for(const [id,key,label] of [['month-filter','date','Todos los meses'],['category-filter','category','Todas las categorías'],['account-filter','account','Todas las cuentas']]){
    const select=$('#'+id),previous=select.value;
    const values=[...new Set(rows.map(r=>key==='date'?r.date.slice(0,7):r[key]))].sort();if(key==='date')values.reverse();
    select.innerHTML=`<option value="">${label}</option>`+values.map(v=>`<option value="${esc(v)}">${esc(key==='date'?monthLabel(v):v)}</option>`).join('');
    select.value=values.includes(previous)?previous:'';
  }
}

function metrics(data){const t=data.totals;return `<section class="metrics" aria-label="Indicadores del período">
  <article class="metric featured"><div class="metric-top">Saldo del período<span class="metric-icon" aria-hidden="true">↗</span></div><div class="metric-value">${money(t.balance)}</div><div class="metric-foot">Ingresos menos gastos · MXN</div></article>
  <article class="metric"><div class="metric-top">Ingresos<span class="metric-icon" aria-hidden="true">↙</span></div><div class="metric-value">${money(t.income)}</div><div class="metric-foot">Entradas en el período seleccionado</div></article>
  <article class="metric"><div class="metric-top">Gastos<span class="metric-icon" aria-hidden="true">↗</span></div><div class="metric-value">${money(t.expense)}</div><div class="metric-foot">Salidas en el período seleccionado</div></article>
  <article class="metric"><div class="metric-top">Porcentaje restante<span class="metric-icon" aria-hidden="true">◷</span></div><div class="metric-value">${t.savings_rate===null?'—':t.savings_rate.toFixed(1)+'<span style="font-size:.6em">%</span>'}</div><div class="metric-foot">${t.savings_rate===null?'Sin ingresos para calcularlo':'(Ingresos − gastos) / ingresos'}</div></article></section>`;}

function chart(data){
  const months=data.months, max=Math.max(1,...months.flatMap(m=>[m.income,m.expense])),ceiling=Math.ceil(max/1000000)*1000000||1000000;
  const width=560,height=205,left=48,bottom=175,area=147,step=(width-left-10)/Math.max(months.length,1),bar=Math.min(19,step*.28);
  const grid=Array.from({length:5},(_,i)=>{const y=bottom-area*i/4;return `<line class="gridline" x1="${left}" y1="${y}" x2="${width}" y2="${y}"/><text x="${left-9}" y="${y+4}" text-anchor="end">${Math.round(ceiling*i/4/100000)}k</text>`;}).join('');
  const bars=months.map((m,i)=>{const x=left+step*(i+.5),label=shortMonth(m.month);return ['income','expense'].map((key,j)=>{const h=m[key]/ceiling*area;return `<rect class="bar" x="${x+(j?2:-bar-2)}" y="${bottom-h}" width="${bar}" height="${h}" rx="3" fill="${j?'#d5f28b':'#799b76'}"><title>${esc(monthLabel(m.month))} · ${j?'Gastos':'Ingresos'}: ${money(m[key])}</title></rect>`;}).join('')+`<text x="${x}" y="196" text-anchor="middle">${esc(label)}</text>`;}).join('');
  return `<article class="card"><div class="card-header"><div><h2>El ritmo de tus finanzas</h2><p class="card-description">Ingresos y gastos, mes a mes</p></div><div class="legend"><span><i></i>Ingresos</span><span><i></i>Gastos</span></div></div><div class="chart-wrap">${months.length?`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparación mensual de ingresos y gastos en miles de pesos. Los valores se encuentran en Reportes.">${grid}${bars}</svg>`:'<div class="empty">No hay movimientos para estas cuentas y categorías.</div>'}</div><div class="chart-note">Historial completo · Respeta categoría y cuenta · Importes en miles de MXN</div></article>`;
}

function categories(data){
  let accumulated=0;const total=data.totals.expense;
  const gradient=data.categories.map((c,i)=>{const from=accumulated;accumulated+=total?c.amount/total*100:0;return `${palette[i%palette.length]} ${from}% ${accumulated}%`;}).join(',');
  const top=data.categories[0];
  return `<article class="card"><div class="card-header"><div><h2>¿A dónde va tu dinero?</h2><p class="card-description">Distribución de gastos del período</p></div></div><div class="category-body"><div class="donut-row"><div class="donut" style="background:${gradient?'conic-gradient('+gradient+')':'#eef1e7'}" role="img" aria-label="${data.categories.length} categorías de gastos"><div class="donut-center"><strong>${data.categories.length}</strong><span>categorías</span></div></div><div class="donut-caption">Mayor participación<strong>${top?esc(top.category):'Sin gastos'}</strong>${top?(top.amount/total*100).toFixed(1)+'% de tus gastos':'Prueba otro período'}</div></div><div class="category-list">${data.categories.map((c,i)=>`<div class="category-row"><i style="background:${palette[i%palette.length]}"></i><span>${esc(c.category)}</span><span class="amount">${money(c.amount)}</span><span class="percent">${(c.amount/total*100).toFixed(0)}%</span></div>`).join('')}</div></div></article>`;
}

function table(data,full=false){
  const matching=data.transactions.filter(r=>!search||Object.values(r).some(v=>String(v).toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es'))));
  const size=full?12:5,maxPage=Math.max(1,Math.ceil(matching.length/size));page=Math.min(page,maxPage);
  const shown=full?matching.slice((page-1)*size,page*size):data.transactions.slice(0,5);
  return `<section class="card movements"><div class="card-header"><div><h2>${full?'Todos tus movimientos':'Los últimos movimientos'}</h2><p class="card-description">${full?'Busca y revisa cada entrada y salida':'Un vistazo a tu actividad más reciente'}</p></div>${full?`<div class="table-tools"><input class="search" id="search" aria-label="Buscar movimientos" placeholder="Buscar movimiento…" value="${esc(search)}"></div>`:'<button class="text-button" id="all-transactions">Ver todos los movimientos ↗</button>'}</div><div class="table-scroll"><table><thead><tr><th scope="col">MOVIMIENTO</th><th scope="col">FECHA</th><th scope="col">CATEGORÍA</th><th scope="col">CUENTA</th><th scope="col" style="text-align:right">IMPORTE</th></tr></thead><tbody>${shown.map(r=>`<tr><td><div class="description-cell"><span class="transaction-icon" aria-hidden="true">${r.type==='ingreso'?'↙':'↗'}</span>${esc(r.description)}</div></td><td>${new Intl.DateTimeFormat('es-MX',{day:'2-digit',month:'short',timeZone:'UTC'}).format(new Date(r.date+'T12:00:00Z'))}</td><td><span class="category-chip">${esc(r.category)}</span></td><td>${esc(r.account)}</td><td class="amount-cell ${r.type==='ingreso'?'income':''}">${signed(r)}</td></tr>`).join('')}</tbody></table>${shown.length?'':'<div class="empty">No encontramos movimientos con estos filtros.</div>'}</div><div class="table-bottom"><span>${full?matching.length:data.transactions.length} movimientos ${search&&full?'coincidentes':'en el período'}</span>${full?`<div class="pagination"><button id="prev-page" ${page<=1?'disabled':''}>Anterior</button><span>${page} / ${maxPage}</span><button id="next-page" ${page>=maxPage?'disabled':''}>Siguiente</button></div>`:'<span>Importes en pesos mexicanos</span>'}</div></section>`;
}

function reports(data){
  const f=filters(),months=data.months.filter(m=>!f.month||m.month===f.month).slice().reverse();
  return `<div class="card report-summary"><h2>De movimientos a un reporte claro</h2><p class="section-intro">Descarga el resumen mensual en Markdown. Cada reporte respeta la cuenta y categoría seleccionadas e incluye ingresos, gastos y saldo del período.</p><span class="category-chip">${months.length} reportes disponibles</span></div><div class="report-grid">${months.map(m=>`<article class="card report-card"><div class="report-top"><span class="report-icon" aria-hidden="true">▤</span><span class="category-chip">Resumen mensual</span></div><h3>${esc(monthLabel(m.month))}</h3><dl><dt>Ingresos</dt><dd>${money(m.income)}</dd><dt>Gastos</dt><dd>${money(m.expense)}</dd><dt>Saldo del período</dt><dd>${money(m.income-m.expense)}</dd></dl><button class="button secondary" data-report="${m.month}">↓ Descargar reporte</button></article>`).join('')}</div>${months.length?'':'<div class="empty">No hay reportes para estos filtros.</div>'}`;
}

function render(){
  if(!current)return;
  const data=current;
  $('#content').innerHTML=view==='overview'?metrics(data)+`<section class="dashboard-grid">${chart(data)}${categories(data)}</section>`+table(data)+`<aside class="insight"><span aria-hidden="true">✳</span><p><strong>${data.totals.count?`${data.totals.count} movimientos, una perspectiva más clara.`:'Cada movimiento cuenta.'}</strong><br>${data.categories[0]?`${esc(data.categories[0].category)} concentra el ${(data.categories[0].amount/data.totals.expense*100).toFixed(1)}% de tus gastos en este período.`:'Importa un CSV o cambia los filtros para explorar tus finanzas.'} El saldo muestra la diferencia entre ingresos y gastos registrados.</p></aside>`:view==='transactions'?metrics(data)+table(data,true):reports(data);
  $('#content').setAttribute('aria-busy','false');
  $('#all-transactions')?.addEventListener('click',()=>setView('transactions'));
  $('#search')?.addEventListener('input',event=>{const input=event.target,start=input.selectionStart;search=input.value;page=1;render();$('#search').focus();$('#search').setSelectionRange(start,start);});
  $('#prev-page')?.addEventListener('click',()=>{page--;render();});$('#next-page')?.addEventListener('click',()=>{page++;render();});
  document.querySelectorAll('[data-report]').forEach(b=>b.addEventListener('click',()=>downloadReport(b.dataset.report)));
}

async function refresh(){
  const id=++version;$('#content').setAttribute('aria-busy','true');
  try{
    let data;if(window.BALANZA_API){const response=await fetch('/api/summary?'+new URLSearchParams(filters()));if(!response.ok)throw Error('No se pudo consultar la base de datos.');data=await response.json();}else data=analyze(rows,filters());
    if(id!==version)return;current=data;render();
  }catch(e){$('#content').setAttribute('aria-busy','false');status(e.message,true);}
}

function setView(next){view=next;page=1;search='';const labels={overview:['Vista general','Tu dinero, en perspectiva.','Conoce lo que entra, lo que sale y lo que queda.'],transactions:['Movimientos','Cada movimiento cuenta.','Explora tus ingresos y gastos, sin perder el detalle.'],reports:['Reportes','Tus números, listos para llevar.','Resúmenes mensuales que puedes guardar y compartir.']};const label=labels[view];$('#breadcrumb').textContent=label[0];$('#page-title').textContent=label[1];$('#page-subtitle').textContent=label[2];document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});render();}

function download(filename,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function downloadReport(month){const f={...filters(),month},d=analyze(rows,f),t=d.totals;const label=custom?'Datos importados':'Datos ficticios de ejemplo';const lines=[`# Balanza · ${monthLabel(month)}`,'',label,'',`Cuenta: ${f.account||'Todas'} · Categoría: ${f.category||'Todas'}`,'',`- Ingresos: ${money(t.income)} MXN`,`- Gastos: ${money(t.expense)} MXN`,`- Saldo del período: ${money(t.balance)} MXN`,`- Movimientos: ${t.count}`,'','## Gastos por categoría','',...d.categories.map(c=>`- ${c.category}: ${money(c.amount)} MXN`),'','Resumen descriptivo. Saldo = ingresos − gastos registrados.'];download(`balanza-${month}.md`,lines.join('\n'),'text/markdown;charset=utf-8');status('Reporte descargado: '+monthLabel(month)+'.');}

document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
for(const id of ['month-filter','category-filter','account-filter'])$('#'+id).addEventListener('change',()=>{page=1;refresh();});
$('#reset-filters').addEventListener('click',()=>{for(const id of ['month-filter','category-filter','account-filter'])$('#'+id).value='';page=1;search='';refresh();});
$('#export-btn').addEventListener('click',()=>{if(!current)return;download('balanza-movimientos.csv',toCSV(current.transactions),'text/csv;charset=utf-8');status(`${current.transactions.length} movimientos exportados con los filtros actuales.`);});
$('#import-btn').addEventListener('click',()=>{$('#import-error').textContent='';$('#csv-file').value='';$('#import-storage').textContent=window.BALANZA_API?'Los movimientos se guardan en la base SQLite de este equipo.':'En esta demostración, los archivos se procesan en tu navegador. Los cambios duran hasta que recargues la página.';$('#import-dialog').showModal();});
$('#close-dialog').addEventListener('click',()=>$('#import-dialog').close());
$('#example-btn').addEventListener('click',()=>download('balanza-ejemplo.csv',toCSV([{id:'PERSONAL-001',date:'2026-11-01',description:'Compra de supermercado',category:'Alimentación',account:'Tarjeta',type:'gasto',amount_cents:58050}]),'text/csv;charset=utf-8'));
$('#import-form').addEventListener('submit',async e=>{
  e.preventDefault();const file=$('#csv-file').files[0];if(!file)return;
  $('#confirm-import').disabled=true;$('#import-error').textContent='';
  try{
    if(file.size>2000000)throw Error('El archivo supera los 2 MB.');
    const text=await file.text();let result;
    if(window.BALANZA_API){const response=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'text/csv;charset=utf-8'},body:text});result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo importar.');const loaded=await fetch('/api/transactions');if(!loaded.ok)throw Error('No se pudieron recargar los movimientos.');rows=await loaded.json();}
    else{result=mergeRows(rows,parseCSV(text));rows=result.rows;}
    if(result.imported){custom=true;$('#data-status').textContent='Ejemplo + datos importados';}
    options();page=1;await refresh();$('#import-dialog').close();status(`${result.imported} movimientos importados. ${result.skipped} ya existían y se omitieron.`);
  }catch(error){$('#import-error').textContent=error.message;}finally{$('#confirm-import').disabled=false;}
});

async function init(){try{const response=await fetch(window.BALANZA_API?'/api/transactions':'demo.json');if(!response.ok)throw Error('No se pudieron cargar los movimientos.');rows=await response.json();options();const latest=rows.map(r=>r.date.slice(0,7)).sort().at(-1);if(latest)$('#month-filter').value=latest;$('#source-label').textContent=window.BALANZA_API?'Python + SQLite':'Demostración interactiva';if(window.BALANZA_API&&rows.some(r=>!r.id.startsWith('DEMO-'))){custom=true;$('#data-status').textContent='Datos de tu base local';}await refresh();}catch(e){$('#content').innerHTML='<div class="empty">No pudimos cargar el panel. Recarga la página para volver a intentarlo.</div>';$('#content').setAttribute('aria-busy','false');status(e.message,true);}}
init();
