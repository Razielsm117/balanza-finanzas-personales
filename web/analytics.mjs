export const fields = ['id','date','description','category','account','type','amount'];
export const money = n => new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:2}).format(n/100);
export const monthLabel = m => new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-01T12:00:00Z'));

export function analyze(rows, filters={}) {
  const base = rows.filter(r=>(!filters.category||r.category===filters.category)&&(!filters.account||r.account===filters.account));
  const selected=base.filter(r=>!filters.month||r.date.slice(0,7)===filters.month);
  const totals={income:0,expense:0,count:selected.length}, cats=new Map(), months=new Map();
  for(const r of selected){totals[r.type==='ingreso'?'income':'expense']+=r.amount_cents;if(r.type==='gasto')cats.set(r.category,(cats.get(r.category)||0)+r.amount_cents);}
  for(const r of base){const m=r.date.slice(0,7);if(!months.has(m))months.set(m,{month:m,income:0,expense:0});months.get(m)[r.type==='ingreso'?'income':'expense']+=r.amount_cents;}
  totals.balance=totals.income-totals.expense;
  totals.savings_rate=totals.income?totals.balance/totals.income*100:null;
  return {totals,categories:[...cats].map(([category,amount])=>({category,amount})).sort((a,b)=>b.amount-a.amount||a.category.localeCompare(b.category)),months:[...months.values()].sort((a,b)=>a.month.localeCompare(b.month)),transactions:[...selected].sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id))};
}

export function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');
  const records=[];let row=[],cell='',quoted=false,afterQuote=false;
  const finish=()=>{row.push(cell);if(row.some(v=>v!==''))records.push(row);row=[];cell='';afterQuote=false;};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;}
    else if(c===','){row.push(cell);cell='';afterQuote=false;}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;finish();}
    else if(c==='"'&&cell===''&&!afterQuote)quoted=true;
    else {if(afterQuote)throw Error('CSV inválido: texto después de comillas.');cell+=c;}
  }
  if(quoted)throw Error('CSV inválido: comillas sin cerrar.');
  if(cell||row.length)finish();
  if(JSON.stringify(records.shift())!==JSON.stringify(fields))throw Error('Columnas requeridas: '+fields.join(','));
  if(!records.length||records.length>10000)throw Error('El CSV debe contener entre 1 y 10,000 movimientos.');
  const ids=new Set();
  return records.map((values,i)=>{
    if(values.length!==7)throw Error(`Fila ${i+2}: número de columnas incorrecto.`);
    const r=Object.fromEntries(fields.map((k,j)=>[k,values[j].trim()]));
    if(Object.values(r).some(v=>!v||v.length>120))throw Error(`Fila ${i+2}: campos vacíos o demasiado largos.`);
    const d=new Date(r.date+'T12:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date<'0001-01-01'||!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==r.date)throw Error(`Fila ${i+2}: fecha inválida.`);
    if(!['ingreso','gasto'].includes(r.type))throw Error(`Fila ${i+2}: tipo inválido.`);
    if(!/^\d+(\.\d{1,2})?$/.test(r.amount))throw Error(`Fila ${i+2}: importe inválido.`);
    const [whole,frac='']=r.amount.split('.');r.amount_cents=Number(whole)*100+Number(frac.padEnd(2,'0'));delete r.amount;
    if(!Number.isSafeInteger(r.amount_cents)||r.amount_cents<=0||r.amount_cents>10000000000)throw Error(`Fila ${i+2}: importe fuera de rango.`);
    if(ids.has(r.id))throw Error(`Fila ${i+2}: identificador repetido.`);ids.add(r.id);return r;
  });
}

export function mergeRows(existing, incoming) {
  const map=new Map(existing.map(r=>[r.id,r]));let imported=0;
  for(const r of incoming){if(map.has(r.id)){const old=map.get(r.id);if(['id','date','description','category','account','type','amount_cents'].some(k=>old[k]!==r[k]))throw Error('Un identificador ya existe con datos distintos: '+r.id);}else {map.set(r.id,r);imported++;}}
  if(map.size>10000)throw Error('Se permiten hasta 10,000 movimientos en total.');
  return {rows:[...map.values()],imported,skipped:incoming.length-imported};
}

export function toCSV(rows) {
  const escape=v=>{v=String(v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"';};
  return '\uFEFF'+fields.join(',')+'\r\n'+rows.map(r=>[...fields.slice(0,-1).map(k=>r[k]),(r.amount_cents/100).toFixed(2)].map(escape).join(',')).join('\r\n');
}
