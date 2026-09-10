const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../value-line'),root=path.join(base,'tan-assets');
const assets=require(path.join(root,'data.json')),s24=require(path.join(root,'activities-2024.json')),s25=require(path.join(root,'activities.json'));
const {buildActivities}=require(path.join(root,'activities')),{standardize}=require(path.join(root,'mapping')),{model,render}=require(path.join(root,'compare')),{toggle}=require(path.join(root,'multi'));
const annual={2024:buildActivities(s24,s24.reconciliation),2025:buildActivities(s25,assets)},m=model(assets,annual,standardize);
test('default retains standard asset rows and only capital major totals',()=>{
 const h=render(m,{});
 for(const r of standardize(assets).flatMap(g=>g.rows))assert.ok(h.includes(r.label));
 assert.doesNotMatch(h,/产品与服务收入|经营所得税 · 估计|inline-detail|2025 年变动/);
 for(const block of ['wealth','liquidity'])for(const g of annual[2025][block])assert.ok(h.includes(g.label));
});
test('asset expansion inserts changes before that year balance, with original rowspans and totals',()=>{
 const h=render(m,{assets:2025});
 assert.match(h,/2025 年变动/);assert.match(h,/变动合计/);assert.match(h,/rowspan="\d+"/);
 assert.ok(h.indexOf('2024 ▸')<h.indexOf('2025 年变动'));
 assert.ok(h.indexOf('2025 年变动')<h.indexOf('2025 ▾'));
 assert.doesNotMatch(h,/inline-detail|产品与服务收入/);
});
test('capital expansion inserts children after the selected annual total',()=>{
 const h=render(m,{capital:2025});
 assert.match(h,/产品与服务收入/);assert.match(h,/税后经营盈余（折旧、损失前）/);
 assert.match(h,/rowspan="7"/);assert.match(h,/子项目/);assert.match(h,/净贡献／净收付/);
 assert.doesNotMatch(h,/2025 年变动|inline-detail/);
 assert.ok(h.includes('1.65'));assert.ok(h.includes('2.02'));
});
test('two tables expand independently and repeated year click collapses',()=>{
 let s=toggle({},'assets',2025);s=toggle(s,'capital',2024);
 assert.deepEqual(s,{assets:2025,capital:2024});
 const h=render(m,s);assert.match(h,/2025 年变动/);assert.match(h,/购买少数股权/);
 s=toggle(s,'assets',2025);assert.equal(s.assets,null);assert.equal(s.capital,2024);
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
 for(const a of [null,2024,2025])for(const c of [null,2024,2025]){
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
 click({table:'assets',year:'2025'});assert.match(nodes.comparison.innerHTML,/2025 年变动/);
 click({table:'capital',year:'2025'});assert.doesNotMatch(nodes.comparison.innerHTML,/产品与服务收入/);
 handlers['view-simple:click']();assert.match(nodes.comparison.innerHTML,/simple-assets/);
 handlers['end-year:change']({target:{value:'2024'}});assert.match(nodes.comparison.innerHTML,/2023 年末/);
 handlers['view-multi:click']();assert.match(nodes.comparison.innerHTML,/2025 年变动/);
 const page=fs.readFileSync(path.join(root,'compare.html'),'utf8');assert.doesNotMatch(page,/<a\b|window.print|collapse-all/);
});
