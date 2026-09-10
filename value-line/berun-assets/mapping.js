// Explicit source-to-standard mapping. Every source change is used exactly once.
const templates=[
 ['op','经营净资产',[
  ['working','经营周转净资产',['wc']],
  ['long_assets','经营长期资产',['fixed','intang','rou','def']],
  ['capital_settlement','资本性结算净额',['pre','equip_pay']],
  ['other_operating','其他经营净资产',['opother']],
  ['goodwill','商誉',['good']],
  ['financial_business','金融业务净资产',[]]
 ]],
 ['na','非经营资产',[
  ['cash','现金及存款',['cash','deposit']],
  ['investments','对外投资',['eq','fin']],
  ['other_assets','其他非经营资产',['invprop','otherfin']]
 ]],
 ['nl','非经营负债',[
  ['financing','融资负债',['borrow','lease','longpay']],
  ['shareholder','股东及权益相关应付款',['div','incent']],
  ['other_liabilities','其他非经营负债',['dispute']]
 ]]
];
const labels={
 inventory:'存货及履约资产变动',receivables:'应收与预付变动',payables:'经营应付款变动',
 purchase:'购建及资本化投入',depreciation:'折旧摊销及耗竭',impairment:'减值',
 lease:'新增租赁',disposal:'处置退出',reclass:'重分类',other:'其他已解释变动',unresolved:'待解释净变动',
 capital_pre:'资本预付款变动',capital_pay:'资本应付款变动',tax:'经营税项变动',obligation:'经营义务变动',
 operating_cash:'经营净流入',investing_cash:'投资净流入',financing_cash:'融资及股东净流入（待分拆）',
 fx:'汇率折算',cash_scope:'资金划转及现金口径变化',invest:'投入',recover:'收回',income:'确认收益',
 valuation:'估值及权益变动',distribution:'投资分配及应收变化',borrow:'新增融资',repay:'偿还',
 noncash:'其他非现金变动',declare:'确认应付',pay:'现金支付',release:'解除及其他结算',
 no_change:'无变动'
};
const changeMap={
 wc:['inventory','receivables','receivables','payables'],
 fixed:['purchase','purchase','depreciation','impairment','unresolved'],
 intang:['purchase','other','depreciation','disposal','reclass','other','impairment'],
 rou:['lease','depreciation','impairment'],good:['no_change'],
 def:['purchase','depreciation'],pre:['capital_pre','capital_pre','capital_pre','tax'],
 equip_pay:['capital_pay'],opother:['tax','obligation','obligation','obligation'],
 cash:['operating_cash','investing_cash','financing_cash','fx','cash_scope'],deposit:['cash_scope'],
 eq:['invest','recover','income','valuation','valuation'],fin:['recover','valuation','valuation'],
 invprop:['unresolved'],otherfin:['depreciation','income','distribution'],
 borrow:['borrow','repay','noncash','borrow','repay'],lease:['lease','repay','noncash'],
 longpay:['borrow','noncash','repay','noncash'],div:['declare','pay','release'],
 dispute:['reclass','declare'],incent:['release']
};
function standardize(d){
 const raw=Object.fromEntries(d.groups.flatMap(g=>g.rows).map(r=>[r.key,r]));
 return templates.map(([key,title,items])=>({key,title,rows:items.map(([id,label,keys])=>{
  const components=keys.map(k=>raw[k]);const changes=new Map();
  for(const r of components){if(changeMap[r.key].length!==r.changes.length)throw Error('Mapping incomplete: '+r.key);
   r.changes.forEach((c,i)=>{const code=changeMap[r.key][i];if(!changes.has(code))changes.set(code,{code,label:labels[code],amount:0,details:[]});
    const a=changes.get(code);a.amount+=c[1];a.details.push({label:c[0],amount:c[1],source:r.label,page:r.page,residual:c[2]==='residual'});});}
  return {key:id,label,start:components.reduce((s,r)=>s+r.start,0),end:components.reduce((s,r)=>s+r.end,0),
   components,changes:[...changes.values()],warning:['working','capital_settlement'].includes(id)?'含应付性质待核实':id==='other_liabilities'?'含重大仲裁义务':id==='financing'?'含融资与购置分期款':null};
 })}));
}
if(typeof module!=='undefined')module.exports={standardize,templates,changeMap};
