const fmt=n=>(n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const signed=n=>(n>0?'+':'')+fmt(n);
function render(d){
 let out='';
 const total=(label,v,cls='total')=>'<tr class="'+cls+'"><th scope="row">'+label+'</th><td class="amount">'+fmt(v[0])+'</td><td>净变动</td><td class="amount">'+signed(v[1]-v[0])+'</td><td class="amount">'+fmt(v[1])+'</td></tr>';
 for(const g of d.groups){out+='<tr class="group"><th colspan="5" scope="rowgroup">'+g.title+'</th></tr>';for(const r of g.rows){const n=r.changes.length+1;r.changes.forEach((c,i)=>{out+='<tr>';if(i===0)out+='<th class="item" scope="rowgroup" rowspan="'+n+'" title="年报印刷页 '+r.page+'">'+r.label+'</th><td class="amount opening" rowspan="'+n+'">'+fmt(r.start)+'</td>';out+='<td class="detail '+(c[2]||'')+'">'+c[0]+'</td><td class="amount delta '+(c[2]||'')+'">'+signed(c[1])+'</td>';if(i===0)out+='<td class="amount closing" rowspan="'+n+'">'+fmt(r.end)+'</td>';out+='</tr>';});out+='<tr class="subtotal"><td>变动合计</td><td class="amount">'+signed(r.end-r.start)+'</td></tr>';}out+=total(g.title+'合计',d.totals[g.key]);}
 out+=total('合并净资产',d.totals.net,'final');out+=total('减：少数股东权益',d.totals.minority);out+=total('归母净资产',d.totals.parent,'final parent');return out;
}
if(typeof module!=='undefined')module.exports={render};
if(typeof document!=='undefined')fetch('data.json').then(r=>{if(!r.ok)throw Error('数据加载失败');return r.json();}).then(d=>{document.getElementById('rows').innerHTML=render(d);}).catch(()=>{document.getElementById('status').textContent='数据暂时无法加载，请刷新。';});
