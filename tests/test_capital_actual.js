const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../value-line/tan-assets');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'annual-manifest.json')));
const docs=manifest.files.map(file=>JSON.parse(fs.readFileSync(path.join(root,file))));
const {model}=require(path.join(root,'annual')),{render,fieldId}=require(path.join(root,'multi'));

test('real accepted 2025 has verified totals and exposes original cost components',()=>{
 const d=docs.find(d=>d.year===2025);assert.ok(d);
 assert.equal(d.records['controls.equity.closing'].amount,970204000);
 assert.equal(d.records['assets.other_assets.closing'].amount,81400000);
 assert.equal(d.records['assets.other_liabilities.closing'].amount,11549000);
 assert.equal(d.validation.status,'warning');assert.deepEqual(d.validation.errors,[]);
 assert.ok(Array.isArray(d.validation.warnings));
 const m=model(docs),details={};
 for(const [block,groups] of Object.entries(m.annual[2025]))if(['wealth','liquidity'].includes(block))groups.forEach((g,i)=>g.rows.forEach(r=>details[fieldId(`capital:${block}:${i}`,r.label)]=true));
 const h=render(m,{assets:m.years,capital:m.years,details});
 assert.match(h,/class="aligned-subfield"/);assert.match(h,/非经营资产/);assert.match(h,/异常与一次性事项/);
 assert.match(h,/0.814|0.81/);assert.match(h,/估计|²/);
});

test('real annual manifest loads and linked year/detail events work in page runtime',async()=>{
 const nodes={},handlers={};
 const element=id=>nodes[id]||(nodes[id]={innerHTML:'',textContent:'',setAttribute(){},addEventListener:(event,fn)=>handlers[id+':'+event]=fn,querySelector:()=>({focus(){}})});
 const context=vm.createContext({fetch:async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,file)))}),document:{getElementById:element}});
 for(const file of ['../berun-assets/fields.js','annual.js','multi.js','compare.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
 await new Promise(r=>setImmediate(r));
 assert.ok(!nodes['compare-status']);assert.equal(nodes['legacy-notes'].hidden,true);
 const click=dataset=>handlers['comparison:click']({target:{closest:()=>({dataset})}});
 click({table:'assets',year:'2025'});
 assert.match(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);
 assert.match(nodes.comparison.innerHTML,/产品与服务收入/);
 click({field:fieldId('capital:wealth:0','经营耗用与费用（折旧、损失前）'),year:'2025'});
 assert.match(nodes.comparison.innerHTML,/class="aligned-subfield"/);
 click({table:'capital',year:'2025'});
 assert.doesNotMatch(nodes.comparison.innerHTML,/<th colspan="2">2025 年变动/);
});
