// 通用型 v1：余额字段与变动字段正交，公司名称不得进入标准字段。
const assetSets = [
 ['op','经营净资产',[
  ['working','经营周转净额',['wc']],
  ['facilities','经营设施',['fixed','rou','def']],
  ['rights','经营权利与开发资产',['intang']],
  ['capital_settlement','资本采购结算净额',['pre','equip_pay','land_pay']],
  ['goodwill','商誉',['good']],
  ['other_operating','其他经营净额',['opother','capital_tax']]
 ]],
 ['na','非经营资产',[
  ['cash','现金与存款',['cash','deposit']],
  ['investments','对外投资',['eq','fin']],
  ['other_assets','其他非经营资产',['invprop','otherfin']]
 ]],
 ['nl','非经营负债',[
  ['financing','融资负债',['borrow','lease','longpay']],
  ['shareholder','股东相关应付款',['div','incent']],
  ['other_liabilities','其他非经营负债',['dispute']]
 ]]
];
const movementGroups = {
 operating:'经营形成与耗用', settlement:'经营收付', capacity:'经营投入与退出',
 consumption:'折旧摊销与耗竭', loss:'资产减值与恢复', investment:'投资投入与收回',
 returns:'投资收益', financing:'融资借入与偿还', finance_cost:'融资费用',
 owner:'股东投入与分配', scope:'业务并入与移出', valuation:'价值重估与汇率',
 transfer:'资产与义务转类', balance:'余额变化†', unresolved:'未解释差额†', none:'无变动'
};
// 13 类经济变动；余额变化与未解释差额是证据状态，不冒充流转原因。
const movementFields = {
 inventory:['operating','存货形成与耗用'], obligation:['operating','经营义务确认与解除'],
 receive:['settlement','收取经营款'], pay_operating:['settlement','支付经营款'], tax_cash:['settlement','税费收付'], operating_net:['settlement','经营收付净额'],
 purchase:['capacity','新增经营投入'], disposal:['capacity','经营资产退出'],
 depreciation:['consumption','折旧摊销与耗竭'], impairment:['loss','资产减值'], reversal:['loss','减值转回'],
 invest:['investment','新增投资'], recover:['investment','收回投资'],
 income:['returns','确认投资收益'], income_cash:['returns','收取投资收益'],
 borrow:['financing','新增融资'], repay:['financing','偿还融资'],
 interest:['finance_cost','融资成本确认'], interest_cash:['finance_cost','支付融资成本'],
 equity:['owner','股东投入'], dividend:['owner','宣告分红'], dividend_cash:['owner','支付分红'],
 repurchase:['owner','股份回购'], incentive:['owner','股份激励结算'], minority:['owner','买卖子公司少数股权'],
 acquire:['scope','并入业务'], divest:['scope','移出业务'],
 valuation:['valuation','价值重估'], fx:['valuation','汇率折算'], reclass:['transfer','资产与义务转类'],
 inventory_balance:['balance','存货余额变化'], receivable_balance:['balance','经营债权余额变化'],
 payable_balance:['balance','经营欠款余额变化'], tax_balance:['balance','税款及预摊余额变化'],
 pre_balance:['balance','资本预付款余额变化'], capital_pay_balance:['balance','资本欠款余额变化'],
 investment_balance:['balance','投资余额变化'], cash_balance:['balance','受限资金等余额变化'],
 obligation_balance:['balance','义务余额变化'], unresolved:['unresolved','未解释差额'], no_change:['none','无变动']
};
if(typeof module!=='undefined')module.exports={assetSets,movementGroups,movementFields};
