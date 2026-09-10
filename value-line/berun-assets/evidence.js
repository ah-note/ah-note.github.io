// 年报增量转录；单位人民币元。每个 replacement 闭合到被替代的原始变动。
const evidenceReplacements = {
 cash: [
  [
   ['receive',10587763473.83,'客户付款','cash'],
   ['receive',69393251.54,'经营往来及其他收款','cash'],
   ['receive',8403015.47,'收到补助','cash'],
   ['pay_operating',-5925204438.51,'采购商品及服务','cash'],
   ['pay_operating',-880849942.06,'支付员工报酬','cash'],
   ['pay_operating',-573068867.53,'支付费用及经营往来','cash'],
   ['tax_cash',72650473.34,'收到退税','cash'],
   ['tax_cash',-840201903.78,'支付税费','cash'],
   ['income_cash',40959611.50,'收到存款等利息','cash']
  ],
  [
   ['recover',3515201780.82,'投资回款','cash'],
   ['invest',-3351212400,'支付投资款','cash'],
   ['income_cash',10389459.16,'收到投资分配','cash'],
   ['disposal',67936774.83,'出售长期资产回款','cash'],
   ['purchase',-3383700522.26,'支付设施、权利及其他长期资产款','cash'],
   ['divest',500002,'退出子公司净回款','cash'],
   ['divest',-3022597.88,'退出子公司带走的净现金','cash'],
   ['reclass',104920519.53,'土地预付款解除限制，转入现金等价物','scope']
  ],
  [
   ['equity',350000,'子公司少数股东投入','cash'],
   ['borrow',7737335972.80,'收到借款','cash'],
   ['borrow',489634811.54,'收到票据融资','cash'],
   ['repay',-4268449156.01,'归还债务','cash'],
   ['repay',-673932064.61,'归还票据融资','cash'],
   ['repay',-198738360.40,'支付融资购置款（未细分本息）','cash'],
   ['dividend_cash',-1723169974.19,'支付合并范围外股东分红','cash'],
   ['interest_cash',-(2038703767.88-1723169974.19),'分红及利息支出扣除已核实分红，推导融资付息','derived_cash'],
   ['interest_cash',-64201646.16,'担保费、贴现利息等','cash'],
   ['minority',-2719564200,'增持已控制子公司的少数股权','cash'],
   ['repurchase',-74646776.97,'激励股份回购付款','cash']
  ]
 ],
 invprop: [[
  ['reclass',3416111.39-101046.12,'自用设施与土地转为出租用途','noncash'],
  ['reclass',-(22162896.28-2615436.12),'出租物业转回自用设施','noncash'],
  ['depreciation',-13924824.33,'出租物业折旧及权利摊销','noncash'],
  ['impairment',-86416621.27,'出租物业价值损失','noncash']
 ]],
 eq: [[
  ['invest',250000000,'参股项目新增投资（不据附注单独认定付款）','accrual'],
  ['invest',642309378.20,'探矿权争议相关投资资本化，同时形成应付款','noncash']
 ]]
};
const evidencePages={cash:'96–97、165–167',invprop:'138–139',eq:'137–138、196–197'};
if(typeof module!=='undefined')module.exports={evidenceReplacements,evidencePages};
