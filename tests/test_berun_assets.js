const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../value-line/berun-assets');
const d=JSON.parse(fs.readFileSync(path.join(root,'data.json'),'utf8'));
const {render}=require(path.join(root,'app.js'));
const {standardize,prepare}=require(path.join(root,'mapping.js'));
const {movementFields,assetSets}=require(path.join(root,'fields.js'));
const close=(a,b)=>assert.ok(Math.abs(a-b)<0.01,a+' != '+b);
test('original facts remain internally reconciled',()=>{
 for(const g of d.groups){for(const r of g.rows)close(r.start+r.changes.reduce((s,c)=>s+c[1],0),r.end);
 close(g.rows.reduce((s,r)=>s+r.start,0),d.totals[g.key][0]);close(g.rows.reduce((s,r)=>s+r.end,0),d.totals[g.key][1]);}
 for(const i of [0,1]){close(d.totals.op[i]+d.totals.na[i]-d.totals.nl[i],d.totals.net[i]);close(d.totals.net[i]-d.totals.minority[i],d.totals.parent[i]);}
 close(d.totals.net[1],16561766912.38);
});
test('12 universal assets and every original balance allocated once',()=>{
 const mapped=standardize(d);assert.deepEqual(mapped.map(g=>g.rows.length),[6,3,3]);
 const parts=mapped.flatMap(g=>g.rows.flatMap(r=>r.components));
 assert.equal(new Set(parts.map(r=>r.key)).size,parts.length);
 for(const src of d.groups.flatMap(g=>g.rows)){const sub=parts.filter(r=>r.origin===src.key);
 close(sub.reduce((s,r)=>s+r.start,0),src.start);close(sub.reduce((s,r)=>s+r.end,0),src.end);}
 for(const g of mapped){close(g.rows.reduce((s,r)=>s+r.start,0),d.totals[g.key][0]);close(g.rows.reduce((s,r)=>s+r.end,0),d.totals[g.key][1]);
 for(const r of g.rows){close(r.start+r.changes.reduce((s,c)=>s+c.amount,0),r.end);
 for(const c of r.changes){close(c.amount,c.details.reduce((s,x)=>s+x.amount,0));for(const e of c.details)assert.ok(movementFields[e.code]);}}}
});
test('input data is immutable across mapping calls',()=>{const before=JSON.stringify(d);standardize(d);standardize(d);assert.equal(JSON.stringify(d),before);});
test('cash uses economic directions, shifts interest out of operations',()=>{
 const cash=prepare(d).find(r=>r.key==='cash');const value=code=>cash.events.filter(e=>e.code===code).reduce((s,e)=>s+e.amount,0);
 close(value('receive')+value('pay_operating')+value('tax_cash'),2559844673.80-40959611.50);
 close(value('income_cash'),40959611.50+10389459.16);
 close(value('invest'),-3351212400);close(value('recover'),3515201780.82);
 close(value('dividend_cash'),-1723169974.19);close(value('repurchase'),-74646776.97);
 close(value('minority'),-2719564200);assert.ok(cash.events.some(e=>e.mode==='derived_cash'));
});
test('noncash investment and cash recovery are not conflated',()=>{
 const rows=prepare(d);const eq=rows.find(r=>r.key==='eq');
 assert.ok(eq.events.some(e=>e.mode==='noncash'&&e.amount===642309378.20));
 assert.ok(!rows.find(r=>r.key==='fin').events.some(e=>e.code==='recover'));
 const property=rows.find(r=>r.key==='invprop');assert.ok(property.events.every(e=>e.code!=='unresolved'));close(property.start+property.events.reduce((s,e)=>s+e.amount,0),property.end);
});
test('working capital expansion and capital tax/land reclassification close',()=>{
 const rows=prepare(d),wc=rows.find(r=>r.key==='wc');
 close(wc.breakdown.reduce((s,r)=>s+r.start,0),wc.start);close(wc.breakdown.reduce((s,r)=>s+r.end,0),wc.end);
 close(rows.find(r=>r.key==='land_pay').end,-175790318.71);
 close(rows.find(r=>r.key==='capital_tax').end,55630020.62);
});
test('main page stays compact, expandable, and source-free',()=>{
 const html=render(d),page=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/<summary>经营设施/);assert.match(html,/<summary>投资投入与收回/);assert.match(html,/收回投资/);
 assert.match(html,/未解释差额†/);assert.match(html,/余额变化†/);assert.match(html,/归母净资产/);
 assert.doesNotMatch(html,/年报印刷页|含应付性质待核实|投资净流入|筹资活动|NaN|undefined/);
 assert.doesNotMatch(html,/<details[^>]* open/);assert.match(html,/rowspan="/);
 assert.match(page,/2024 年末/);assert.match(page,/2025 年末/);assert.match(page,/必要经营现金/);
 assert.ok(fs.existsSync(path.join(root,'notes.html')));
});
test('browser scripts share a clean global scope and render without runtime error',async()=>{
 let output='',status='';const context=vm.createContext({structuredClone,fetch:async()=>({ok:true,json:async()=>structuredClone(d)}),document:{getElementById:id=>id==='rows'?{set innerHTML(v){output=v;}}:{set textContent(v){status=v;}}}});
 for(const name of ['fields.js','evidence.js','mapping.js','app.js'])vm.runInContext(fs.readFileSync(path.join(root,name),'utf8'),context,{filename:name});
 await new Promise(r=>setImmediate(r));assert.match(output,/经营权利与开发资产/);assert.equal(status,'');
});
test('broken source arithmetic is rejected instead of silently rendered',()=>{
 const bad=structuredClone(d);bad.groups[1].rows.find(r=>r.key==='cash').changes[0][1]+=100;
 assert.throws(()=>standardize(bad),/Evidence does not reconcile/);
});
test('standard dictionary is bounded and asset identifiers unique',()=>{
 const ids=assetSets.flatMap(g=>g[2].map(r=>r[0]));assert.equal(ids.length,12);assert.equal(new Set(ids).size,12);
 const economic=Object.entries(movementFields).filter(([,f])=>!['balance','unresolved','none'].includes(f[0]));
 assert.ok(economic.length<=32);assert.equal(new Set(economic.map(([,f])=>f[0])).size,13);
});
