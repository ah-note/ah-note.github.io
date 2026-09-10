const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=n=>(n>0?'+':'')+fmt(n);
const mapData=typeof module!=='undefined'?require('./mapping.js').standardize:standardize;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function detailHTML(items){
 const fields=new Map();
 for(const e of items){if(!fields.has(e.code))fields.set(e.code,{label:e.fieldLabel,amount:0,items:[]});const f=fields.get(e.code);f.amount+=e.amount;f.items.push(e);}
 return [...fields.values()].map(f=>'<div class="field-line"><details><summary><span>'+esc(f.label)+'</span><b>'+signed(f.amount)+'</b></summary>'+
 f.items.map(e=>'<div class="raw-line"><span>'+esc(e.label)+(e.mode==='noncash'?' <i>非现金</i>':e.mode==='derived_cash'?' <i>推导</i>':'')+'</span><b>'+signed(e.amount)+'</b></div>').join('')+'</details></div>').join('');
}
function render(d){
 let out='';
 const total=(label,v,cls='total')=>'<tr class="'+cls+'"><th scope="row">'+label+'</th><td class="amount">'+fmt(v[0])+'</td><td>净变动</td><td class="amount">'+signed(v[1]-v[0])+'</td><td class="amount">'+fmt(v[1])+'</td></tr>';
 for(const g of mapData(d)){
 out+='<tr class="group"><th colspan="5" scope="rowgroup">'+g.title+'</th></tr>';
 for(const r of g.rows){
 const changes=r.changes.filter(c=>c.amount!==0||c.details.some(e=>e.amount!==0));
 if(!changes.length)changes.push({label:'无变动',amount:0,details:[],code:'none'});
 const n=changes.length+1;
 const parts=r.components.flatMap(c=>c.breakdown||[c]).map(c=>'<tr><td>'+esc(c.label)+'</td><td>'+fmt(c.start)+'</td><td>'+fmt(c.end)+'</td></tr>').join('');
 const asset='<details class="asset-details"><summary>'+esc(r.label)+(r.key==='cash'?'¹':'')+'</summary><table class="components"><thead><tr><th>构成</th><th>2024</th><th>2025</th></tr></thead><tbody>'+parts+'</tbody></table></details>';
 changes.forEach((c,i)=>{
 out+='<tr>';if(i===0)out+='<th class="item" scope="rowgroup" rowspan="'+n+'">'+asset+'</th><td class="amount opening" rowspan="'+n+'">'+fmt(r.start)+'</td>';
 const details=detailHTML(c.details);
 out+='<td class="detail '+(['unresolved','balance'].includes(c.code)?'residual':'')+'">'+(details?'<details><summary>'+esc(c.label)+'</summary>'+details+'</details>':esc(c.label))+'</td><td class="amount delta">'+signed(c.amount)+'</td>';
 if(i===0)out+='<td class="amount closing" rowspan="'+n+'">'+fmt(r.end)+'</td>';out+='</tr>';
 });
 out+='<tr class="subtotal"><td>变动合计</td><td class="amount">'+signed(r.end-r.start)+'</td></tr>';
 }out+=total(g.title+'合计',d.totals[g.key]);}
 out+=total('合并净资产',d.totals.net,'final')+total('减：少数股东权益',d.totals.minority)+total('归母净资产',d.totals.parent,'final parent');
 return out;
}
if(typeof module!=='undefined')module.exports={render};
if(typeof document!=='undefined')fetch('data.json').then(r=>{if(!r.ok)throw Error('数据加载失败');return r.json();}).then(d=>{document.getElementById('rows').innerHTML=render(d);}).catch(()=>{document.getElementById('status').textContent='数据暂时无法加载或核对未通过，请刷新。';});
