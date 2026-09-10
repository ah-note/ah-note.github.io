const dictionary=typeof module!=='undefined'?require('./fields.js'):{assetSets,movementGroups,movementFields};
const evidence=typeof module!=='undefined'?require('./evidence.js'):{evidenceReplacements,evidencePages};
const changeMap={
 wc:['inventory_balance','receivable_balance','tax_balance','payable_balance'],
 fixed:['purchase','purchase','depreciation','impairment','unresolved'],
 intang:['purchase','unresolved','depreciation','disposal','reclass','unresolved','impairment'],
 rou:['purchase','depreciation','impairment'],good:['no_change'],def:['purchase','depreciation'],
 pre:['pre_balance','pre_balance','pre_balance','tax_balance'],equip_pay:['capital_pay_balance'],
 opother:['tax_balance','obligation','obligation','obligation'],
 cash:['receive','invest','borrow','fx','cash_balance'],deposit:['cash_balance'],
 eq:['invest','investment_balance','income','valuation','investment_balance'],
 fin:['investment_balance','valuation','valuation'],invprop:['unresolved'],
 otherfin:['interest','income','receivable_balance'],
 borrow:['borrow','repay','unresolved','borrow','repay'],lease:['borrow','repay','unresolved'],
 longpay:['borrow','unresolved','repay','unresolved'],div:['dividend','dividend_cash','unresolved'],
 dispute:['obligation_balance','obligation_balance'],incent:['obligation_balance']
};
const componentNames={wc:'日常周转资产减正常结算义务',fixed:'自有设施及在建项目',intang:'土地、资源及软件权利',
 rou:'租入设施使用权',def:'设施改造及长期服务投入',good:'收购溢价',pre:'购建设施及权利预付款',
 equip_pay:'减：设施采购欠款',land_pay:'减：土地采购欠款',capital_tax:'资本采购待抵税款',
 opother:'经营税项、补助及长期义务净额',cash:'账面现金（含受限部分）',deposit:'保证金存款及应计利息',
 eq:'参股企业投资',fin:'证券及其他权益投资',invprop:'非主业出租物业',otherfin:'融资费用及投资应收',
 borrow:'借款及应计利息',lease:'租入设施付款义务',longpay:'融资及资源购置分期款',
 div:'已宣告未支付分红',incent:'激励股份回购义务',dispute:'参股投资争议付款义务'};
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const close=(a,b)=>Math.abs(a-b)<0.01;
function prepare(d){
 const rows=structuredClone(d.groups.flatMap(g=>g.rows));
 for(const r of rows){
  if(!changeMap[r.key]||changeMap[r.key].length!==r.changes.length)throw Error('Mapping incomplete: '+r.key);
  r.origin=r.key;r.sourceLabel=r.label;r.label=componentNames[r.key];
  r.events=r.changes.flatMap((c,i)=>{
   const repl=evidence.evidenceReplacements[r.key]?.[i];
   if(repl&&!close(sum(repl.map(v=>v[1])),c[1]))throw Error('Evidence does not reconcile: '+r.key+':'+i);
   return (repl||[[changeMap[r.key][i],c[1],c[0],c[2]==='residual'?'residual':'disclosed']]).map(([code,amount,label,mode])=>({code,amount,label,mode,page:evidence.evidencePages[r.key]||r.page,source:r.sourceLabel}));
  });
 }
 // 同属经营侧的分类纠正，不改变三类资产总量。
 const pre=rows.find(r=>r.key==='pre'),op=rows.find(r=>r.key==='opother');
 const tax={key:'capital_tax',origin:'pre',label:componentNames.capital_tax,start:504331.85,end:55630020.62,page:'150',events:pre.events.filter(e=>e.code==='tax_balance')};
 pre.start-=tax.start;pre.end-=tax.end;pre.events=pre.events.filter(e=>e.code!=='tax_balance');
 const land={key:'land_pay',origin:'opother',label:componentNames.land_pay,start:-175790318.71,end:-175790318.71,page:'152',events:[]};
 op.start-=land.start;op.end-=land.end;rows.push(tax,land);
 const wc=rows.find(r=>r.key==='wc');
 wc.breakdown=[
  ['存货',772352416.08,616482240.36],
  ['客户欠款与结算票据',50636520.76+207031582.13,43862529.41+45547368.80],
  ['采购预付与经营往来',89049811.15+82074975.74-4343065.69,83245268.61+64142187.26],
  ['待抵税款与预摊支出',426197737.72+4652167.48,572458709.74+4405904.61],
  ['减：客户预付款',-1121416892.15,-1086076794.72],
  ['减：供应商结算款',-(507280788.08+486212660.46+283850870.07),-(500608792.20+712296021.57+175796387.51)],
  ['减：员工、税款及其他经营结算',-(245192275.16+121982504.27+51642054.25+130595616.84),-(200890501.14+150322001.95+79912526.98+127995664.85)]
 ].map(([label,start,end])=>({label,start,end}));
 if(!close(sum(wc.breakdown.map(r=>r.start)),wc.start)||!close(sum(wc.breakdown.map(r=>r.end)),wc.end))throw Error('Working capital components do not reconcile');
 return rows;
}
function standardize(d){
 const raw=Object.fromEntries(prepare(d).map(r=>[r.key,r]));
 return dictionary.assetSets.map(([key,title,items])=>({key,title,rows:items.map(([id,label,keys])=>{
  const components=keys.map(k=>{if(!raw[k])throw Error('Missing asset: '+k);return raw[k];});const groups=new Map();
  for(const r of components)for(const e of r.events){
   const f=dictionary.movementFields[e.code];if(!f)throw Error('Unknown field: '+e.code);
   const [group,fieldLabel]=f;
   if(!groups.has(group))groups.set(group,{code:group,label:dictionary.movementGroups[group],amount:0,details:[]});
   const g=groups.get(group);g.amount+=e.amount;g.details.push({...e,fieldLabel});
  }
  const changes=[...groups.values()];const start=sum(components.map(r=>r.start)),end=sum(components.map(r=>r.end));
  if(!close(start+sum(changes.map(c=>c.amount)),end))throw Error('Asset bridge does not reconcile: '+id);
  return {key:id,label,start,end,components,changes};
 })}));
}
if(typeof module!=='undefined')module.exports={standardize,prepare,changeMap};
