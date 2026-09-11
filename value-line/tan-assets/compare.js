(function(){
 'use strict';
 function model(assets,annual,mapper){
  const years=Object.keys(annual).map(Number).sort();
  if(years.join()!=='2024,2025')throw Error('新增年份须提供同口径余额和年度活动');
  return {years,annual,assets,groups:mapper(assets),currency:'CNY'};
 }
 function render(m,state){return (typeof module!=='undefined'?require('./multi.js'):TanMultiView).render(m,state||{});}
 if(typeof module!=='undefined')module.exports={model,render};
 else (async()=>{
  const response=await fetch('annual-manifest.json');let m;
  if(response.ok){
   const manifest=await response.json(),docs=await Promise.all(manifest.files.map(async file=>{const r=await fetch(file);if(!r.ok)throw Error('年度数据读取失败');return r.json();}));
   m=CapitalAnnual.model(docs);
   document.getElementById('legacy-notes').hidden=true;
  }else if(response.status===404){
   const [assets,a25,a24]=await Promise.all(['data.json','activities.json','activities-2024.json'].map(async url=>{const r=await fetch(url);if(!r.ok)throw Error('数据读取失败');return r.json();}));
   const annual={2024:TanActivities.buildActivities(a24,a24.reconciliation),2025:TanActivities.buildActivities(a25,assets)};
   m=model(assets,annual,standardize);
  }else throw Error('年度清单读取失败');
  const root=document.getElementById('comparison');let state={};
  const draw=()=>{
   document.getElementById('filing-currency').textContent='合并口径 · '+m.currency+' 亿元';
   root.innerHTML=render(m,state);
   document.getElementById('compare-status').textContent=m.excludedPeriods?.length?'已优先展示最新字段规范；'+m.excludedPeriods.length+'个旧口径期间暂未混合展示。':'';
   document.getElementById('view-help').textContent='点击报告截止日展开或收起该期明细，两表联动；可同时展开多期。净资产形成与资金收付是不同视角，不能相加。';
  };
  draw();
  root.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b)return;
   if(b.dataset.component){
    state=TanMultiView.toggleComponent(state,b.dataset.component);draw();
    root.querySelector('button[data-component="'+b.dataset.component+'"]')?.focus({preventScroll:true});
    return;
   }
   if(b.dataset.field){
    state=TanMultiView.toggleField(state,b.dataset.field);draw();
    root.querySelector('button[data-field="'+b.dataset.field+'"][data-year="'+b.dataset.year+'"]')?.focus({preventScroll:true});
    return;
   }
   if(!b.dataset.table)return;
   const table=b.dataset.table,selectedYear=/^\d{4}$/.test(b.dataset.year)?Number(b.dataset.year):b.dataset.year;
   state=TanMultiView.toggle(state,table,selectedYear);
   draw();
   root.querySelector('button[data-table="'+table+'"][data-year="'+selectedYear+'"]')?.focus({preventScroll:true});
  });
 })().catch(e=>{document.getElementById('compare-status').textContent='年度表暂未显示：'+e.message;});
})();
