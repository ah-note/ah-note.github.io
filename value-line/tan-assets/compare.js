(function(){
 'use strict';
 function model(assets,annual,mapper){
  const years=Object.keys(annual).map(Number).sort();
  if(years.join()!=='2024,2025')throw Error('新增年份须提供同口径余额和年度活动');
  return {years,annual,assets,groups:mapper(assets)};
 }
 function render(m,state){return (typeof module!=='undefined'?require('./multi.js'):TanMultiView).render(m,state||{});}
 if(typeof module!=='undefined')module.exports={model,render};
 else Promise.all(['data.json','activities.json','activities-2024.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('数据读取失败');return r.json();}))).then(([assets,a25,a24])=>{
  const annual={2024:TanActivities.buildActivities(a24,a24.reconciliation),2025:TanActivities.buildActivities(a25,assets)};
  const m=model(assets,annual,standardize),root=document.getElementById('comparison');let state={},view='multi',year=2025;
  const draw=()=>{
   root.innerHTML=view==='multi'?render(m,state):TanSimpleView.simpleView(year,assets,annual,standardize,TanAssetView.render,TanActivities.renderActivities);
   document.getElementById('view-simple').setAttribute('aria-pressed',String(view==='simple'));
   document.getElementById('view-multi').setAttribute('aria-pressed',String(view==='multi'));
   document.getElementById('end-year-label').hidden=view!=='simple';
   document.getElementById('view-help').textContent=view==='multi'?'点击年份，在该年份位置展开简版；再次点击折叠。税项分摊为估计；两种活动汇总不可相加。':'简版按所选期末年份展示资产流转和全年资本活动。税项分摊为估计；两种活动汇总不可相加。';
  };
  draw();
  root.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b||view!=='multi')return;
   if(b.dataset.field){
    state=TanMultiView.toggleField(state,b.dataset.field);draw();
    root.querySelector('button[data-field="'+b.dataset.field+'"][data-year="'+b.dataset.year+'"]')?.focus({preventScroll:true});
    return;
   }
   if(!b.dataset.table)return;
   const table=b.dataset.table,selectedYear=Number(b.dataset.year);
   state=TanMultiView.toggle(state,table,selectedYear);
   draw();
   root.querySelector('button[data-table="'+table+'"][data-year="'+selectedYear+'"]')?.focus({preventScroll:true});
  });
  for(const mode of ['simple','multi'])document.getElementById('view-'+mode).addEventListener('click',()=>{view=mode;draw();});
  document.getElementById('end-year').addEventListener('change',event=>{year=Number(event.target.value);draw();});
 }).catch(e=>{document.getElementById('compare-status').textContent='年度表暂未显示：'+e.message;});
})();
