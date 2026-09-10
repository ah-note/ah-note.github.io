const test=require('node:test'),assert=require('node:assert/strict');
const {model,groups}=require('../value-line/tan-assets/annual');
const view=require('../value-line/tan-assets/multi');
const {assetSets}=require('../value-line/berun-assets/fields');
const fs=require('node:fs'),path=require('node:path');
function fixture(year){
 const records={},put=(key,amount=0)=>records[key]={amount,status:'disclosed',basis:'TEST ONLY',details:[]};
 for(const [,,fields] of assetSets)for(const [key] of fields)for(const side of ['opening','closing'])put(`assets.${key}.${side}`);
 for(const [block,gs] of Object.entries(groups))for(const [group,,fields] of gs)for(const [key] of fields)put(`${block}.${group}.${key}`);
 for(const key of ['equity','minority','parent','cash'])for(const side of ['opening','closing'])put(`controls.${key}.${side}`);
 put('noncash.leases');
 return {schema:'capital-statement-v1',company:'TEST',currency:'CNY',year,records,movements:{},anomalies:[],sources:[],validation:{errors:[],warnings:[]}};
}
function fixtureV2(year){
 const d=fixture(year);d.schema='capital-statement-v2';
 d.facts={payable:{label:'Trade payables',source_amount:100000000,status:'disclosed',source_id:'annual',page:90}};
 d.mappings=[{id:'payable',fact_id:'payable',field:'assets.working.closing',amount:-100000000,rationale:'经营结算占款'}];
 d.records['assets.working.closing']={amount:-100000000,status:'disclosed',basis:'annual p.90',details:[{label:'Trade payables',source_amount:100000000,amount:-100000000,source:'annual p.90'}]};
 return d;
}
function componentFixture(year){
 const d=fixtureV2(year),opening=year===2021?80000000:90000000,closing=100000000;
 d.records['assets.working.opening']={amount:opening,status:'derived',basis:'annual',details:[{label:'Inventory',amount:opening,source_amount:opening}]};
 d.records['assets.working.closing']={amount:closing,status:'derived',basis:'annual',details:[{label:'Inventory',amount:closing,source_amount:closing}]};
 return d;
}
test('one-year and five-year independent documents preserve all standard fields',()=>{
 for(const years of [[2025],[2021,2022,2023,2024,2025]]){
  const m=model(years.map(fixture)),h=view.render(m);
  assert.equal(m.years.length,years.length);
  for(const [,,fields] of assetSets)for(const [,label] of fields)assert.ok(h.includes(label));
  assert.ok(h.includes((years[0]-1)+' 年末'));
  assert.match(h,/重要异常与一次性事项/);
  assert.doesNotMatch(h,/产品与服务收入/);
  assert.match(view.render(m,{assets:years,capital:years}),/产品与服务收入/);
 }
});
test('identity, duplicate years and currency must match; absent is not zero',()=>{
 const a=fixture(2025),b=fixture(2024);
 assert.throws(()=>model([a,a]),/重复/);
 b.currency='USD';assert.throws(()=>model([a,b]),/币种/);
 delete a.records['assets.working.closing'];
 assert.match(view.render(model([a])),/>缺失<\/td>/);
});
test('v2 fact ledger renders economic mapping and keeps source amount visible',()=>{
 const h=view.render(model([fixtureV2(2025)]),{assets:[2025]});
 assert.match(h,/Trade payables/);assert.match(h,/原始事实与映射 · 1 项/);
 assert.match(h,/来源 1\.00 → assets\.working\.closing -1\.00/);
 const bad=fixtureV2(2025);delete bad.facts;assert.throws(()=>model([bad]),/事实账本/);
});
test('adjacent opening disagreement is visible without overwriting either value',()=>{
 const a=fixture(2024),b=fixture(2025);
 a.records['assets.working.closing'].amount=100000000;
 b.records['assets.working.opening'].amount=200000000;
 const m=model([a,b]);assert.equal(m.boundaryWarnings.length,1);
 const h=view.render(m);assert.match(h,/期末／期初不一致/);assert.match(h,/前期 1.00，本期期初 2.00/);
});
test('page hides sub-3-percent discrepancies but retains material anomalies',()=>{
 const d=fixture(2025);d.records['assets.financing.closing'].amount=100000000;
 d.anomalies=[
  {title:'附注尾差',explanation:'不重要',amount:1000000,fields:['assets.financing.closing']},
  {title:'重大终止确认',explanation:'需要展示',amount:4000000,fields:['assets.financing.closing']},
 ];
 d.validation.warnings=[{code:'SMALL_DIFFERENCE',field:'financing',amount:1000}];
 const h=view.render(model([d])),anomalies=h.match(/<table class="year-anomalies">[\s\S]*?<\/table>/)[0];
 assert.doesNotMatch(anomalies,/附注尾差|不重要|SMALL_DIFFERENCE|保留 1 项/);
 assert.match(anomalies,/重大终止确认|需要展示|2025 · 1 项/);
});
test('all five-year expansion combinations form valid rectangular grids',()=>{
 const m=model([2021,2022,2023,2024,2025].map(fixture));
 for(let mask=0;mask<32;mask++){
  const years=m.years.filter((_,i)=>mask&(1<<i));
  const html=view.render(m,{assets:years,capital:years});
  for(const match of html.matchAll(/<table class="year-(?:assets|activities)"[\s\S]*?<\/table>/g)){
   const t=match[0],cols=(t.match(/<col /g)||[]).length,occupied=Array(cols).fill(0);
   for(const row of t.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
    let cursor=0;
    for(const cell of row[1].matchAll(/<(?:th|td)\b([^>]*)>/g)){
     while(occupied[cursor]>0)cursor++;
     const width=Number(cell[1].match(/colspan="(\d+)"/)?.[1]||1),height=Number(cell[1].match(/rowspan="(\d+)"/)?.[1]||1);
     for(let j=0;j<width;j++){assert.ok(cursor<cols);assert.equal(occupied[cursor],0);occupied[cursor++]=height;}
    }
    assert.ok(occupied.every(n=>n>0));for(let i=0;i<cols;i++)occupied[i]--;
   }
   assert.ok(occupied.every(n=>n===0));
  }
 }
});
test('asset components expand as aligned rows in the parent table',()=>{
 const m=model([componentFixture(2021),componentFixture(2022)]),id=view.fieldId('components','working');
 const state=view.toggleComponent({assets:[2021,2022]},id),html=view.render(m,state);
 assert.match(html,/class="asset-component"><th class="subfield">Inventory<\/th>/);
 assert.doesNotMatch(html,/<table class="components">/);
 const row=html.match(/<tr class="asset-component">([\s\S]*?)<\/tr>/)[1];
 assert.equal((row.match(/<(?:th|td)\b/g)||[]).length,6);
 assert.doesNotMatch(view.render(m,view.toggleComponent(state,id)),/class="asset-component"/);
});
test('actual v3 years render only registered Chinese table fields in filing currency',()=>{
 const root=path.join(__dirname,'../value-line/tan-assets'),manifest=JSON.parse(fs.readFileSync(path.join(root,'annual-manifest.json')));
 const docs=manifest.files.map(file=>JSON.parse(fs.readFileSync(path.join(root,file))));
 assert.ok(docs.every(d=>d.schema==='capital-statement-v3'&&d.currency==='CNY'&&d.custom_fields.length===0));
 const m=model(docs),components=Object.fromEntries(assetSets.flatMap(([, ,fields])=>fields.map(([key])=>[view.fieldId('components',key),true])));
 const html=view.render(m,{assets:m.years,capital:m.years,components}),table=html.split('<details class="page-notes">')[0];
 assert.match(table,/资本表 <small>年末余额 · CNY 亿元/);
 assert.match(table,/资本活动表 <small>全年发生额 · CNY 亿元/);
 assert.doesNotMatch(table,/Inventories|Trade receivables|Trade payables|Property, plant and equipment|Net PPE cash flow/);
 const allowed=new Set(Object.values(docs[0].display_registry.components).flat().map(([,label])=>label));
 for(const row of table.matchAll(/class="(?:asset-component|aligned-subfield)"[\s\S]*?class="subfield">([^<]+)/g))assert.ok(allowed.has(row[1])||row[1]==='无变动',row[1]);
});
test('actual Universal v4 final renders through the shared capital view',()=>{
 const root=path.join(__dirname,'../capital/UVV'),manifest=JSON.parse(fs.readFileSync(path.join(root,'annual-manifest.json')));
 const docs=manifest.files.map(file=>JSON.parse(fs.readFileSync(path.join(root,file)))),m=model(docs),html=view.render(m);
 assert.equal(docs[0].schema,'capital-statement-v4');assert.equal(m.currency,'USD');
 assert.match(html,/资本表 <small>年末余额 · USD 亿元/);assert.match(html,/重要异常与一次性事项/);
});
