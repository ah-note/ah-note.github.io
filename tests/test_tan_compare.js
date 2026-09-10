const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.join(__dirname,'../value-line'),root=path.join(base,'tan-assets');
const a=require(path.join(root,'data.json')),s24=require(path.join(root,'activities-2024.json')),s25=require(path.join(root,'activities.json'));
const {buildActivities}=require(path.join(root,'activities')),{standardize}=require(path.join(root,'mapping')),{model,render,transition}=require(path.join(root,'compare'));
const annual={2024:buildActivities(s24,s24.reconciliation),2025:buildActivities(s25,a)};
const m=model(a,annual,standardize);
test('capital preserves the frozen major/summary/child layout with merged group cells',()=>{
 const h=render(m,null).split('class="matrix capital-matrix"')[1];
 assert.ok(h);assert.equal((h.match(/class="major-cell"/g)||[]).length,11);
 assert.equal((h.match(/class="major-amount"/g)||[]).length,22);
 assert.match(h,/rowspan="7"/);assert.match(h,/净贡献／净收付/);assert.match(h,/>子项目</);
 for(const block of ['wealth','liquidity'])for(const group of annual[2025][block])assert.ok(h.includes(group.label));
 assert.doesNotMatch(h,/class="sum-row/);
 const expanded=render(m,{id:'wealth-0-0',year:2025});assert.match(expanded,/id="inline-detail" class="inline-detail"><td colspan="6"/);
 assert.equal((expanded.match(/id="inline-detail"/g)||[]).length,1);
});
test('2024 comparative activities reconcile with disclosed consolidated equity and cash changes',()=>{
 assert.equal(annual[2024].profit,171479000);assert.equal(annual[2024].equityChange,75475000);assert.equal(annual[2024].cashChange,-55667000);
 assert.equal(annual[2024].wealth[3].rows.find(r=>r.label==='少数股权交易').amount,-4445000);
 assert.equal(annual[2024].noncash,1616000);
});
test('all twelve standard asset fields are visible by default, without wide movement columns',()=>{
 const expected=standardize(a).flatMap(g=>g.rows.map(r=>r.label));
 const rows=m.sections[0].rows.filter(r=>r.kind==='asset');assert.equal(rows.length,12);
 assert.deepEqual(rows.map(r=>r.label.replace('²','')),expected);
 const h=render(m,null);for(const label of expected)assert.ok(h.includes(label));
 assert.doesNotMatch(h,/class="inline-detail"|2024 年末构成|本年变化/);
 assert.match(h,/2024/);assert.match(h,/2025/);
 assert.equal(m.sections[1].rows.find(r=>r.label==='经营净贡献').values[2025],165207000);
});
test('field composition and annual movements open in-place and preserve numeric columns',()=>{
 let h=render(m,{id:'asset-facilities',year:2025});assert.equal((h.match(/id="inline-detail"/g)||[]).length,1);assert.match(h,/本年变化/);assert.match(h,/折旧/);
 h=render(m,{id:'asset-facilities',year:2024});assert.match(h,/尚未转录/);assert.doesNotMatch(h,/本年变化/);
 h=render(m,{id:'asset-facilities',year:null});assert.match(h,/component-matrix/);assert.match(h,/公司构成/);
 h=render(m,{id:'capital-annual',year:2024});assert.match(h,/2024 · 资本活动详情/);assert.match(h,/少数股权交易/);
});
test('selection is single, toggles closed, and switches year without changing inputs',()=>{
 const before=JSON.stringify(a);let s=transition(null,'asset-cash',2024);assert.deepEqual(s,{id:'asset-cash',year:2024});
 s=transition(s,'asset-cash',2025);assert.equal(s.year,2025);assert.equal(transition(s,'asset-cash',2025),null);
 model(a,annual,standardize);assert.equal(JSON.stringify(a),before);
});
test('new view keeps notes in the same document and has no navigation links',()=>{
 const h=fs.readFileSync(path.join(root,'compare.html'),'utf8');assert.match(h,/page-notes/);assert.doesNotMatch(h,/<a\b|iframe/);
 assert.match(h,/TAN_COMPARE=true/);assert.match(h,/compare.js/);
});
test('browser loading and delegated field/year/close actions work together',async()=>{
 const nodes={},handlers={};
 const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',addEventListener:(type,fn)=>{handlers[id+':'+type]=fn;},querySelector:()=>({focus(){}})});
 const context=vm.createContext({TAN_COMPARE:true,fetch:async url=>({ok:true,json:async()=>structuredClone(url==='data.json'?a:url==='activities.json'?s25:s24)}),document:{getElementById:element}});
 for(const f of ['berun-assets/fields.js','tan-assets/mapping.js','tan-assets/activities.js','tan-assets/compare.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),context,{filename:f});
 await new Promise(r=>setImmediate(r));assert.match(nodes.comparison.innerHTML,/经营周转净额/);assert.ok(!nodes['compare-status']);assert.ok(!nodes['activity-rows']);
 const click=dataset=>handlers['comparison:click']({target:{closest:()=>({dataset})}});
 click({id:'asset-facilities',year:'2025'});assert.match(nodes.comparison.innerHTML,/本年变化/);
 click({id:'asset-facilities',year:'2024'});assert.match(nodes.comparison.innerHTML,/尚未转录/);
 click({close:'true'});assert.doesNotMatch(nodes.comparison.innerHTML,/id="inline-detail"/);
 click({id:'capital-annual',year:'2025'});assert.match(nodes.comparison.innerHTML,/2025 · 资本活动详情/);
 handlers['collapse-all:click']();assert.doesNotMatch(nodes.comparison.innerHTML,/id="inline-detail"/);
});
