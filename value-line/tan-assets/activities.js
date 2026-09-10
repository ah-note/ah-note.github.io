/* Economic activity view. Source inputs are RMB thousand; outputs are RMB yuan. */
(function () {
  'use strict';
  function buildActivities(s, assets) {
    const sum = xs => xs.reduce((a, b) => a + b, 0);
    const row = (label, amount, details = [], subtotal = false) => ({label, amount: Math.round(amount * 1000) || 0, details: details.map(([label, amount]) => ({label, amount: Math.round(amount * 1000) || 0})), subtotal});
    const p = s.profit, c = s.cash;
    const totalCosts = sum(p.costs.map(x => x[1]));
    const depreciation = sum(p.depreciation.map(x => x[1]));
    const losses = sum(p.losses.map(x => x[1]));
    const investment = sum(p.investment.map(x => x[1]));
    const op = p.operations - investment;
    const beforeTax = p.operations - p.financeCost;
    const rate = p.tax / beforeTax;
    // Allocation is an explicit model, not separately disclosed operating tax.
    const operatingTax = Math.round(op * rate);
    const financeTax = Math.round(-p.financeCost * rate);
    const investmentTax = p.tax - operatingTax - financeTax;
    const surplus = op + depreciation + losses - operatingTax;
    const costExclusions = depreciation + p.lossesInCosts + p.rentalCost;
    const operatingCosts = totalCosts - costExclusions;
    const otherOperating = op + depreciation + losses - p.revenue + operatingCosts;
    const group = (label, rows, amount) => ({label, rows, amount: amount === undefined ? sum(rows.filter(r => !r.subtotal).map(r => r.amount)) : Math.round(amount * 1000)});
    const wealth = [
      group('经营净贡献', [
        row('产品与服务收入', p.revenue),
        row('经营耗用与费用（折旧、损失前）', -operatingCosts, [...p.costs.map(([l,v])=>[l,-v]), ['剔除折旧摊销', depreciation], ['剔除资产损失', p.lossesInCosts], ['转出出租物业直接费用', p.rentalCost]]),
        row('经营补助与其他收入', otherOperating, p.otherOperating),
        row('经营所得税 · 估计', -operatingTax),
        row('税后经营盈余（折旧、损失前）', surplus, [], true),
        row('折旧摊销', -depreciation, p.depreciation.map(([l,v])=>[l,-v])),
        row('经营资产损失', -losses, p.losses.map(([l,v])=>[l,-v]))
      ]),
      group('非经营资产净贡献', [
        row('利息与投资收益', p.interest + p.rentalNet + p.wealthGain, [['存款利息', p.interest], ['出租物业净租金', p.rentalNet], ['理财公允价值收益', p.wealthGain]]),
        row('价值重估与汇兑损益', p.propertyRevaluation + p.fxProfit, [['出租物业价值变动', p.propertyRevaluation], ['当期汇兑损益', p.fxProfit]]),
        row('非经营所得税 · 估计', -investmentTax)
      ]),
      group('融资净成本', [row('融资费用', -p.financeCost), row('融资税收影响 · 估计', -financeTax)]),
      group('股东投入与分配', [row('增资与股份激励', p.equityInput), row('批准分红', -p.dividend), row('股份回购', -p.repurchase), ...(p.minorityTransaction ? [row('少数股权交易', -p.minorityTransaction)] : [])]),
      group('其他权益变动', [row('报表折算差额', p.oci, p.ociDetails)])
    ];
    const liquidity = [
      group('经营与持有收付', [
        row('经营收付（周转、缴税前）', c.beforeWorking, c.beforeWorkingDetails),
        row('经营周转资金释放／占用', sum(c.working.map(x=>x[1])), c.working),
        row('实际缴纳所得税', -c.taxPaid, c.taxes.map(([l,v])=>[l,-v]))
      ]),
      group('经营资产投入与退出', [row('购建经营资产', -c.capex), row('处置经营资产收款', c.disposal)]),
      group('投资投入、收回与收益', [row('投入对外投资', -c.invest), row('收回投资及处置收款', c.recover), row('收到利息', c.interest)]),
      group('融资借入与偿还', [row('现金借款', c.borrow), row('偿还融资本金', -c.repay), row('支付融资费用', -c.financeCost)]),
      group('股东资金收付', [row('收到增资', c.equityInput), row('实际支付分红', -c.dividend), row('现金回购', -c.repurchase), ...(c.minorityTransaction ? [row('购买少数股权', -c.minorityTransaction)] : [])]),
      group('现金折算变化', [row('汇率折算影响', c.fx)])
    ];
    const equityChange = sum(wealth.map(g=>g.amount));
    const cashChange = sum(liquidity.map(g=>g.amount));
    const profit = sum(wealth.slice(0,3).map(g=>g.amount));
    const cashAsset = assets.components.find(x=>x.key==='cash');
    if (profit !== p.net * 1000 || equityChange !== assets.totals.net[1] - assets.totals.net[0] || cashChange !== cashAsset.end - cashAsset.start) throw Error('资本活动与资产表未闭合');
    for (const g of [...wealth, ...liquidity]) for (const r of g.rows) {
      if (!Number.isFinite(r.amount) || (r.details.length && sum(r.details.map(x=>x.amount)) !== r.amount)) throw Error('资本活动明细不闭合：'+r.label);
    }
    return {wealth, liquidity, equityChange, cashChange, profit, rate, noncash: c.newLease * 1000};
  }
  function renderActivities(d) {
    const escape = v => String(v).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = n => (n>0?'+':'') + (n/1e8).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:Math.abs(n)>0&&Math.abs(n)<1e6?5:2});
    const section = (label, groups, totalLabel, total) => '<tr class="group"><th colspan="4">'+label+'</th></tr>' + groups.map(g=>g.rows.map((r,i)=>'<tr class="'+(r.subtotal?'activity-subtotal':'')+'">'+(!i?'<th class="item" scope="rowgroup" rowspan="'+g.rows.length+'">'+escape(g.label)+'</th><td class="amount activity-group-total" rowspan="'+g.rows.length+'">'+money(g.amount)+'</td>':'')+'<td>'+(r.details.length?'<details><summary>'+escape(r.label)+'</summary>'+r.details.map(x=>'<div class="raw-line"><span>'+escape(x.label)+'</span><b>'+money(x.amount)+'</b></div>').join('')+'</details>':escape(r.label))+'</td><td class="amount">'+money(r.amount)+'</td></tr>').join('')).join('')+'<tr class="final parent"><th>'+totalLabel+'</th><td class="amount">'+money(total)+'</td><td colspan="2">对应上表'+(label==='净资产形成'?'净资产合计':'现金与存款')+'的年度增量</td></tr>';
    return section('净资产形成', d.wealth, '净资产增加', d.equityChange) + section('资金收付与配置',d.liquidity,'现金与存款增加',d.cashChange)+'<tr><th>非现金资本配置</th><td class="amount">'+money(d.noncash)+'</td><td colspan="2">新增租赁：经营设施与融资负债同时增加，不计入以上两项汇总。</td></tr>';
  }
  if (typeof module !== 'undefined') module.exports = {buildActivities, renderActivities};
  else {
  globalThis.TanActivities = {buildActivities, renderActivities};
  if (!globalThis.TAN_COMPARE) Promise.all(['activities.json','data.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('读取失败');return r.json();}))).then(([s,a])=>{
    document.getElementById('activity-rows').innerHTML=renderActivities(buildActivities(s,a));
  }).catch(e=>{document.getElementById('activity-status').textContent='资本活动表暂未显示：'+e.message;});
  }
})();
