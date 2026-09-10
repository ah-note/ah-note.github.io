const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../value-line'),d=JSON.parse(fs.readFileSync(path.join(root,'tan-assets/data.json'),'utf8'));
const {standardize}=require(path.join(root,'tan-assets/mapping.js'));
const {render}=require(path.join(root,'berun-assets/app.js'));
test('Tan applies exactly the same twelve asset rows as Berun',()=>{
 const a=standardize(d);assert.deepEqual(a.map(g=>g.rows.length),[6,3,3]);
 const defs=require(path.join(root,'berun-assets/fields.js')).assetSets;
 assert.deepEqual(a.flatMap(g=>g.rows.map(r=>r.label)),defs.flatMap(g=>g[2].map(r=>r[1])));
 assert.equal(a.flatMap(g=>g.rows.flatMap(r=>r.components)).length,d.components.length);
});
test('all component rollforwards close exactly to disclosed thousand-yuan amounts',()=>{
 for(const c of d.components)assert.equal(c.start+c.events.reduce((s,e)=>s+e.amount,0),c.end,c.key);
 assert.equal(d.totals.op[1]+d.totals.na[1]-d.totals.nl[1],970204000);
 assert.equal(d.totals.net[0]+171027000+4787000-89569000,d.totals.net[1]);
 assert.deepEqual(d.totals.parent,d.totals.net);
});
test('cash consolidates deposits without duplicating internal transfers',()=>{
 const c=d.components.find(c=>c.key==='cash');assert.equal(c.end,425739000);
 assert.equal(c.breakdown.reduce((s,r)=>s+r.end,0),c.end);
 assert.equal(c.events.reduce((s,e)=>s+e.amount,0),61025000);
 assert.equal(c.events.find(e=>e.code==='operating_net').amount,213393000);
 assert.equal(c.events.find(e=>e.code==='dividend_cash').amount,-89569000);
 assert.ok(!c.events.some(e=>e.label.includes('到期存款')));
});
test('dividend proposal is not recognised and annual report discrepancies stay visible',()=>{
 const div=d.components.find(c=>c.key==='dividend');assert.equal(div.start,333000);assert.equal(div.end,0);
 assert.ok(!div.events.some(e=>Math.abs(e.amount)===85657000));
 assert.equal(div.events.find(e=>e.code==='unresolved').amount,-333000);
 const lease=d.components.find(c=>c.key==='lease');assert.equal(lease.end,20773000);
 assert.equal(lease.events.find(e=>e.code==='unresolved').amount,-1000);
 assert.equal(d.components.find(c=>c.key==='capital').estimated,true);
});
test('HTML preserves compact expandable layout and shows tiny discrepancies',()=>{
 const h=render(d,standardize);assert.match(h,/经营设施/);assert.match(h,/资本采购结算净额²/);
 assert.match(h,/-0\.00001/);assert.match(h,/经营收付净额/);assert.doesNotMatch(h,/NaN|undefined|年报印刷页/);
 assert.doesNotMatch(h,/<details[^>]* open/);
 const page=fs.readFileSync(path.join(root,'tan-assets/index.html'),'utf8');assert.match(page,/谭木匠/);assert.match(page,/00837.HK/);assert.match(page,/人民币亿元/);
});
test('Tan browser uses its own data mapper and shared renderer',async()=>{
 let html='',status='';const context=vm.createContext({fetch:async()=>({ok:true,json:async()=>structuredClone(d)}),document:{getElementById:id=>id==='rows'?{set innerHTML(v){html=v;}}:{set textContent(v){status=v;}}}});
 for(const file of ['berun-assets/fields.js','tan-assets/mapping.js','berun-assets/app.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
 await new Promise(r=>setImmediate(r));assert.match(html,/9\.70/);assert.match(html,/木料及产品跌价/);assert.equal(status,'');
});
test('bad mapping, broken arithmetic, and duplicate components fail explicitly',()=>{
 let bad=structuredClone(d);bad.components[0].end++;assert.throws(()=>standardize(bad),/Unclosed/);
 bad=structuredClone(d);bad.components[0].asset='invented';assert.throws(()=>standardize(bad),/Unmapped/);
 bad=structuredClone(d);bad.components.push(bad.components[0]);assert.throws(()=>standardize(bad),/Duplicate/);
});
