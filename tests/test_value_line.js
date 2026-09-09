const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=path.resolve(__dirname,'../value-line');
const data=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
const {val,growth,fmt,chartSvg}=require('../value-line/app.js');
test('snapshot contains three distinct companies and real annual periods',()=>{
 assert.equal(data.length,3);assert.equal(new Set(data.map(c=>c.code)).size,3);
 for(const c of data){assert.deepEqual(c.years.map(r=>r.year),[2023,2024,2025]);assert.match(c.sourceHash,/^[a-f0-9]{64}$/);assert.ok(c.shares>0);for(const row of c.years){assert.ok(row.revenue>0);assert.ok(row.sources.length);assert.ok(Math.abs(row.grossMargin-(row.revenue-row.cost)/row.revenue)<1e-9);}}
});
test('gross capex is deducted without mixing net-capex or FCFF models',()=>{
 const r=data[0].years.at(-1);assert.equal(r.capex,9636323135);assert.equal(val(r,'cashSurplus'),r.ocf-r.capex);
 assert.equal(val({ocf:10,capex:null},'cashSurplus'),null);
});
test('missing profit is not coerced into zero or growth',()=>{
 assert.equal(fmt(null),'未收录');assert.equal(growth(null,10),null);assert.equal(growth(-10,5),null);assert.ok(Math.abs(growth(100,110)-10)<1e-9);
});
test('chart communicates real units, years, and missing values',()=>{
 const svg=chartSvg(data[0].years,'revenue');assert.match(svg,/2023/);assert.match(svg,/2025/);assert.match(svg,/亿元/);assert.doesNotMatch(svg,/NaN|undefined/);
 assert.match(chartSvg([{year:2025,profit:null}],'profit'),/尚未/);
});
test('company selection, metric buttons and per-share rendering work without a browser',async()=>{
 const elements=new Map();const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',classList:{toggle(){}},events:{},addEventListener(k,v){this.events[k]=v;}});return elements.get(id);};
 const buttons=['revenue','profit','ocf','cashSurplus'].map(metric=>({...el(metric),dataset:{metric}}));
 const context={document:{getElementById:el,querySelectorAll:()=>buttons},fetch:async()=>({ok:true,json:async()=>data}),URL,URLSearchParams,location:{search:'',href:'http://localhost/value-line/'},history:{replaceState(){}},console};
 vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(el('name').textContent,'海螺水泥');assert.match(el('history').innerHTML,/963?\.6|96\.36/);
 el('per-share').events.click();assert.match(el('unit-note').textContent,/不是各年财报 EPS/);
 el('company').events.change({target:{value:'600801.SH'}});assert.equal(el('name').textContent,'华新建材');assert.equal(el('report').href,'/reports/600801.SH/');
 buttons[2].events.click();assert.equal(el('chart-label').textContent,'经营现金流净额');
 el('peers').events.click({target:{closest:()=>({dataset:{company:'002233.SZ'}})}});assert.equal(el('name').textContent,'塔牌集团');assert.doesNotMatch(el('history').innerHTML,/NaN|undefined/);
});
