/* Historical observations transcribed from the linked public Disney sample.
 * E columns are deliberately independent layout assumptions, never source forecasts. */
const years=[2007,2008,2009,2010,2011,2012,2013,2014,2015,2016];
const rows=[
 ['每股收入 $','收入除以来源采用的股数；保留原样页口径。',[18.10,20.76,19.88,20.07,23.21,23.49,25.02,28.71,32.79,34.77],2,1.05],
 ['每股收益 EPS $','来源调整后摊薄 EPS，剔除部分非经常项目；非未经调整 GAAP EPS。',[1.92,2.26,1.82,2.07,2.54,3.13,3.38,4.26,4.90,5.73],2,1.05],
 ['每股宣告股利 $','宣告股利的年度口径；不等同于同期现金支付。',[.31,.35,.35,.35,.40,.60,.75,.86,1.81,1.42],2,1.06],
 ['每股资本开支 $','来源资本开支 / 股数，不是自由现金流。',[.80,.87,.96,1.11,2.02,2.10,1.55,1.95,2.67,2.98],2,1.03],
 ['每股账面净资产 $','来源期末每股账面价值，包含无形资产。',[15.67,17.73,18.55,19.78,21.22,22.09,25.24,26.45,27.83,27.04],2,null],
 ['流通普通股 · 百万','来源期末普通股数量，非 EPS 的加权平均股数。',[1962.2,1822.9,1818.3,1896.9,1762.2,1800,1800,1700,1600,1600],1,1],
 ['年度平均 PE','来源年度平均市盈率；不是年末价格 / 当年 EPS。',[17.8,14.2,12.5,15.7,15.1,13.6,17.1,18.6,20.9,17.7],1,null],
 ['年度平均股息率 %','来源年度平均股息率。',[.9,1.1,1.5,1.1,1,1.4,1.3,1.1,1.8,1.4],1,null]
];
const financials=[
 ['收入','公司总收入，百万美元。',[35510,37843,36149,38063,40893,42278,45041,48813,52465,55632],0,1.05],
 ['净利润','来源净利润口径，百万美元，不据此反推报表 GAAP EPS。',[4014,4405,3408,4035,4839,5682,6136,7501,8382,9391],0,1.05],
 ['所得税率 %','来源有效所得税率，不等同 NOPAT 经营税率。',[37.2,36.6,36.1,35.1,34.5,33.3,31,34.6,36.2,34.2],1,null],
 ['净利润率 %','来源净利润占收入比例，保留原值及其四舍五入。',[11.3,11.6,9.4,10.6,11.8,13.4,13.6,15.4,16,16.9],1,null],
 ['长期债务','财年末长期债务，百万美元。',[11892,11110,11495,10130,10922,10697,12776,12676,12773,16483],0,null],
 ['股东权益','来源财年末股东权益，百万美元。',[30753,32323,33734,37519,37385,39759,45429,44958,44525,43265],0,null],
 ['权益回报率 %','原样页权益回报率，保留来源分母口径，不冒充自算平均权益 ROE。',[13.1,13.6,10.1,10.8,12.9,14.3,13.5,16.7,18.8,21.7],1,null],
 ['分红 / 净利润 %','原样页全部股利与净利润之比。',[16,15,19,16,16,19,22,20,37,25],0,null]
];
const fmt=(n,d)=>n.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
function prediction(row,n){if(row[4]!==null)return fmt(row[2].at(-1)*row[4]**n,row[3]);return '—';}
function table(data,caption){return `<table class="matrix" aria-label="${caption}"><thead><tr>${years.map(y=>`<th scope="col">${y}</th>`).join('')}<th class="label" scope="col">${caption}</th>${[2017,2018,2020].map(y=>`<th class="estimate" scope="col">${y}E</th>`).join('')}</tr></thead><tbody>${data.map(r=>`<tr>${r[2].map(v=>`<td>${fmt(v,r[3])}</td>`).join('')}<th class="label" scope="row" title="${r[1]}">${r[0]}</th>${[1,2,4].map(n=>`<td class="estimate">${prediction(r,n)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;}
document.getElementById('per-share').innerHTML=table(rows,'每股与市场数据');
document.getElementById('financials').innerHTML=table(financials,'公司财务 · 百万美元');
document.getElementById('growth').innerHTML='<thead><tr><th>指标</th><th>2011—16</th><th>2007—16</th></tr></thead><tbody>'+[0,1,2,4].map(i=>`<tr><th>${rows[i][0].replace(' $','')}</th>${[4,0].map(j=>`<td>${fmt(((rows[i][2][9]/rows[i][2][j])**(1/(9-j))-1)*100,1)}%</td>`).join('')}</tr>`).join('')+'</tbody>';
const hi=[36.8,35,32.8,38,44.3,53.4,76.5,95.9,122.1,106.8],lo=[30.7,18.6,15.1,28.7,28.2,37.9,50.2,69.9,90,86.3];
const x=i=>45+i*78,y=v=>257-v*1.6;
document.getElementById('chart').innerHTML=`<svg viewBox="0 0 850 300" role="img" aria-label="迪士尼 2007 至 2016 年年度最高最低股价区间，未补造月度数据"><rect x="30" y="27" width="770" height="230" fill="#fff" stroke="#111"/>${[20,40,60,80,100,120,140].map(v=>`<path d="M30 ${y(v)}H800" stroke="#bbb" stroke-width=".6"/><text x="807" y="${y(v)+4}">${v}</text>`).join('')}${years.map((yr,i)=>`<path d="M${x(i)} 27V257" stroke="#ddd"/><path d="M${x(i)} ${y(hi[i])}V${y(lo[i])}M${x(i)-6} ${y(hi[i])}H${x(i)+6}M${x(i)-6} ${y(lo[i])}H${x(i)+6}" stroke="#111" stroke-width="2"/><text text-anchor="middle" x="${x(i)}" y="${y(hi[i])-7}">${hi[i]}</text><text text-anchor="middle" x="${x(i)}" y="${y(lo[i])+15}">${lo[i]}</text><text text-anchor="middle" x="${x(i)}" y="277">${yr}</text>`).join('')}<text x="34" y="16">年度最高 / 最低价</text></svg>`;
if(typeof module!=='undefined')module.exports={years,rows,financials,prediction,hi,lo};
