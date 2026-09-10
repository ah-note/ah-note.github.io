const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../value-line/tan-assets');
const source=require(path.join(root,'activities.json')),assets=require(path.join(root,'data.json'));
const {buildActivities,renderActivities}=require(path.join(root,'activities.js'));
test('capital activity closes independently to income, equity and all-cash movements',()=>{
 const d=buildActivities(source,assets);
 assert.equal(d.profit,171027000);assert.equal(d.equityChange,86245000);assert.equal(d.cashChange,61025000);
 assert.equal(d.noncash,21974000);
 assert.equal(d.wealth[0].amount,165207000);
 const rows=d.wealth[0].rows;
 assert.equal(rows[4].amount,202149000);
 assert.equal(rows[4].amount+rows[5].amount+rows[6].amount,d.wealth[0].amount);
});
test('tax allocation is explicit, rounded and reconciled; D&A is not deducted twice',()=>{
 const d=buildActivities(source,assets),tax=d.wealth.flatMap(g=>g.rows).filter(r=>r.label.includes('估计'));
 assert.equal(tax.length,3);assert.equal(tax.reduce((s,r)=>s+r.amount,0),-45459000);
 assert.equal(d.wealth[0].rows.find(r=>r.label==='折旧摊销').amount,-10641000);
 assert.equal(d.wealth[0].rows.find(r=>r.label==='经营资产损失').amount,-26301000);
 assert.ok(d.wealth.every(g=>!g.rows.some(r=>r.label==='购建经营资产')));
});
test('standard groups preserve zero shareholder actions and separate approved from paid dividends',()=>{
 const d=buildActivities(source,assets);
 assert.equal(d.wealth[3].rows[0].amount,0);assert.equal(d.wealth[3].rows[2].amount,0);
 assert.equal(d.wealth[3].rows[1].amount,-89569000);
 assert.equal(d.liquidity[4].rows[1].amount,-89569000);
 assert.equal(d.liquidity[1].amount,-18743000);assert.equal(d.liquidity[2].amount,9318000);
});
test('rendered activity has no balance columns or source-page clutter',()=>{
 const h=renderActivities(buildActivities(source,assets));
 assert.match(h,/净资产形成/);assert.match(h,/资金收付与配置/);assert.match(h,/估计/);
 assert.match(h,/非现金资本配置/);assert.match(h,/details/);
 assert.doesNotMatch(h,/年初|年末|印刷页|NaN|undefined|<details open/);
});
test('both browser tables load together, and failed activity loading has an explicit state',async()=>{
 const content={}; const base=path.join(root,'..');
 const context=vm.createContext({fetch:async url=>({ok:true,json:async()=>structuredClone(url==='activities.json'?source:assets)}),document:{getElementById:id=>({set innerHTML(v){content[id]=v;},set textContent(v){content[id]=v;}})}});
 for(const file of ['berun-assets/fields.js','tan-assets/activities.js','tan-assets/mapping.js','berun-assets/app.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
 await new Promise(r=>setImmediate(r));assert.match(content.rows,/经营净资产/);assert.match(content['activity-rows'],/净资产增加/);assert.ok(!content['activity-status']);
 const failed=vm.createContext({fetch:async()=>({ok:false}),document:{getElementById:id=>({set textContent(v){content[id]=v;}})}});
 vm.runInContext(fs.readFileSync(path.join(root,'activities.js'),'utf8'),failed);
 await new Promise(r=>setImmediate(r));assert.match(content['activity-status'],/暂未显示/);
});
test('broken source or asset reconciliation is rejected',()=>{
 let a=structuredClone(assets);a.totals.net[1]++;assert.throws(()=>buildActivities(source,a),/未闭合/);
 let s=structuredClone(source);s.cash.capex++;assert.throws(()=>buildActivities(s,assets),/未闭合/);
 s=structuredClone(source);s.profit.otherOperating[0][1]++;assert.throws(()=>buildActivities(s,assets),/明细不闭合/);
});
