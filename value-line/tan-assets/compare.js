(function(){
 'use strict';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
 const signed=n=>(n>0?'+':'')+money(n);
 const lines=xs=>'<dl class="detail-lines">'+xs.map(x=>'<div><dt>'+escape(x.label)+'</dt><dd>'+signed(x.amount)+'</dd></div>').join('')+'</dl>';
 function model(assets, annual, mapper){
  const sections=[{id:'assets',title:'资产与负债',period:'年末余额',rows:[]},{id:'capital',title:'资本活动',period:'全年发生额',rows:[]}];
  const years=Object.keys(annual).map(Number).sort();
  if(years.join()!=='2024,2025')throw Error('资产数据当前仅覆盖2024、2025；新增年份须提供相应余额');
  const push=(section,r)=>sections[section].rows.push(r);
  for(const g of mapper(assets)){
   push(0,{id:'head-'+g.key,label:g.title,heading:true});
   for(const r of g.rows){
    const parts=r.components.flatMap(c=>c.breakdown||[c]);
    const composition=year=>parts.map(c=>({label:c.label,amount:c[year===2024?'start':'end']}));
    push(0,{id:'asset-'+r.key,label:r.label+r.marker,values:{2024:r.start,2025:r.end},kind:'asset',composition,
     detail:year=>year===2024?'<p class="muted">2024 年末构成；2023 年末至 2024 年末的逐项变动尚未转录。</p>'+lines(composition(year)):
      '<div class="bridge"><span>2024 年末 <b>'+money(r.start)+'</b></span><span>本年变化 <b>'+signed(r.end-r.start)+'</b></span><span>2025 年末 <b>'+money(r.end)+'</b></span></div>'+r.changes.map(c=>'<details class="movement"><summary>'+escape(c.label)+'<b>'+signed(c.amount)+'</b></summary>'+lines(c.details.map(e=>({label:e.fieldLabel+' · '+e.label+(e.mode==='noncash'?'（非现金）':''),amount:e.amount})))+'</details>').join('')
    });
   }
   push(0,{id:'sum-'+g.key,label:g.title+'合计',total:true,values:{2024:assets.totals[g.key][0],2025:assets.totals[g.key][1]},detail:y=>lines(g.rows.map(r=>({label:r.label,amount:r[y===2024?'start':'end']})))});
  }
  for(const [key,label] of [['net','净资产合计'],['minority','其中：少数股东权益'],['parent','归母净资产']])push(0,{id:key,label,total:true,values:{2024:assets.totals[key][0],2025:assets.totals[key][1]},detail:y=>key==='net'?lines([{label:'经营净资产',amount:assets.totals.op[y===2024?0:1]},{label:'非经营资产',amount:assets.totals.na[y===2024?0:1]},{label:'减：非经营负债',amount:-assets.totals.nl[y===2024?0:1]}]):'<p>净资产合计减少数股东权益，得到归母净资产。</p>'});
  for(const [block,title,totalKey,totalLabel] of [['wealth','净资产形成','equityChange','净资产增加'],['liquidity','资金收付与配置','cashChange','现金与存款增加']]){
   push(1,{id:block,label:title,heading:true});
   annual[2025][block].forEach((g,gi)=>{
    const labels=[...new Set(years.flatMap(y=>annual[y][block][gi].rows.map(r=>r.label)))];
    labels.forEach((label,ri)=>{
     const entries=Object.fromEntries(years.map(y=>[y,annual[y][block][gi].rows.find(r=>r.label===label)||{label,amount:0,details:[]}]));
     push(1,{id:block+'-'+gi+'-'+ri,label,total:Object.values(entries).some(e=>e.subtotal),values:Object.fromEntries(years.map(y=>[y,entries[y].amount])),
      detail:y=>entries[y].details.length?lines(entries[y].details):'<p>'+escape(label.includes('估计')?'按当年公司实际税负比例分摊，属于估计；不是单独披露的税款。':Object.values(entries).some(e=>e.subtotal)?'由以上收入、费用和所得税汇总；不等于实收现金。':'当年该项金额为 '+signed(entries[y].amount)+' 亿元。')+'</p>'});
    });
    push(1,{id:block+'-sum-'+gi,label:g.label,total:true,values:Object.fromEntries(years.map(y=>[y,annual[y][block][gi].amount])),detail:y=>lines(annual[y][block][gi].rows.filter(r=>!r.subtotal))});
   });
   push(1,{id:block+'-total',label:totalLabel,total:true,final:true,values:Object.fromEntries(years.map(y=>[y,annual[y][totalKey]])),detail:y=>lines(annual[y][block].map(g=>({label:g.label,amount:g.amount})))});
  }
  push(1,{id:'noncash-head',label:'非现金资本配置（不计入上方汇总）',heading:true});
  push(1,{id:'lease-new',label:'新增租赁',values:Object.fromEntries(years.map(y=>[y,annual[y].noncash])),detail:y=>'<p>同时增加经营设施与融资负债 '+money(annual[y].noncash)+' 亿元，不产生当期现金支付或净资产增加。</p>'});
  return {years,sections};
 }
 function transition(current,id,year){return current&&current.id===id&&current.year===year?null:{id,year};}
 function render(m,selection){
  const count=m.years.length+1;
  const button=(id,year,label,cls='')=>'<button type="button" class="'+cls+'" data-id="'+id+'" data-year="'+(year??'')+'" aria-expanded="'+Boolean(selection&&selection.id===id&&selection.year===year)+'" aria-controls="inline-detail">'+label+'</button>';
  const detailPanel=(title,body)=>'<tr id="inline-detail" class="inline-detail"><td colspan="'+count+'"><div class="detail-heading"><strong>'+escape(title)+'</strong><button type="button" data-close="true">收起 ×</button></div>'+body+'</td></tr>';
  return m.sections.map(section=>{
   const annualId=section.id+'-annual';
   let h='<section class="matrix-section"><div class="table-wrap"><table class="matrix"><caption>'+section.title+' <small>'+section.period+' · 人民币亿元</small></caption><colgroup><col class="field-col">'+m.years.map(()=>'<col>').join('')+'</colgroup><thead><tr><th scope="col">标准项目</th>'+m.years.map(y=>'<th scope="col">'+button(annualId,y,String(y),'year-button')+'</th>').join('')+'</tr></thead><tbody>';
   if(selection?.id===annualId){const y=selection.year;h+=detailPanel(y+' · '+section.title+'详情',section.rows.filter(r=>!r.heading).map(r=>'<details class="annual-item"><summary>'+escape(r.label)+'<b>'+money(r.values[y])+'</b></summary>'+r.detail(y)+'</details>').join(''));}
   for(const r of section.rows){
    if(r.heading){h+='<tr class="band"><th colspan="'+count+'">'+escape(r.label)+'</th></tr>';continue;}
    h+='<tr class="'+(r.total?'sum-row ':'')+(r.final?'grand-total':'')+'"><th scope="row">'+button(r.id,null,escape(r.label),'field-button')+'</th>'+m.years.map(y=>'<td>'+button(r.id,y,money(r.values[y]),'number-button')+'</td>').join('')+'</tr>';
    if(selection?.id===r.id){const y=selection.year;let body;
     if(y!==null)body=r.detail(y);
     else if(r.composition){const parts=m.years.map(year=>r.composition(year));body='<table class="component-matrix"><thead><tr><th>公司构成</th>'+m.years.map(year=>'<th>'+year+'</th>').join('')+'</tr></thead><tbody>'+parts[0].map((p,i)=>'<tr><th>'+escape(p.label)+'</th>'+parts.map(ps=>'<td>'+money(ps[i].amount)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'+(parts[0].length?'':'<p>该标准项没有已识别余额。</p>');}
     else body=m.years.map(year=>'<div class="year-detail"><strong>'+year+'</strong>'+r.detail(year)+'</div>').join('');
     h+=detailPanel(r.label+(y?' · '+y:''),body);
    }
   }
   return h+'</tbody></table></div></section>';
  }).join('');
 }
 if(typeof module!=='undefined')module.exports={model,render,transition};
 else Promise.all(['data.json','activities.json','activities-2024.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('数据读取失败');return r.json();}))).then(([assets,a25,a24])=>{
  const annual={2024:TanActivities.buildActivities(a24,a24.reconciliation),2025:TanActivities.buildActivities(a25,assets)};
  const m=model(assets,annual,standardize),root=document.getElementById('comparison');let state=null;
  root.innerHTML=render(m,state);
  root.addEventListener('click',event=>{
   const b=event.target.closest('button');if(!b)return;
   const previous=state;
   state=b.dataset.close?null:transition(state,b.dataset.id,b.dataset.year===''?null:Number(b.dataset.year));
   root.innerHTML=render(m,state);
   const focus=state||previous;
   if(focus)root.querySelector('button[data-id="'+focus.id+'"][data-year="'+(focus.year??'')+'"]')?.focus({preventScroll:true});
  });
  document.getElementById('collapse-all').addEventListener('click',()=>{state=null;root.innerHTML=render(m,state);});
 }).catch(e=>{document.getElementById('compare-status').textContent='年度表暂未显示：'+e.message;});
})();
