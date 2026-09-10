(function(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
 const signed=n=>(n>0?'+':'')+fmt(n);
 const col=w=>'<col style="width:'+w+'px">';
 const expanded=v=>new Set(Array.isArray(v)?v:v?[v]:[]);
 const union=(lists,order=[])=>{const keys=new Set(lists.flat());return [...order.filter(k=>keys.delete(k)),...keys];};
 const amount=(v,span=1)=>'<td class="amount"'+(span>1?' rowspan="'+span+'"':'')+'>'+(v===null||v===undefined?'缺失':fmt(v))+'</td>';
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
  return '<td class="detail">'+label+'</td>'+amount(entry.amount);
 }
 function assetTable(assets,groups,years,open,detailState){
  open=expanded(open);const missing=open.has(2024),columns=2+years.length+open.size*2;
  const width=330+years.length*100+open.size*420;
  let h='<div class="table-wrap"><table class="year-assets" style="width:'+width+'px;min-width:'+width+'px"><caption>资本表 <small>年末余额 · 人民币亿元</small></caption><colgroup>'+col(230)+col(100)+years.map(y=>(open.has(y)?col(320)+col(100):'')+col(100)).join('')+'</colgroup><thead><tr><th rowspan="2">资产／负债项目</th>'+'<th rowspan="2"><span class="balance-label">2023 年末</span><small class="missing">未转录</small></th>'+years.map(y=>(open.has(y)?'<th colspan="2">'+y+' 年变动</th>':'')+'<th rowspan="2"><span class="balance-label">'+y+' 年末</span>'+yearButton('assets',y,open,y+' 年变动')+'</th>').join('')+'</tr><tr>'+years.filter(y=>open.has(y)).map(()=>'<th>项目</th><th>金额</th>').join('')+'</tr></thead><tbody>';
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
 function activityTable(annual,years,open,detailState){
  open=expanded(open);const columns=1+years.length+open.size*2,width=200+years.length*110+open.size*540;
  let h='<div class="table-wrap"><table class="year-activities" style="width:'+width+'px;min-width:'+width+'px"><caption>资本活动表 <small>全年发生额 · 人民币亿元</small></caption><colgroup>'+col(200)+years.map(y=>col(110)+(open.has(y)?col(440)+col(100):'')).join('')+'</colgroup><thead><tr><th rowspan="2">大项目</th>'+years.map(y=>'<th colspan="'+(open.has(y)?3:1)+'">'+yearButton('capital',y,open,y+' 全年')+'</th>').join('')+'</tr><tr>'+years.map(y=>'<th>净贡献／净收付</th>'+(open.has(y)?'<th>子项目</th><th>金额</th>':'')).join('')+'</tr></thead><tbody>';
  for(const [block,label,totalKey,totalLabel] of [['wealth','净资产形成','equityChange','净资产增加'],['liquidity','资金收付与配置','cashChange','现金与存款增加']]){
   h+='<tr class="group"><th colspan="'+columns+'">'+label+'</th></tr>';
   annual[2025][block].forEach((g,gi)=>{
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
  h+='<tr><th>非现金资本配置</th>'+years.map(y=>amount(annual[y].noncash)+(open.has(y)?'<td colspan="2">新增租赁：经营设施与融资负债同时增加，不计入以上汇总。</td>':'')).join('')+'</tr>';
  return h+'</tbody></table></div>';
 }
 function render(m,state={}){return '<div class="simple-view multi-fold">'+assetTable(m.assets,m.groups,m.years,state.assets,state.details||{})+activityTable(m.annual,m.years,state.capital,state.details||{})+'</div>';}
 function toggle(state,table,year){if(!['assets','capital'].includes(table)||![2024,2025].includes(year))return state;const selected=expanded(state[table]);selected.has(year)?selected.delete(year):selected.add(year);const years=[...selected].sort();return {...state,assets:years,capital:[...years]};}
 function toggleField(state,key){return {...state,details:{...state.details,[key]:!state.details?.[key]}};}
 if(typeof module!=='undefined')module.exports={render,toggle,union,toggleField,fieldId};else globalThis.TanMultiView={render,toggle,toggleField};
})();
