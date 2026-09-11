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
   const children=orderedChildren([...years].sort((a,b)=>b-a).map(y=>(entries[y]?.details||[]).map(e=>e.label)));
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
  let h='<div class="table-wrap"><table class="year-activities" style="width:'+width+'px;min-width:'+width+'px"><caption>资本活动表 <small>全年发生额 · '+esc(m.currency)+' 亿元</small></caption><colgroup>'+col(200)+years.map(y=>col(110)+(open.has(y)?col(440)+col(100):'')).join('')+'</colgroup><thead><tr><th rowspan="2">大项目</th>'+years.map(y=>'<th colspan="'+(open.has(y)?3:1)+'">'+yearButton('capital',y,open,y+' 全年')+'</th>').join('')+'</tr><tr>'+years.map(y=>'<th aria-label="年度合计金额"></th>'+(open.has(y)?'<th>子项目</th><th>金额</th>':'')).join('')+'</tr></thead><tbody>';
  for(const [block,label,totalKey,totalLabel] of [['wealth',registry?.table_sections?.wealth||'净资产形成','equityChange',registry?.derived?.['controls.equity.change']||'净资产增加'],['liquidity',registry?.table_sections?.liquidity||'资金收付与配置','cashChange',registry?.derived?.['controls.cash.change']||'现金与存款增加']]){
   h+='<tr class="group"><th colspan="'+columns+'">'+label+'</th></tr>';
   annual[years[years.length-1]][block].forEach((g,gi)=>{
    const concrete=y=>{
     const rows=annual[y][block][gi].rows,result=[];
     for(const row of rows){
      if(row.subtotal){result.push({key:'derived:'+row.label,label:row.label,amount:row.amount,status:row.status,subtotal:true,details:[]});continue;}
      if(row.details?.length){
       const grouped=new Map();
       for(const detail of row.details){
        const key=detail.display_field||detail.label;
        if(!grouped.has(key))grouped.set(key,{key,label:detail.label,amount:0,status:detail.status,details:[]});
        const item=grouped.get(key);item.details.push(detail);
        item.amount=detail.amount===null||detail.amount===undefined||item.amount===null?null:item.amount+detail.amount;
        if(detail.status==='estimated')item.status='estimated';
       }
       result.push(...grouped.values().map(item=>({...item,details:[]})));
      }else result.push({key:'bucket:'+(row.key||row.label),label:row.label,amount:row.amount,status:row.status,details:[]});
     }
     return result;
    };
    const canonical=orderedChildren([...years].map(y=>concrete(y).map(r=>r.key)));
    const keys=open.size?union([...open].map(y=>concrete(y).map(r=>r.key)),canonical):[null];
    const rows=open.size?alignedRows(keys,key=>Object.fromEntries([...open].map(y=>[y,concrete(y).find(r=>r.key===key)])),[...open],'capital:'+block+':'+gi,detailState):[{entries:{},kind:'parent'}];
    rows.forEach((row,i)=>{
     const subtotal=row.kind==='parent'&&Object.values(row.entries).some(e=>e?.subtotal);
     h+='<tr class="'+(subtotal?'activity-subtotal':row.kind==='child'?'aligned-subfield':'object-row')+'">';
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
  const fallback=typeof module!=='undefined'?require('../berun-assets/fields.js'):{assetSets,movementGroups};
  const buckets=m.displayRegistry?.calculation_buckets||m.displayRegistry?.assets||Object.fromEntries(fallback.assetSets.map(([group,,fields])=>[group,fields]));
  const bucketLabels=Object.fromEntries(Object.values(buckets).flat());
  const defaultSections=[['operating_working','经营周转资本',['working']],['operating_long_term','长期经营资产',['facilities','rights','capital_settlement','goodwill']],['operating_other','其他经营资产与义务',['other_operating']],['nonoperating_assets','非经营资产',['cash','investments','other_assets']],['nonoperating_liabilities','非经营负债',['financing','shareholder','other_liabilities']]];
  const sections=m.displayRegistry?.asset_sections||defaultSections;
  const componentDefs=m.displayRegistry?.components||{};
  const sum=xs=>xs.some(x=>x===null||x===undefined)?null:xs.reduce((a,b)=>a+b,0);
  const record=(y,key,side)=>m.series[y].records[`assets.${key}.${side}`];
  const value=(y,key,side)=>record(y,key,side)?.amount??null;
  let h='<div class="table-wrap"><table class="year-assets" style="width:'+width+'px;min-width:'+width+'px"><caption>资本表 <small>年末余额 · '+esc(m.currency)+' 亿元</small></caption><colgroup>'+col(230)+col(100)+years.map(y=>(open.has(y)?col(320)+col(100):'')+col(100)).join('')+'</colgroup><thead><tr><th rowspan="2">资产／负债项目</th><th rowspan="2">'+(first-1)+' 年末</th>'+years.map(y=>(open.has(y)?'<th colspan="2">'+y+' 年变动</th>':'')+'<th rowspan="2">'+y+' 年末'+yearButton('assets',y,open,y+' 年变动')+'</th>').join('')+'</tr><tr>'+years.filter(y=>open.has(y)).map(()=>'<th>项目</th><th>金额</th>').join('')+'</tr></thead><tbody>';
  const total=(label,get,cls='total')=>'<tr class="'+cls+'"><th>'+esc(label)+'</th>'+amount(get(first,'opening'))+years.map(y=>{const a=get(y,'opening'),b=get(y,'closing');return(open.has(y)?'<td>净变动</td>'+amount(a===null||b===null?null:b-a):'')+amount(b);}).join('')+'</tr>';
  const componentKey=e=>e.display_field||e.label;
  const componentLabel=(bucket,id)=>{
   if(id==='__bucket__')return bucketLabels[bucket];
   const registered=Object.fromEntries(componentDefs['assets.'+bucket]||[])[id];
   if(registered)return registered;
   for(const [,y,side] of [[first-1,first,'opening'],...years.map(y=>[y,y,'closing'])]){
    const found=(record(y,bucket,side)?.details||[]).find(e=>componentKey(e)===id);if(found)return found.label+(found.custom?'（扩展）':'');
   }
   return id;
  };
  const componentValue=(y,bucket,side,id)=>{
   if(id==='__bucket__')return value(y,bucket,side);
   const parts=(record(y,bucket,side)?.details||[]).filter(e=>componentKey(e)===id);
   if(!parts.length)return record(y,bucket,side)?.amount===null?null:0;
   return sum(parts.map(e=>e.amount));
  };
  for(const [,title,sectionBuckets] of sections){
   h+='<tr class="group"><th colspan="'+count+'">'+esc(title)+'</th></tr>';
   for(const bucket of sectionBuckets){
    const boundaries=[[first-1,first,'opening'],...years.map(y=>[y,y,'closing'])];
    const declared=(componentDefs['assets.'+bucket]||[]).map(([id])=>id);
    const used=boundaries.flatMap(([,y,side])=>(record(y,bucket,side)?.details||[]).map(componentKey));
    const comps=used.length?union([used],declared).filter(id=>used.includes(id)):['__bucket__'];
    for(const id of comps){
     h+='<tr><th class="item">'+esc(componentLabel(bucket,id))+'</th>'+amount(componentValue(first,bucket,'opening',id));
     for(const y of years){
      const a=componentValue(y,bucket,'opening',id),b=componentValue(y,bucket,'closing',id);
      if(open.has(y))h+='<td>余额变化</td>'+amount(a===null||b===null?null:b-a);
      h+=amount(b);
     }
     h+='</tr>';
    }
   }
   const sectionFields=sectionBuckets.map(bucket=>[bucket,bucketLabels[bucket]]);
   h+=total(title+'合计',(y,side)=>sum(sectionFields.map(([key])=>value(y,key,side))));
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
  return '<div class="table-wrap"><table class="year-anomalies"><tbody><tr><th>重要异常与一次性事项</th>'+m.years.map(y=>{const d=m.series[y],notes=visibleAnomalies(d),boundary=m.boundaryWarnings.filter(w=>w.year===y&&materialRatio(w.opening-w.previous,[w.previous,w.opening])>=0.03);const count=notes.length+boundary.length;return '<td><details><summary>'+y+' · '+count+' 项</summary>'+notes.map(n=>'<p><strong>'+esc(n.title)+'</strong> '+esc(n.explanation)+'</p>').join('')+boundary.map(b=>'<p>相邻年度期末／期初不一致：'+esc(b.field)+'，前期 '+fmt(b.previous)+'，本期期初 '+fmt(b.opening)+'。本页保留原值。</p>').join('')+'</details></td>';}).join('')+'</tr></tbody></table></div>';
 }
function evidence(m){
  return '<details class="page-notes"><summary>口径、来源与数据限制</summary>'+m.years.map(y=>{const d=m.series[y];
   const facts=['capital-statement-v2','capital-statement-v3'].includes(d.schema)?'<details><summary>原始事实与映射 · '+Object.keys(d.facts).length+' 项</summary>'+d.mappings.map(mapping=>{const fact=d.facts[mapping.fact_id]||{};return '<p><strong>'+esc(fact.label||mapping.fact_id)+'</strong> 来源 '+(fact.source_amount===null||fact.source_amount===undefined?'缺失':fmt(fact.source_amount))+' → '+esc(mapping.field)+(mapping.display_field?' / '+esc(mapping.display_field):'')+' '+(mapping.amount===null||mapping.amount===undefined?'缺失':fmt(mapping.amount))+' · '+esc(fact.source_id||'')+' p.'+esc(fact.page||'')+(fact.calculation?' · '+esc(fact.calculation):'')+' · '+esc(mapping.rationale||'')+'</p>';}).join('')+'</details>':'';
   return '<details><summary>'+y+' 年</summary>'+d.sources.map(s=>'<p>'+esc(s.basis)+' · '+esc(s.url)+'</p>').join('')+facts+Object.entries(d.records).map(([key,r])=>'<p><strong>'+esc(key)+'</strong> '+esc(r.status)+' · '+esc(r.basis)+'</p>').join('')+(d.validation?.warnings||[]).map(w=>'<p>'+esc(w.code)+' · '+esc(w.check||w.field||'')+(w.difference!==undefined?' · 差额 '+fmt(w.difference):w.amount!==undefined?' · 差额 '+fmt(w.amount):'')+'</p>').join('')+'</details>';}).join('')+'</details>';
}
 function render(m,state={}){return '<div class="simple-view multi-fold">'+(m.series?protocolAssets(m,state.assets,state.details||{},state.components||{}):assetTable(m.assets,m.groups,m.years,state.assets,state.details||{},m.currency))+activityTable(m,state.capital,state.details||{})+(m.series?anomalyTable(m)+evidence(m):'')+'</div>';}
 function toggle(state,table,year){if(!['assets','capital'].includes(table)||!Number.isInteger(year)||year<1900||year>2200)return state;const selected=expanded(state[table]);selected.has(year)?selected.delete(year):selected.add(year);const years=[...selected].sort();return {...state,assets:years,capital:[...years]};}
 function toggleField(state,key){return {...state,details:{...state.details,[key]:!state.details?.[key]}};}
 function toggleComponent(state,key){return {...state,components:{...state.components,[key]:!state.components?.[key]}};}
 if(typeof module!=='undefined')module.exports={render,toggle,union,toggleField,toggleComponent,fieldId};else globalThis.TanMultiView={render,toggle,toggleField,toggleComponent};
})();
