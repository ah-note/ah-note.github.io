(function(){
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
 const signed=n=>(n>0?'+':'')+fmt(n);
 const col=w=>'<col style="width:'+w+'px">';
 const amount=(v,span=1)=>'<td class="amount"'+(span>1?' rowspan="'+span+'"':'')+'>'+fmt(v)+'</td>';
 const yearButton=(table,year,open)=>'<button type="button" data-table="'+table+'" data-year="'+year+'" aria-expanded="'+(open===year)+'">'+year+(open===year?' ▾':' ▸')+'</button>';
 const raw=items=>items.map(e=>'<div class="raw-line"><span>'+esc(e.label)+'</span><b>'+signed(e.amount)+'</b></div>').join('');
 function assetTable(assets,groups,years,open){
  const missing=open===2024,columns=1+years.length+(open?2:0)+(missing?1:0);
  const width=230+years.length*100+(open?420:0)+(missing?100:0);
  let h='<div class="table-wrap"><table class="year-assets" style="width:'+width+'px;min-width:'+width+'px"><caption>资本表 <small>年末余额 · 人民币亿元</small></caption><colgroup>'+col(230)+(missing?col(100):'')+years.map(y=>(y===open?col(320)+col(100):'')+col(100)).join('')+'</colgroup><thead><tr><th rowspan="2">资产／负债项目</th>'+(missing?'<th rowspan="2">2023 年末</th>':'')+years.map(y=>(y===open?'<th colspan="2">'+y+' 年变动</th>':'')+'<th rowspan="2">'+yearButton('assets',y,open)+' 年末</th>').join('')+'</tr><tr>'+(open?'<th>项目</th><th>金额</th>':'')+'</tr></thead><tbody>';
  const total=(label,values,cls='total')=>'<tr class="'+cls+'"><th>'+label+'</th>'+(missing?'<td class="missing">—</td>':'')+years.map((y,i)=>(y===open?'<td>净变动</td><td class="amount">'+(missing?'未转录':signed(values[1]-values[0]))+'</td>':'')+amount(values[i])).join('')+'</tr>';
  for(const g of groups){
   h+='<tr class="group"><th colspan="'+columns+'">'+esc(g.title)+'</th></tr>';
   for(const r of g.rows){
    const changes=open===2025?r.changes.filter(c=>c.amount!==0||c.details.some(e=>e.amount!==0)):[];
    if(open&&!changes.length)changes.push({label:missing?'未转录':'无变动',amount:0,details:[]});
    const rows=open?changes.length+1:1;
    const parts=r.components.flatMap(c=>c.breakdown||[c]);
    const label='<details><summary>'+esc(r.label+r.marker)+'</summary><table class="components"><thead><tr><th>构成</th><th>2024</th><th>2025</th></tr></thead><tbody>'+parts.map(c=>'<tr><th>'+esc(c.label)+'</th>'+amount(c.start)+amount(c.end)+'</tr>').join('')+'</tbody></table></details>';
    for(let i=0;i<rows;i++){
     h+='<tr'+(open&&i===rows-1?' class="subtotal"':'')+'>';
     if(i===0)h+='<th class="item" rowspan="'+rows+'">'+label+'</th>'+(missing?'<td class="missing" rowspan="'+rows+'">—</td>':'');
     years.forEach((y,j)=>{
      if(y===open){
       if(i===rows-1)h+='<td>变动合计</td><td class="amount">'+(missing?'未转录':signed(r.end-r.start))+'</td>';
       else{const c=changes[i];h+='<td class="detail">'+(c.details.length?'<details><summary>'+esc(c.label)+'</summary>'+raw(c.details)+'</details>':esc(c.label))+'</td><td class="amount">'+(missing?'—':signed(c.amount))+'</td>';}
      }
      if(i===0)h+=amount(j===0?r.start:r.end,rows);
     });h+='</tr>';
    }
   }h+=total(g.title+'合计',assets.totals[g.key]);
  }
  h+=total('合并净资产',assets.totals.net,'final')+total('减：少数股东权益',assets.totals.minority)+total('归母净资产',assets.totals.parent,'final parent');
  return h+'</tbody></table></div>'+(missing?'<p class="muted">2023 年末余额和2024年逐项资产变动未转录，未填零。</p>':'');
 }
 function activityTable(annual,years,open){
  const columns=1+years.length+(open?2:0),width=200+years.length*110+(open?540:0);
  let h='<div class="table-wrap"><table class="year-activities" style="width:'+width+'px;min-width:'+width+'px"><caption>资本活动表 <small>全年发生额 · 人民币亿元</small></caption><colgroup>'+col(200)+years.map(y=>col(110)+(y===open?col(440)+col(100):'')).join('')+'</colgroup><thead><tr><th rowspan="2">大项目</th>'+years.map(y=>'<th colspan="'+(y===open?3:1)+'">'+yearButton('capital',y,open)+'</th>').join('')+'</tr><tr>'+years.map(y=>'<th>净贡献／净收付</th>'+(y===open?'<th>子项目</th><th>金额</th>':'')).join('')+'</tr></thead><tbody>';
  for(const [block,label,totalKey,totalLabel] of [['wealth','净资产形成','equityChange','净资产增加'],['liquidity','资金收付与配置','cashChange','现金与存款增加']]){
   h+='<tr class="group"><th colspan="'+columns+'">'+label+'</th></tr>';
   annual[2025][block].forEach((g,gi)=>{
    const rows=open?annual[open][block][gi].rows:[null];
    rows.forEach((r,i)=>{
     h+='<tr class="'+(r?.subtotal?'activity-subtotal':'')+'">';
     if(i===0)h+='<th class="item" rowspan="'+rows.length+'">'+esc(g.label)+'</th>';
     years.forEach(y=>{
      if(i===0)h+=amount(annual[y][block][gi].amount,rows.length);
      if(y===open)h+='<td class="detail">'+(r.details.length?'<details><summary>'+esc(r.label)+'</summary>'+raw(r.details)+'</details>':esc(r.label))+'</td>'+amount(r.amount);
     });h+='</tr>';
    });
   });
   h+='<tr class="final"><th>'+totalLabel+'</th>'+years.map(y=>amount(annual[y][totalKey])+(y===open?'<td colspan="2">对应资本表的年度变化</td>':'')).join('')+'</tr>';
  }
  h+='<tr><th>非现金资本配置</th>'+years.map(y=>amount(annual[y].noncash)+(y===open?'<td colspan="2">新增租赁：经营设施与融资负债同时增加，不计入以上汇总。</td>':'')).join('')+'</tr>';
  return h+'</tbody></table></div>';
 }
 function render(m,state={}){return '<div class="simple-view multi-fold">'+assetTable(m.assets,m.groups,m.years,state.assets)+activityTable(m.annual,m.years,state.capital)+'</div>';}
 function toggle(state,table,year){if(!['assets','capital'].includes(table)||![2024,2025].includes(year))return state;const active=state.assets===year&&state.capital===year?null:year;return {assets:active,capital:active};}
 if(typeof module!=='undefined')module.exports={render,toggle};else globalThis.TanMultiView={render,toggle};
})();
