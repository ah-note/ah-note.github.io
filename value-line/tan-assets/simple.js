(function(){
 const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function simpleView(year,assets,annual,mapper,assetRender,activityRender){
  if(!annual[year])throw Error('年度尚未提供');
  let body;
  if(year===2025)body=assetRender(assets,mapper);
  else if(year===2024){
   const row=(label,value,cls='')=>'<tr class="'+cls+'"><th>'+esc(label)+'</th><td class="amount missing">—</td><td class="missing">未转录</td><td class="amount missing">—</td><td class="amount closing">'+fmt(value)+'</td></tr>';
   body=mapper(assets).map(g=>'<tr class="group"><th colspan="5">'+esc(g.title)+'</th></tr>'+g.rows.map(r=>row(r.label+r.marker,r.start)).join('')+row(g.title+'合计',assets.totals[g.key][0],'total')).join('')+row('合并净资产',assets.totals.net[0],'final')+row('减：少数股东权益',assets.totals.minority[0],'total')+row('归母净资产',assets.totals.parent[0],'final parent');
  }else throw Error('资产年度尚未提供');
  return '<div class="simple-view">'+(year===2024?'<p class="muted">2024 年末余额和全年资本活动已提供；2023 年末余额及 2024 年逐项资产变动未转录，不能视为零。</p>':'')+'<div class="table-wrap"><table class="simple-assets"><colgroup><col style="width:230px"><col style="width:100px"><col style="width:320px"><col style="width:100px"><col style="width:100px"></colgroup><thead><tr><th rowspan="2">资产／负债项目</th><th rowspan="2">'+(year-1)+' 年末</th><th colspan="2">'+year+' 年变动</th><th rowspan="2">'+year+' 年末</th></tr><tr><th>项目</th><th>金额</th></tr></thead><tbody>'+body+'</tbody></table></div><div class="table-wrap"><table class="simple-activities"><caption>'+year+' 年资本活动</caption><colgroup><col style="width:200px"><col style="width:110px"><col style="width:440px"><col style="width:100px"></colgroup><thead><tr><th>大项目</th><th>净贡献／净收付</th><th>子项目</th><th>金额</th></tr></thead><tbody>'+activityRender(annual[year])+'</tbody></table></div></div>';
 }
 if(typeof module!=='undefined')module.exports={simpleView};else globalThis.TanSimpleView={simpleView};
})();
