const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'../value-line/classic');
const elements={};
const context={document:{getElementById(id){return elements[id]??={innerHTML:''};}},module:{exports:{}}};
vm.runInNewContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context);
const {years,rows,financials,prediction,hi,lo}=context.module.exports;
test('historical series have exactly ten years and finite values',()=>{
 assert.equal(years.length,10);
 for(const r of [...rows,...financials]){assert.equal(r[2].length,10);assert.ok(r[2].every(Number.isFinite));}
 hi.forEach((v,i)=>assert.ok(v>=lo[i]));
});
test('selected source anchors and illustrative forecast are distinct',()=>{
 assert.equal(rows[1][2][9],5.73);
 assert.equal(financials[0][2][9],55632);
 assert.equal(prediction(rows[1],1),'6.02');
 assert.equal(prediction(rows[4],1),'—');
});
test('all tables render with estimates and accessible chart',()=>{
 for(const id of ['per-share','financials']){
  assert.match(elements[id].innerHTML,/2020E/);
  assert.match(elements[id].innerHTML,/scope="row"/);
 }
 assert.match(elements.chart.innerHTML,/role="img"/);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/E 为演示预测，非研究结论/);
 assert.match(html,/href="notes.html"/);
 assert.doesNotMatch(html,/样板边界|读数说明|版式讨论|每股数据怎么看|预测区如何读/);
 const notes=fs.readFileSync(path.join(root,'notes.html'),'utf8');
 assert.match(notes,/不是实时行情/);
 assert.match(notes,/未建模的净资产/);
 assert.equal((html.match(/id="growth"/g)||[]).length,1);
});
