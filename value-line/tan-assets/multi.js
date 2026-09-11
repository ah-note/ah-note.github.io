(function(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
 const signed=n=>(n>0?'+':'')+fmt(n);
 const col=w=>'<col style="width:'+w+'px">';
 const expanded=v=>new Set(Array.isArray(v)?v:v?[v]:[]);
 const union=(lists,order=[])=>{const keys=new Set(lists.flat());return [...order.filter(k=>keys.delete(k)),...keys];};
 const amount=(v,span=1,status='',basis='')=>'<td class="amount"'+(span>1?' rowspan="'+span+'"':'')+(basis?' title="'+esc(basis)+'"':'')+'>'+(v===null||v===undefined?'缺失':fmt(v)+(status==='estimated'?'²':''))+'</td>';
 const yearButton=(table,year,open,label=String(year))=>'<button type="button" data-table="'+table+'" data-year="'+year+'" aria-expanded="'+(open.has(year))+'">'+esc(label)+(open.has(year)?' ▾':' ▸')+'</button>';
 const fieldId=(...parts)=>parts.map(encodeURIComponent).join(':');
 // Merge the declared subfield sequences, keeping shared ordering constraints.
 function orderedChildren(lists){
  const pending=new Set(lists.flat()),edges=new Map([...pending].map(k=>[k,new Set()])),result=[];
  for(const list of lists)for(let i=1;i<list.length;i++)if(list[i-1]!==list[i])edges.get(list[i-1]).add(list[i]);
  while(pending.size){
   const ready=[...pending].filter(k=>![...pending].some(p=>edges.get(p).has(k)));
   const key=(ready.length?ready:[...pending]).sort((a,b)=>a.localeCompare(b,'zh-CN'))[0];
   result.push(key);pending.delete(key);
  }
  return result;
 }
 function alignedRows(keys,entriesForKey,years,prefix,detailState){
  return keys.flatMap(key=>{
   const entries=entriesForKey(key),id=fieldId(prefix,key);
   const children=orderedChildren([...years].sort((a,b)=>String(b).localeCompare(String(a))).map(y=>(entries[y]?.details||[]).map(e=>e.label)));
   const parent={entries,id,children,open:Boolean(detailState[id]),kind:'parent'};
   return [parent,...(parent.open?children.map(child=>({...parent,kind:'child',child})):[])];
  });
 }
 function entryCells(row,year){
  const entry=row.entries[year];
  if(entry===null)return '<td class="missing">数据未取得</td><td class="missing">缺失</td>';
  if(!entry)return '<td></td><td></td>';
  if(row.kind==='child'){
   const items=(entry.details||[]).filter(e=>e.label===row.child);
   if(!items.length)return '<td></td><td></td>';
   const value=items.some(e=>e.amount===null||e.amount===undefined)?null:items.reduce((s,e)=>s+e.amount,0);
   return '<td class="subfield">'+esc(row.child)+'</td>'+amount(value);
  }
  const label=row.children.length?'<button type="button" class="detail-toggle" data-field="'+row.id+'" data-year="'+year+'" aria-expanded="'+row.open+'">'+(row.open?'▾ ':'▸ ')+esc(entry.label)+'</button>':esc(entry.label);
  return '<td class="detail" title="'+esc(entry.basis||'')+'">'+label+(entry.status==='estimated'?' · 估计':'')+'</td>'+amount(entry.amount);
 }
 function assetTable(assets,groups,years,open,detailState,currency='CNY'){
  open=expanded(open);const missing=open.has(2024),columns=2+years.length+open.size*2;
  const width=330+years.length*100+open.size*420;
  let h='<div class="table-wrap"><table class="year-assets" style="width:'+width+'px;min-width:'+width+'px"><caption>资本表 <small>年末余额 · '+esc(currency)+' 亿元</small></caption><colgroup>'+col(230)+col(100)+years.map(y=>(open.has(y)?col(320)+col(100):'')+col(100)).join('')+'</colgroup><thead><tr><th rowspan="2">资产／负债项目</th>'+'<th rowspan="2"><span class="balance-label">2023 年末</span><small class="missing">未转录</small></th>'+years.map(y=>(open.has(y)?'<th colspan="2">'+y+' 年变动</th>':'')+'<th rowspan="2"><span class="balance-label">'+y+' 年末</span>'+yearButton('assets',y,open,y+' 年变动')+'</th>').join('')+'</tr><tr>'+years.filter(y=>open.has(y)).map(()=>'<th>项目</th><th>金额</th>').join('')+'</tr></thead><tbody>';
  const total=(label,values,cls='total')=>'<tr class="'+cls+'"><th>'+label+'</th>'+'<td class="missing">未转录</td>'+years.map((y,i)=>(open.has(y)?'<td>净变动</td><td class="amount">'+(y===2024?'缺失':signed(values[1]-values[0]))+'</td>':'')+amount(values[i])).join('')+'</tr>';
  for(const g of groups){
   h+='<tr class="group"><th colspan="'+columns+'">'+esc(g.title)+'</th></tr>';
   for(const r of g.rows){
    const byYear=Object.fromEntries(years.map(y=>[y,r.changesByYear?.[y]??(y===2025?r.changes:null)]));
    const order=typeof module!=='undefined'?Object.keys(require('../berun-assets/fields.js').movementGroups):Object.keys(movementGroups);
    let keys=union([...open].map(y=>(byYear[y]||[]).map(c=>c.code)),order);
    if(open.size&&!keys.length)keys=['none'];
    const plan=open.size?alignedRows(keys,key=>Object.fromEntries([...open].map(y=>[y,byYear[y]===null?null:byYear[y].find(c=>c.code===key)||(key==='none'?{label:'无变动',amount:0,details:[]}:undefined)])),[...open],'assets:'+r.key,detailState):[];
    const rows=open.size?plan.length+1:1;
    const parts=r.components.flatMap(c=>c.breakdown||[c]);
    const label='<details><summary>'+esc(r.label+r.marker)+'</summary><table class="components"><thead><tr><th>构成</th><th>2024</th><th>2025</th></tr></thead><tbody>'+parts.map(c=>'<tr><th>'+esc(c.label)+'</th>'+amount(c.start)+amount(c.end)+'</tr>').join('')+'</tbody></table></details>';
    for(let i=0;i<rows;i++){
     h+='<tr'+(open.size&&i===rows-1?' class="subtotal"':plan[i]?.kind==='child'?' class="aligned-subfield"':'')+'>';
     if(i===0)h+='<th class="item" rowspan="'+rows+'">'+label+'</th>'+'<td class="missing" rowspan="'+rows+'">未转录</td>';
     years.forEach((y,j)=>{
      if(open.has(y)){
       if(i===rows-1)h+='<td>变动合计</td><td class="amount">'+(byYear[y]===null?'缺失':signed(byYear[y].reduce((v,c)=>v+c.amount,0)))+'</td>';
       else h+=entryCells(plan[i],y);
      }
      if(i===0)h+=amount(j===0?r.start:r.end,rows);
     });h+='</tr>';
    }
   }h+=total(g.title+'合计',assets.totals[g.key]);
  }
  h+=total('合并净资产',assets.totals.net,'final')+total('减：少数股东权益',assets.totals.minority)+total('归母净资产',assets.totals.parent,'final parent');
  return h+'</tbody></table></div>'+(missing?'<p class="muted">2023 年末余额和2024年逐项资产变动未转录，未填零。</p>':'');
 }
 function activityTable(m,open,detailState){
  const annual=m.annual,years=m.years,registry=m.displayRegistry;
  open=expanded(open);const columns=1+years.length+open.size*2,width=200+years.length*110+open.size*540;
  let h='<div class="table-wrap"><table class="year-activities" style="width:'+width+'px;min-width:'+width+'px"><caption>资本活动表 <small>期间发生额 · '+esc(m.currency)+' 亿元</small></caption><colgroup>'+col(200)+years.map(y=>col(110)+(open.has(y)?col(440)+col(100):'')).join('')+'</colgroup><thead><tr><th rowspan="2">大项目</th>'+years.map(y=>'<th colspan="'+(open.has(y)?3:1)+'">'+yearButton('capital',y,open,Number.isInteger(y)?y+' 全年':y)+'</th>').join('')+'</tr><tr>'+years.map(y=>'<th aria-label="期间合计金额"></th>'+(open.has(y)?'<th>子项目</th><th>金额</th>':'')).join('')+'</tr></thead><tbody>';
  for(const [block,label,totalKey,totalLabel] of [['wealth',registry?.table_sections?.wealth||'净资产形成','equityChange',registry?.derived?.['controls.equity.change']||'净资产增加'],['liquidity',registry?.table_sections?.liquidity||'资金收付与配置','cashChange',registry?.derived?.['controls.cash.change']||'现金与存款增加']]){
   h+='<tr class="group"><th colspan="'+columns+'">'+label+'</th></tr>';
   annual[years[years.length-1]][block].forEach((g,gi)=>{
    const canonical=union([...years].reverse().map(y=>annual[y][block][gi].rows.map(r=>r.label)));
    const keys=open.size?union([...open].map(y=>annual[y][block][gi].rows.map(r=>r.label)),canonical):[null];
    const rows=open.size?alignedRows(keys,key=>Object.fromEntries([...open].map(y=>[y,annual[y][block][gi].rows.find(r=>r.label===key)])),[...open],'capital:'+block+':'+gi,detailState):[{entries:{},kind:'parent'}];
    rows.forEach((row,i)=>{
     const subtotal=row.kind==='parent'&&Object.values(row.entries).some(e=>e?.subtotal);
     h+='<tr class="'+(subtotal?'activity-subtotal':row.kind==='child'?'aligned-subfield':'')+'">';
     if(i===0)h+='<th class="item" rowspan="'+rows.length+'">'+esc(g.label)+'</th>';
     years.forEach(y=>{
      if(i===0)h+=amount(annual[y][block][gi].amount,rows.length);
      if(open.has(y)){
       h+=entryCells(row,y);
      }
     });h+='</tr>';
    });
   });
   h+='<tr class="final"><th>'+totalLabel+'</th>'+years.map(y=>amount(annual[y][totalKey])+(open.has(y)?'<td colspan="2">对应资本表的年度变化</td>':'')).join('')+'</tr>';
  }
  h+='<tr><th>'+(registry?.derived?.['noncash.leases']||'非现金资本配置')+'</th>'+years.map(y=>amount(annual[y].noncash)+(open.has(y)?'<td colspan="2">新增租赁：经营设施与融资负债同时增加，不计入以上汇总。</td>':'')).join('')+'</tr>';
  return h+'</tbody></table></div>';
 }
 function protocolAssets(m,selected,details,componentState){
  const years=m.years,open=expanded(selected),first=years[0],count=2+years.length+open.size*2,width=330+years.length*100+open.size*420;
  componentState=componentState||{};
  const fallback=typeof module!=='undefined'?require('../berun-assets/fields.js'):{assetSets,movementGroups};
  const dictionary=m.displayRegistry?{assetSets:Object.entries(m.displayRegistry.assets).map(([key,fields])=>[key,m.displayRegistry.asset_groups[key],fields]),movementGroups:m.displayRegistry.movements}:fallback;
  const sum=xs=>xs.some(x=>x===null||x===undefined)?null:xs.reduce((a,b)=>a+b,0);
  const record=(y,key,side)=>m.series[y].records[`assets.${key}.${side}`];
  const value=(y,key,side)=>record(y,key,side)?.amount??null;
  const priorDate=new Date(m.series[first].period_start+'T00:00:00Z');priorDate.setUTCDate(priorDate.getUTCDate()-1);const openingDate=priorDate.toISOString().slice(0,10);
  let h='<div class="table-wrap"><table class="year-assets" style="width:'+width+'px;min-width:'+width+'px"><caption>资本表 <small>期末余额 · '+esc(m.currency)+' 亿元</small></caption><colgroup>'+col(230)+col(100)+years.map(y=>(open.has(y)?col(320)+col(100):'')+col(100)).join('')+'</colgroup><thead><tr><th rowspan="2">资产／负债项目</th><th rowspan="2">'+openingDate+'</th>'+years.map(y=>(open.has(y)?'<th colspan="2">截至 '+y+' 的期间变动</th>':'')+'<th rowspan="2">'+y+yearButton('assets',y,open,'变动')+'</th>').join('')+'</tr><tr>'+years.filter(y=>open.has(y)).map(()=>'<th>项目</th><th>金额</th>').join('')+'</tr></thead><tbody>';
  const total=(label,get,cls='total')=>'<tr class="'+cls+'"><th>'+esc(label)+'</th>'+amount(get(first,'opening'))+years.map(y=>{const a=get(y,'opening'),b=get(y,'closing');return(open.has(y)?'<td>净变动</td>'+amount(a===null||b===null?null:b-a):'')+amount(b);}).join('')+'</tr>';
  for(const [group,title,fields] of dictionary.assetSets){
   h+='<tr class="group"><th colspan="'+count+'">'+esc(title)+'</th></tr>';
   for(const [key,label] of fields){
    const byYear=Object.fromEntries(years.map(y=>{
     const entries=m.series[y].movements[key];if(!entries)return [y,null];
     if(entries.length&&entries.every(e=>e.amount===0))return [y,[{code:'none',label:'无变动',amount:0,details:[]}]];
     const cats=union([entries.map(e=>e.category)],Object.keys(dictionary.movementGroups));
     return [y,cats.map(code=>{const parts=entries.filter(e=>e.category===code);return {code,label:dictionary.movementGroups[code]||code,amount:sum(parts.map(e=>e.amount)),details:['capital-statement-v3','capital-statement-v4','capital-statement-v5'].includes(m.series[y].schema)?[]:parts.map(e=>({label:e.label,amount:e.amount,basis:e.basis}))};})];
    }));
    const keys=union([...open].map(y=>(byYear[y]||[]).map(e=>e.code)),Object.keys(dictionary.movementGroups));
    if(open.size&&!keys.length)keys.push('unresolved');
    const plan=open.size?alignedRows(keys,k=>Object.fromEntries([...open].map(y=>[y,byYear[y]===null?null:byYear[y].find(e=>e.code===k)])),[...open],'assets:'+key,details):[];
    const rows=open.size?plan.length+1:1;
    const boundaries=[[first-1,first,'opening'],...years.map(y=>[y,y,'closing'])];
    const componentKey=e=>e.display_field||e.label;
    const comps=orderedChildren(boundaries.map(([,y,side])=>(record(y,key,side)?.details||[]).map(componentKey)));
    const componentLabelFor=id=>{for(const [,y,side] of boundaries){const found=(record(y,key,side)?.details||[]).find(e=>componentKey(e)===id);if(found)return found.label+(found.custom?'（扩展）':'');}return id;};
    const componentId=fieldId('components',key),componentsOpen=Boolean(componentState[componentId]);
    const componentLabel=comps.length?'<button type="button" class="component-toggle" data-component="'+componentId+'" aria-expanded="'+componentsOpen+'">'+(componentsOpen?'▾ ':'▸ ')+esc(label)+'</button>':esc(label);
    const componentAmount=(y,side,name)=>{const found=record(y,key,side)?.details?.filter(e=>componentKey(e)===name)||[];return found.length?amount(sum(found.map(e=>e.amount))):'<td></td>';};
    for(let i=0;i<rows;i++){
     h+='<tr class="'+(i===rows-1&&open.size?'subtotal':plan[i]?.kind==='child'?'aligned-subfield':'')+'">';
     if(!i)h+='<th class="item" rowspan="'+rows+'">'+componentLabel+'</th>'+amount(value(first,key,'opening'),rows,record(first,key,'opening')?.status,record(first,key,'opening')?.basis);
     for(const y of years){
      if(open.has(y))h+=i===rows-1?'<td>变动合计</td>'+amount(byYear[y]===null?null:sum(byYear[y].map(e=>e.amount))):entryCells(plan[i],y);
      if(!i)h+=amount(value(y,key,'closing'),rows,record(y,key,'closing')?.status,record(y,key,'closing')?.basis);
     }h+='</tr>';
    }
    if(componentsOpen)for(const name of comps){
     h+='<tr class="asset-component"><th class="subfield">'+esc(componentLabelFor(name))+'</th>'+componentAmount(first,'opening',name);
     for(const y of years){
      if(open.has(y))h+='<td colspan="2"></td>';
      h+=componentAmount(y,'closing',name);
     }
     h+='</tr>';
    }
   }
   h+=total(title+'合计',(y,side)=>sum(fields.map(([key])=>value(y,key,side))));
  }
  for(const [key,label] of [['equity','合并净资产'],['minority','减：少数股东权益'],['parent','归母净资产']])h+=total(label,(y,side)=>m.series[y].records[`controls.${key}.${side}`]?.amount??null,'final');
  return h+'</tbody></table></div>';
 }
 function materialRatio(amount,values){
  const scale=Math.max(0,...values.filter(Number.isFinite).map(Math.abs));
  return scale===0?Infinity:Math.abs(amount)/scale;
 }
 function visibleAnomalies(d){
  return (d.anomalies||[]).filter(note=>{
   if(!Number.isFinite(note.amount))return true;
   const values=(note.fields||[]).map(field=>d.records?.[field]?.amount);
   return !values.some(Number.isFinite)||materialRatio(note.amount,values)>=0.03;
  });
 }
 function anomalyTable(m){
  return '<div class="table-wrap"><table class="year-anomalies"><tbody><tr><th>重要异常与一次性事项</th>'+m.years.map(y=>{const d=m.series[y],notes=visibleAnomalies(d),boundary=m.boundaryWarnings.filter(w=>w.period_end===y&&materialRatio(w.opening-w.previous,[w.previous,w.opening])>=0.03);const count=notes.length+boundary.length;return '<td><details><summary>'+y+' · '+count+' 项</summary>'+notes.map(n=>'<p><strong>'+esc(n.title)+'</strong> '+esc(n.explanation)+'</p>').join('')+boundary.map(b=>'<p>相邻期间期末／期初不一致：'+esc(b.field)+'，前期 '+fmt(b.previous)+'，本期期初 '+fmt(b.opening)+'。本页保留原值。</p>').join('')+'</details></td>';}).join('')+'</tr></tbody></table></div>';
 }
function evidence(m){
  return '<details class="page-notes"><summary>口径、来源与数据限制</summary>'+m.years.map(y=>{const d=m.series[y];
   const facts=['capital-statement-v2','capital-statement-v3','capital-statement-v4','capital-statement-v5'].includes(d.schema)?'<details><summary>原始事实与映射 · '+Object.keys(d.facts).length+' 项</summary>'+d.mappings.map(mapping=>{const fact=d.facts[mapping.fact_id]||{};return '<p><strong>'+esc(fact.label||mapping.fact_id)+'</strong> 来源 '+(fact.source_amount===null||fact.source_amount===undefined?'缺失':fmt(fact.source_amount))+' → '+esc(mapping.field)+(mapping.display_field?' / '+esc(mapping.display_field):'')+' '+(mapping.amount===null||mapping.amount===undefined?'缺失':fmt(mapping.amount))+' · '+esc(fact.source_id||'')+' p.'+esc(fact.page||'')+(fact.calculation?' · '+esc(fact.calculation):'')+' · '+esc(mapping.rationale||'')+'</p>';}).join('')+'</details>':'';
   return '<details><summary>'+y+'</summary>'+d.sources.map(s=>'<p>'+esc(s.basis)+' · '+esc(s.url)+'</p>').join('')+facts+Object.entries(d.records).map(([key,r])=>'<p><strong>'+esc(key)+'</strong> '+esc(r.status)+' · '+esc(r.basis)+'</p>').join('')+(d.validation?.warnings||[]).map(w=>'<p>'+esc(w.code)+' · '+esc(w.check||w.field||'')+(w.difference!==undefined?' · 差额 '+fmt(w.difference):w.amount!==undefined?' · 差额 '+fmt(w.amount):'')+'</p>').join('')+'</details>';}).join('')+'</details>';
}
 function render(m,state={}){return '<div class="simple-view multi-fold">'+(m.series?protocolAssets(m,state.assets,state.details||{},state.components||{}):assetTable(m.assets,m.groups,m.years,state.assets,state.details||{},m.currency))+activityTable(m,state.capital,state.details||{})+(m.series?anomalyTable(m)+evidence(m):'')+'</div>';}
 function toggle(state,table,periodEnd){if(!['assets','capital'].includes(table)||!(Number.isInteger(periodEnd)||/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)))return state;const selected=expanded(state[table]);selected.has(periodEnd)?selected.delete(periodEnd):selected.add(periodEnd);const periods=[...selected].sort();return {...state,assets:periods,capital:[...periods]};}
 function toggleField(state,key){return {...state,details:{...state.details,[key]:!state.details?.[key]}};}
 function toggleComponent(state,key){return {...state,components:{...state.components,[key]:!state.components?.[key]}};}
 if(typeof module!=='undefined')module.exports={render,toggle,union,toggleField,toggleComponent,fieldId};else globalThis.TanMultiView={render,toggle,toggleField,toggleComponent};
})();
