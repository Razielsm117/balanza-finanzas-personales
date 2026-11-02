import {test} from 'node:test';
import assert from 'node:assert/strict';
import {analyze,parseCSV,mergeRows,toCSV} from '../web/analytics.mjs';
const header='id,date,description,category,account,type,amount\n';
const fixture=header+'a,2026-10-01,Sueldo,Sueldo,Banco,ingreso,1000.00\nb,2026-10-02,Comida,Alimentación,Tarjeta,gasto,250.25\nc,2026-09-02,Internet,Servicios,Banco,gasto,120.00\n';
test('cálculos exactos, filtros e historial',()=>{
 const rows=parseCSV(fixture),d=analyze(rows,{month:'2026-10'});
 const {savings_rate,...totals}=d.totals;
 assert.deepEqual(totals,{income:100000,expense:25025,count:2,balance:74975});assert.ok(Math.abs(savings_rate-74.975)<1e-10);
 assert.equal(d.months.length,2);assert.equal(analyze(rows,{account:'Banco',month:'2026-10'}).totals.count,1);
 assert.equal(analyze(rows,{month:'2026-09'}).totals.savings_rate,null);
});
test('importación idempotente y conflictos',()=>{
 const rows=parseCSV(fixture);assert.equal(mergeRows(rows,rows).imported,0);
 assert.throws(()=>mergeRows(rows,[{...rows[0],amount_cents:1}]));assert.equal(rows[0].amount_cents,100000);
});
test('rechaza fechas y cantidades inválidas',()=>{
 for(const amount of ['0','-1','NaN','1.234','100000001'])assert.throws(()=>parseCSV(header+`x,2026-10-01,Prueba,Ocio,Banco,gasto,${amount}`));
 for(const date of ['2026-02-30','0000-01-01','2026-13-01'])assert.throws(()=>parseCSV(header+`x,${date},Prueba,Ocio,Banco,gasto,1`));
});
test('CSV con BOM, comas, comillas y saltos',()=>{
 const rows=parseCSV('\ufeff'+header+'x,2026-10-01,"Café, ""pan""\ny fruta",Comida,Banco,gasto,1.20\n');
 assert.equal(rows[0].description,'Café, "pan"\ny fruta');assert.equal(rows[0].amount_cents,120);
 assert.deepEqual(parseCSV(toCSV(rows)),rows);assert.throws(()=>parseCSV(header+'x,"sin cerrar'));
});
test('neutraliza fórmulas en exportación',()=>{
 const rows=parseCSV(fixture);rows[0].description='=1+1';assert.match(toCSV(rows),/'=1\+1/);
});
