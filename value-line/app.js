'use strict';
const labels = {revenue:'营业收入',profit:'归母净利润',ocf:'经营现金流净额',capex:'购建长期资产现金支出',cashSurplus:'扣资本开支后现金',grossMargin:'毛利率'};
const moneyKeys = ['revenue','profit','ocf','capex','cashSurplus'];
const names = {'600585.SH':'海螺水泥','600801.SH':'华新建材','002233.SZ':'塔牌集团'};
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val = (row,key) => key === 'cashSurplus' ? (Number.isFinite(row.ocf) && Number.isFinite(row.capex) ? row.ocf-row.capex : null) : row[key];
const growth = (a,b) => Number.isFinite(a) && Number.isFinite(b) && a>0 ? (b/a-1)*100 : null;
const fmt = (n,d=2) => Number.isFinite(n) ? n.toLocaleString('zh-CN',{minimumFractionDigits:d,maximumFractionDigits:d}) : '未收录';
const delta = n => n===null ? '不适用' : `${n>0?'+':''}${fmt(n,1)}%`;
let companies=[], current='600585.SH', metric='revenue', perShare=false;
function chartSvg(rows,key){
 const values=rows.map(r=>val(r,key));
 if(values.some(v=>!Number.isFinite(v)))return '<p class="quiet">该字段尚未从现有底稿收录，未用估计值补齐。</p>';
 const low=Math.min(0,...values),high=Math.max(0,...values),span=high-low||1;
 const y=v=>165-(v-low)/span*125,zero=y(0),x=i=>120+i*230;
 let svg='<svg class="chart-svg" viewBox="0 0 700 210" role="img" aria-label="'+escapeHtml(labels[key])+'：'+rows.map((r,i)=>r.year+'年'+fmt(values[i]/1e8)+'亿元').join('，')+'">';
 for(let i=0;i<4;i++){let v=low+span*i/3;svg+=`<line x1="55" x2="680" y1="${y(v)}" y2="${y(v)}" stroke="#e6edf3"/><text x="45" y="${y(v)+4}" text-anchor="end">${fmt(v/1e8,0)}</text>`;}
 values.forEach((v,i)=>{const top=Math.min(y(v),zero),height=Math.max(2,Math.abs(y(v)-zero));svg+=`<rect x="${x(i)-33}" y="${top}" width="66" height="${height}" rx="3" fill="${i===2?'#185ed0':'#b9cee8'}"/><text class="value" x="${x(i)}" y="${v>=0?top-9:top+height+18}" text-anchor="middle">${fmt(v/1e8)}</text><text x="${x(i)}" y="202" text-anchor="middle">${rows[i].year}</text>`;});
 return svg+'</svg>';
}
function render(){
 const c=companies.find(x=>x.code===current),rows=c.years,last=rows.at(-1),prev=rows.at(-2);
 document.title=`${names[current]} · 公司数据页 · AH Note`;
 document.getElementById('name').textContent=names[current];document.getElementById('code').textContent=current;
 document.getElementById('company').value=current;document.getElementById('report').href=`/reports/${current}/`;
 document.getElementById('kpis').innerHTML=['revenue','profit','ocf','grossMargin'].map(k=>{
 const v=val(last,k),g=k==='grossMargin'?(v-prev[k])*100:growth(val(prev,k),v);
 return `<div class="kpi"><div class="kpi-label">${labels[k]} <span class="quiet">2025</span></div><div class="kpi-value">${fmt(k==='grossMargin'?v*100:Number.isFinite(v)?v/1e8:null)}<small>${k==='grossMargin'?'%':'亿元'}</small></div><div class="kpi-sub">较 2024 <span class="${g>=0?'positive':'negative'}">${k==='grossMargin'?`${g>0?'+':''}${fmt(g,2)} 个百分点`:delta(g)}</span></div></div>`;
 }).join('');
 document.getElementById('chart-label').textContent=labels[metric];document.getElementById('chart').innerHTML=chartSvg(rows,metric);
 const change=growth(val(rows[0],metric),val(last,metric));
 const ch=document.getElementById('change');ch.textContent=delta(change);ch.className='change '+(change>=0?'positive':'negative');
 document.getElementById('change-caption').textContent=labels[metric]+'累计变化（非年化）';
 document.querySelectorAll('[data-metric]').forEach(b=>b.classList.toggle('active',b.dataset.metric===metric));
 document.getElementById('total').classList.toggle('active',!perShare);document.getElementById('per-share').classList.toggle('active',perShare);
 document.getElementById('unit-note').textContent=perShare?`金额单位：元 / 股。所有年度统一除以底稿2025年估值股数 ${fmt(c.shares/1e8,3)} 亿股，仅展示同股数折算；不是各年财报 EPS，未体现历史股本变化。`:'金额单位：亿元人民币；历史披露与公式计算分开标识。2023—2025均为实际年度，不含稳定期。';
 const keys=[...moneyKeys,'grossMargin'];
 document.getElementById('history').innerHTML='<thead><tr><th>经营指标</th>'+rows.map(r=>`<th>${r.year}</th>`).join('')+'<th>2025 同比</th></tr></thead><tbody>'+keys.map(k=>{
 const computed=['cashSurplus','grossMargin'].includes(k);
 const g=k==='grossMargin'?(last[k]-prev[k])*100:growth(val(prev,k),val(last,k));
 return `<tr><td>${labels[k]}<span class="metric-type">${computed?'计算':'披露'}</span></td>`+rows.map(r=>{const v=val(r,k);return `<td>${k==='grossMargin'?fmt(v*100)+'%':fmt(Number.isFinite(v)?v/(perShare?c.shares:1e8):null)}</td>`;}).join('')+`<td class="${g>=0?'positive':'negative'}">${k==='grossMargin'?`${g>0?'+':''}${fmt(g)}pp`:delta(g)}</td></tr>`;
 }).join('')+'</tbody>';
 document.getElementById('peers').innerHTML='<thead><tr><th>水泥研究组 · 本版3家</th><th>收入 / 亿元</th><th>毛利率</th><th>归母净利率</th><th>现金净额 / 收入¹</th></tr></thead><tbody>'+companies.map(p=>{const r=p.years.at(-1);return `<tr><td><button class="company-button" data-company="${p.code}">${names[p.code]}${p.code===current?'<span class="current">当前</span>':''}<small>${p.code}</small></button></td><td>${fmt(r.revenue/1e8)}</td><td>${fmt(r.grossMargin*100)}%</td><td>${Number.isFinite(r.profit)?fmt(r.profit/r.revenue*100)+'%':'未收录'}</td><td>${fmt(val(r,'cashSurplus')/r.revenue*100)}%</td></tr>`;}).join('')+'</tbody>';
 document.getElementById('estimates').innerHTML=`<div class="estimate-grid"><div>稳定期收入 · 研究估计<strong>${fmt(c.stableRevenue/1e8)} <small>亿元</small></strong></div><div>经营业务价值 · 原报告模型结果<strong>${fmt(c.businessValue/1e8)} <small>亿元</small></strong></div></div><p>${escapeHtml(c.stableReason)}</p><p>仅复用原研究版本，不重新估值；未与当前股价比较。这里的估计不混入上方历史数据。<a href="/reports/${c.code}/">查看假设与完整价值桥 ↗</a></p>`;
 const sourceRows=rows.map(r=>{const seen=new Set();return `<h3>${r.year} 年度</h3><ul>`+r.sources.filter(s=>{const k=s.source+s.locator+s.item;if(seen.has(k))return false;seen.add(k);return true;}).map(s=>{const url=(s.source||'').match(/https?:\/\/[^\s<>]+/)?.[0];return `<li>${escapeHtml(s.item)} · ${escapeHtml(s.locator)}${url?` · <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">原始文件 ↗</a>`:''}</li>`;}).join('')+'</ul>';}).join('');
 document.getElementById('sources').innerHTML='<p>来自 AH Note 已发布研究的结构化底稿，沿用其披露映射和重述记录；本次仅做展示，不代表重新审计了原始财报。</p><p>¹ 同行表现金净额指经营现金流扣购建长期资产现金支出，不等同标准 FCFF。未收录值保持缺失，不填零。十年序列、实际 EPS、分红回购和股价估值曲线不在首版数据范围。</p>'+sourceRows+`<p class="quiet">底稿协议 ${escapeHtml(c.schema)} · 来源摘要 ${c.sourceHash.slice(0,16)}</p>`;
}
async function start(){
 try{const response=await fetch('data.json');if(!response.ok)throw new Error('无法读取数据');companies=await response.json();const requested=new URLSearchParams(location.search).get('code');if(companies.some(x=>x.code===requested))current=requested;render();}
 catch(error){document.getElementById('kpis').innerHTML='<div class="error">样版数据加载失败，请刷新重试。</div>';return;}
 const choose=code=>{current=code;const url=new URL(location.href);url.searchParams.set('code',code);history.replaceState(null,'',url);render();};
 document.getElementById('company').addEventListener('change',e=>choose(e.target.value));
 document.querySelectorAll('[data-metric]').forEach(b=>b.addEventListener('click',()=>{metric=b.dataset.metric;render();}));
 document.getElementById('total').addEventListener('click',()=>{perShare=false;render();});
 document.getElementById('per-share').addEventListener('click',()=>{perShare=true;render();});
 document.getElementById('peers').addEventListener('click',e=>{const b=e.target.closest('[data-company]');if(b)choose(b.dataset.company);});
}
if(typeof document!=='undefined')start();
if(typeof module!=='undefined')module.exports={val,growth,fmt,chartSvg};
