const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../value-line'),root=path.join(base,'tan-assets');
const assets=require(path.join(root,'data.json')),s24=require(path.join(root,'activities-2024.json')),s25=require(path.join(root,'activities.json'));
const {buildActivities}=require(path.join(root,'activities')),{standardize}=require(path.join(root,'mapping')),{model,render}=require(path.join(root,'compare')),{toggle}=require(path.join(root,'multi'));
const annual={2024:buildActivities(s24,s24.reconciliation),2025:buildActivities(s25,assets)},m=model(assets,annual,standardize);
test('union follows canonical order and distinguishes absent, zero, and missing cells',()=>{
 const {union}=require(path.join(root,'multi'));
 assert.deepEqual(union([['A','B','D'],['A','C','D','E']],['A','B','C','D','E']),['A','B','C','D','E']);
 assert.deepEqual(union([['A','C','D','E'],['A','B','D']],['A','B','C','D','E']),['A','B','C','D','E']);
 const h=render(m,{capital:[2024,2025]});
 const minority=[...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].find(x=>x[1].includes('少数股权交易'))[1];
 assert.match(minority,/<td><\/td><td><\/td>$/);assert.match(h,/>0\.00<\/td>/);
 assert.doesNotMatch(render(m,{capital:[2025]}),/少数股权交易/);
 const copy={...m,annual:structuredClone(annual)};copy.annual[2024].wealth[0].rows[0].amount=null;
 assert.match(render(copy,{capital:[2024,2025]}),/产品与服务收入<\/td><td class="amount">缺失/);
 assert.match(render(m,{assets:[2024,2025]}),/数据未取得/);
});
test('balance headers stay fixed and annual flow headers are separate',()=>{
 for(const year of [null,2024,2025]){
  const h=render(m,{assets:year,capital:year});
  assert.deepEqual([...h.matchAll(/class="balance-label">(\d+) 年末/g)].map(x=>x[1]),['2023','2024','2025']);
  assert.match(h,/2024 全年/);assert.match(h,/2025 全年/);
  if(year){assert.ok(h.indexOf(year+' 年变动</th>')<h.indexOf('class="balance-label">'+year+' 年末'));}
 }
 const css=fs.readFileSync(path.join(root,'simple.css'),'utf8');assert.match(css,/max-width:none;width:100%;margin:0/);assert.match(css,/overflow-x:auto/);assert.match(css,/\.simple-view>\.table-wrap>table\{margin-inline:auto\}/);
});
test('default retains standard asset rows and only capital major totals',()=>{
 const h=render(m,{});
 for(const r of standardize(assets).flatMap(g=>g.rows))assert.ok(h.includes(r.label));
 assert.doesNotMatch(h,/产品与服务收入|经营所得税 · 估计|inline-detail|<th colspan="2">2025 年变动/);
 for(const block of ['wealth','liquidity'])for(const g of annual[2025][block])assert.ok(h.includes(g.label));
});
test('asset expansion inserts changes before that year balance, with original rowspans and totals',()=>{
 const h=render(m,{assets:2025});
 assert.match(h,/<th colspan="2">2025 年变动/);assert.match(h,/变动合计/);assert.match(h,/rowspan="\d+"/);
 assert.ok(h.indexOf('2024 年末')<h.indexOf('2025 年变动'));
 assert.ok(h.indexOf('2025 年变动')<h.indexOf('2025 年末'));
 assert.doesNotMatch(h,/inline-detail|产品与服务收入/);
});
test('capital expansion inserts children after the selected annual total',()=>{
 const h=render(m,{capital:2025});
 assert.match(h,/产品与服务收入/);assert.match(h,/税后经营盈余（折旧、损失前）/);
 assert.match(h,/rowspan="7"/);assert.match(h,/子项目/);assert.match(h,/净贡献／净收付/);
 assert.doesNotMatch(h,/<th colspan="2">2025 年变动|inline-detail/);
 assert.ok(h.includes('1.65'));assert.ok(h.includes('2.02'));
});
test('each year and table toggles independently without mutating earlier selections',()=>{
 let s=toggle({},'assets',2025);s=toggle(s,'capital',2024);
 assert.deepEqual(s,{assets:[2025],capital:[2024]});
 const h=render(m,s);assert.match(h,/<th colspan="2">2025 年变动/);assert.match(h,/购买少数股权/);
 s=toggle(s,'assets',2024);assert.deepEqual(s,{assets:[2024,2025],capital:[2024]});
 s=toggle(s,'capital',2025);assert.deepEqual(s,{assets:[2024,2025],capital:[2024,2025]});
 s=toggle(s,'assets',2025);assert.deepEqual(s,{assets:[2024],capital:[2024,2025]});
 assert.match(render(m,{assets:2024}),/2023 年末/);assert.match(render(m,{assets:2024}),/未转录/);
});
test('all collapsed and expanded table grids have valid column spans',()=>{
 function grid(html){
  html=html.replace(/<table class="components">[\s\S]*?<\/table>/g,'');
  const colgroup=html.match(/<colgroup>([\s\S]*?)<\/colgroup>/)[1];
  const cols=(colgroup.match(/<col /g)||[]).length,occupied=Array(cols).fill(0);
  for(const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)){
   let cursor=0;
   for(const cell of tr[1].matchAll(/<(?:th|td)\b([^>]*)>/g)){
    while(occupied[cursor]>0)cursor++;
    const n=Number(cell[1].match(/colspan="(\d+)"/)?.[1]||1),span=Number(cell[1].match(/rowspan="(\d+)"/)?.[1]||1);
    for(let i=0;i<n;i++){assert.ok(cursor<cols,'cell exceeds table');assert.equal(occupied[cursor],0);occupied[cursor++]=span;}
   }
   assert.ok(occupied.every(n=>n>0),'unfilled table slot');
   for(let i=0;i<cols;i++)occupied[i]--;
  }
  assert.ok(occupied.every(n=>n===0));
 }
 for(const a of [[],[2024],[2025],[2024,2025]])for(const c of [[],[2024],[2025],[2024,2025]]){
  const h=render(m,{assets:a,capital:c}).replace(/<table class="components">[\s\S]*?<\/table>/g,'');
  for(const t of h.matchAll(/<table\b[\s\S]*?<\/table>/g))grid(t[0]);
 }
});
test('same-page controls toggle annual columns and preserve simple year selection',async()=>{
 const nodes={},handlers={};
 const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',setAttribute(){},addEventListener:(t,fn)=>{handlers[id+':'+t]=fn;},querySelector:()=>({focus(){}})});
 const context=vm.createContext({TAN_COMPARE:true,fetch:async url=>({ok:true,json:async()=>structuredClone(url==='data.json'?assets:url==='activities.json'?s25:s24)}),document:{getElementById:element}});
 for(const f of ['berun-assets/fields.js','tan-assets/mapping.js','tan-assets/activities.js','berun-assets/app.js','tan-assets/simple.js','tan-assets/multi.js','tan-assets/compare.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),context);
 await new Promise(r=>setImmediate(r));assert.ok(!nodes['compare-status']);assert.doesNotMatch(nodes.comparison.innerHTML,/产品与服务收入/);
 const click=dataset=>handlers['comparison:click']({target:{closest:()=>({dataset})}});
 click({table:'capital',year:'2025'});assert.match(nodes.comparison.innerHTML,/产品与服务收入/);
 click({table:'assets',year:'2025'});assert.match(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);
 click({table:'capital',year:'2024'});assert.match(nodes.comparison.innerHTML,/购买少数股权/);assert.match(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);
 click({table:'assets',year:'2024'});assert.match(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);assert.match(nodes.comparison.innerHTML,/<th colspan="2">2024 年变动/);
 handlers['view-simple:click']();assert.match(nodes.comparison.innerHTML,/simple-assets/);
 handlers['end-year:change']({target:{value:'2024'}});assert.match(nodes.comparison.innerHTML,/2023 年末/);
 handlers['view-multi:click']();assert.match(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);
 const page=fs.readFileSync(path.join(root,'compare.html'),'utf8');assert.doesNotMatch(page,/<a\b|window.print|collapse-all/);
});
