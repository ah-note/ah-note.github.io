/* Consume independently produced capital-statement-v1/v2 years; never infer missing facts. */
(function(){
 const sum=xs=>xs.some(x=>x===null||x===undefined)?null:xs.reduce((a,b)=>a+b,0);
 const groups={
  wealth:[['operating','经营净贡献',[['revenue','产品与服务收入'],['costs','经营耗用与费用（折旧、损失前）'],['other_income','经营补助与其他收入'],['tax','经营所得税'],['depreciation','折旧摊销'],['loss','经营资产损失']]],['nonoperating','非经营资产净贡献',[['returns','利息与投资收益'],['valuation','价值重估与汇兑损益'],['tax','非经营所得税']]],['finance','融资净成本',[['cost','融资费用'],['tax','融资税收影响']]],['owner','股东投入与分配',[['input','增资与股份激励'],['dividend','批准分红'],['repurchase','股份回购'],['minority','少数股权交易']]],['other','其他权益变动',[['translation','报表折算差额'],['other_oci','其他综合收益'],['scope','合并范围及其他权益变动']]]],
  liquidity:[['operating','经营与持有收付',[['before_working','经营收付（周转、缴税前）'],['working','经营周转资金释放／占用'],['tax','实际缴纳所得税']]],['capacity','经营资产投入与退出',[['purchase','购建经营资产'],['disposal','处置经营资产收款']]],['investment','投资投入、收回与收益',[['invest','投入对外投资'],['recover','收回投资及处置收款'],['returns','收到利息与投资分配']]],['finance','融资借入与偿还',[['borrow','现金借款'],['repay','偿还融资本金'],['cost','支付融资费用']]],['owner','股东资金收付',[['input','收到增资'],['dividend','实际支付分红'],['repurchase','现金回购'],['minority','少数股权交易收付']]],['other','现金折算及范围变化',[['translation','汇率折算影响'],['scope','合并范围现金变化'],['restriction','资金范围转类']]]]
 };
 function model(documents){
  if(!documents.length)throw Error('没有年度数据');
  const docs=[...documents].sort((a,b)=>a.year-b.year),years=docs.map(d=>d.year),company=docs[0].company,currency=docs[0].currency;
  if(new Set(years).size!==years.length)throw Error('年度重复');
  for(const d of docs){
   if(!['capital-statement-v1','capital-statement-v2'].includes(d.schema)||d.company!==company||d.currency!==currency||!Number.isInteger(d.year)||d.validation?.errors?.length)throw Error('年度协议、主体、币种或校验状态不一致');
   if(d.schema==='capital-statement-v2'&&(!d.facts||!Array.isArray(d.mappings)))throw Error('年度事实账本缺失');
  }
  const annual={},series={},boundaryWarnings=[];
  for(const d of docs){
   const value=k=>d.records[k]?.amount??null;
   const activity={};
   for(const [block,definitions] of Object.entries(groups))activity[block]=definitions.map(([id,label,fields])=>{
    const rows=fields.map(([key,label])=>{const record=d.records[`${block}.${id}.${key}`];return {key,label,amount:record?.amount??null,status:record?.status||'missing',basis:record?.basis||'',details:record?.details||[]};});
    const amount=sum(rows.map(r=>r.amount));
    if(block==='wealth'&&id==='operating')rows.splice(4,0,{label:'税后经营盈余（折旧、损失前）',amount:sum(rows.slice(0,4).map(r=>r.amount)),subtotal:true,details:[]});
    return {key:id,label,amount,rows};
   });
   activity.equityChange=sum(activity.wealth.map(g=>g.amount));activity.cashChange=sum(activity.liquidity.map(g=>g.amount));activity.noncash=value('noncash.leases');
   annual[d.year]=activity;series[d.year]=d;
  }
  for(let i=1;i<docs.length;i++)if(docs[i].year===docs[i-1].year+1){
   for(const [key,record] of Object.entries(docs[i].records).filter(([k])=>k.startsWith('assets.')&&k.endsWith('.opening'))){
    const prior=docs[i-1].records[key.replace('.opening','.closing')]?.amount;
    if(prior!==null&&prior!==undefined&&record.amount!==null&&prior!==record.amount)boundaryWarnings.push({year:docs[i].year,field:key,previous:prior,opening:record.amount});
   }
  }
  return {years,annual,series,company,currency,boundaryWarnings};
 }
 if(typeof module!=='undefined')module.exports={model,sum,groups};else globalThis.CapitalAnnual={model};
})();
