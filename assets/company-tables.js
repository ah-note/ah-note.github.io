const $ = (selector) => document.querySelector(selector);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const fmt = (value, status = "") => {
  if (value == null && status === "not_applicable") return '<span class="missing">不适用</span>';
  if (value == null) return `<span class="missing">${componentMode ? "—" : "缺失"}</span>`;
  const raw = Number(value);
  const number = Math.abs(raw) < 0.00005 ? 0 : raw;
  const digits = number !== 0 && Math.abs(number) < 0.01 ? 4 : 2;
  return `${number.toFixed(digits)}${status === "estimated" ? "²" : ""}`;
};

let company;
let componentMode = false;
let comparisonContext = {};
const openPeriods = new Set();

function union(lists) {
  const seen = new Set();
  return lists.flat().filter((item) => !seen.has(item.id) && seen.add(item.id));
}

function amountCell(value, rowspan = 1, status = "", note = "", ratio = null) {
  const prefix = status === "external" ? "外部来源：" : status === "estimated" ? "估计：" : "";
  const reader = note ? `<small class="value-note">${esc(prefix + note)}</small>` : "";
  const attribution = value != null && ratio != null ? `（${(ratio * 100).toPrecision(3)}%）` : "";
  return `<td class="amount"${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}>${fmt(value, status)}${attribution}${reader}</td>`;
}

function periodButton(period, tableId, suffix) {
  const open = openPeriods.has(period);
  const label = comparisonContext.labels?.[period] || `${period}${suffix}`;
  return `<button class="period-button" data-period="${esc(period)}" data-table="${esc(tableId)}" aria-expanded="${open}">${esc(label)}${open ? " ▾" : " ▸"}</button>`;
}

function previousPeriod(period, periods) {
  return Object.prototype.hasOwnProperty.call(comparisonContext.previous || {}, period)
    ? comparisonContext.previous[period] : periods[periods.indexOf(period) - 1];
}

function totalValues(items, periods) {
  return Object.fromEntries(periods.map((period) => {
    const values = items.map((item) => item.values[period]);
    return [period, values.some((value) => value == null) ? null : values.reduce((sum, value) => sum + value, 0)];
  }));
}

function hasVisibleValues(values) {
  if (componentMode) return Object.values(values).some((value) => value != null && Math.abs(Number(value)) >= 0.00005);
  return Object.values(values).some((value) => value == null || Math.abs(Number(value)) >= 0.00005);
}

function assetMaterialityBases(table, periods) {
  const objects = (groupId) => table.groups
    .filter((group) => group.id === groupId)
    .flatMap((group) => group.sections.flatMap((section) => section.objects));
  const operatingAndNonoperating = table.groups
    .filter((group) => group.id !== "liabilities")
    .flatMap((group) => group.sections.flatMap((section) => section.objects));
  const asset = Math.max(...periods.map((period) => operatingAndNonoperating.reduce(
    (sum, object) => sum + Math.max(Number(object.values[period]) || 0, 0), 0
  )), 0);
  const liabilityObjects = objects("liabilities");
  const liability = Math.max(...periods.map((period) => liabilityObjects.reduce(
    (sum, object) => sum + Math.abs(Number(object.values[period]) || 0), 0
  )), 0);
  const reported = (id) => {
    const values = table.disclosure_summary?.find((row) => row.id === id)?.values;
    return values && periods.every((p) => values[p] != null) ? Math.max(...periods.map((p) => Math.abs(Number(values[p])))) : null;
  };
  return {asset: reported("total_assets") ?? asset, liability: reported("total_liabilities") ?? liability};
}

function isMaterialObject(object, groupId, periods, bases) {
  if (componentMode) periods = periods.filter((p) => object.values[p] != null);
  if (!periods.length) return false;
  if (object.force_display) return true;
  const balances = periods.map((period) => object.values[period]);
  if (balances.some((value) => value == null)) return true;
  const movements = periods.flatMap((period) => object.movements[period] || []).map((item) => item.value);
  const scale = Math.max(...balances.map((value) => Math.abs(Number(value))), ...movements.map((value) => Math.abs(Number(value))), 0);
  const base = groupId === "liabilities" ? bases.liability : bases.asset;
  return base === 0 ? scale > 0 : scale / base >= 0.03;
}

function isMaterialSection(section, groupId, periods, bases) {
  if (componentMode) periods = periods.filter((p) => section.values[p] != null);
  if (!periods.length) return false;
  if (section.force_display) return true;
  const balances = periods.map((period) => section.values[period]);
  if (balances.some((value) => value == null)) return true;
  const scale = Math.max(...balances.map((value) => Math.abs(Number(value))), 0);
  const base = groupId === "liabilities" ? bases.liability : bases.asset;
  return base === 0 ? scale > 0 : scale / base >= 0.03;
}

function objectMovementPlan(object, periods) {
  return union(periods.filter((period) => openPeriods.has(period)).map((period) => {
    const movements = visibleMovements(object, period);
    if (movements == null) return [{id:"missing", label:"未载入前期"}];
    return movements.length ? movements : [{id:"net", label:""}];
  }));
}

function visibleMovements(object, period) {
  const movements = object.movements[period];
  if (movements == null) return movements;
  const base = Math.max(...Object.values(object.values).map((v) => Math.abs(Number(v) || 0)), 0);
  return movements.filter((item) => item.value == null || (base === 0 ? item.value !== 0 : Math.abs(item.value) / base >= 0.03));
}

function movementCells(object, movement, period, periods) {
  const movements = visibleMovements(object, period);
  let found;
  if (movements == null) found = movement.id === "missing" ? movement : null;
  else if (!movements.length) found = movement.id === "net" ? movement : null;
  else found = movements.find((item) => item.id === movement.id);
  if (!found) return '<td></td><td></td>';
  if (found.id === "missing") return '<td class="missing">未载入前期</td><td class="missing">缺失</td>';
  const previous = previousPeriod(period, periods);
  const net = previous && object.values[previous] != null && object.values[period] != null
    ? object.values[period] - object.values[previous] : null;
  return `<td class="change-label">${esc(found.label)}</td>${amountCell(found.id === "net" ? net : found.value)}`;
}

function objectRows(object, periods) {
  const plan = objectMovementPlan(object, periods);
  const rows = plan.length ? plan : [{id:"closed"}];
  return rows.map((movement, index) => {
    let html = '<tr class="object-row">';
    if (index === 0) html += `<th class="item" rowspan="${rows.length}">${esc(object.label)}</th>`;
    periods.forEach((period) => {
      if (openPeriods.has(period)) html += movementCells(object, movement, period, periods);
      if (index === 0) html += amountCell(object.values[period], rows.length, object.statuses?.[period] || object.status, object.evidence?.[period]?.reader_note || "", object.attribution_ratios?.[period]);
    });
    return `${html}</tr>`;
  }).join("");
}

function deltaCells(values, period, periods, explanation = "") {
  const previous = previousPeriod(period, periods);
  const delta = previous && values[previous] != null && values[period] != null
    ? values[period] - values[previous] : null;
  return `<td class="change-label">${esc(explanation)}</td>${amountCell(delta)}`;
}

function assetSectionRows(section, groupId, periods, bases) {
  let html = summaryRow(section.label, section.values, periods, "category-title", section.evidence);
  retainMaterial(section.objects, (object) => isMaterialObject(object, groupId, periods, bases), periods,
    groupId === "liabilities" ? bases.liability : bases.asset)
    .forEach((object) => { html += objectRows(object, periods); });
  return html;
}

function retainMaterial(rows, predicate, periods, base) {
  const shown = rows.filter(predicate);
  const hidden = rows.filter(row => !shown.includes(row));
  // Restore hidden rows when their combined omission exceeds the display budget.
  const significantOmission = periods.some(p => hidden.reduce((sum, row) => sum + Math.abs(Number(row.values?.[p]) || 0), 0) > base * 0.03);
  return significantOmission ? rows.filter(row => !row.values || Object.values(row.values).some(v => v != null && Number(v) !== 0)) : shown;
}

function summaryRow(label, values, periods, className, evidence = {}) {
  let html = `<tr class="${className}"><th>${esc(label)}</th>`;
  periods.forEach((period) => {
    if (openPeriods.has(period)) html += deltaCells(values, period, periods);
    html += amountCell(values[period], 1, evidence?.[period]?.status || "", evidence?.[period]?.reader_note || "");
  });
  return `${html}</tr>`;
}

function assetTable(entity) {
  comparisonContext = entity.presentation?.periods?.asset || {};
  const table = entity.asset_table;
  const periods = table.periods;
  const header = periods.map((period) => `${openPeriods.has(period) ? `<th>变化原因解释</th><th>金额</th>` : ""}<th>${periodButton(period, "asset", "年末")}</th>`).join("");
  const bases = assetMaterialityBases(table, periods);
  let body = "";
  (entity.presentation?.hide_disclosure_summary ? [] : table.disclosure_summary || []).forEach((row) => {
    body += summaryRow(row.label, row.values, periods, row.kind === "total" ? "band" : "category-title", row.evidence);
  });
  table.groups.forEach((group) => {
    const values = totalValues(group.sections, periods);
    if (componentMode && !hasVisibleValues(values)) return;
    body += summaryRow(group.label, values, periods, "band");
    retainMaterial(group.sections, (section) => isMaterialSection(section, group.id, periods, bases), periods,
      group.id === "liabilities" ? bases.liability : bases.asset)
      .forEach((section) => { body += assetSectionRows(section, group.id, periods, bases); });
  });
  Object.values(table.controls).forEach((control, index) => {
    if (!hasVisibleValues(control.values)) return;
    body += summaryRow(control.label, control.values, periods, `final-total ${index === 2 ? "parent-total" : ""}`, control.evidence);
  });
  const ownership = ownershipShare(entity, "equity");
  if (ownership) body += summaryRow(ownership.label, ownership.values, periods, "final-total");
  if (table.equity_bridge) {
    const columns = 1 + periods.reduce((n, p) => n + (openPeriods.has(p) ? 3 : 1), 0);
    body += `<tr class="operation-module"><th colspan="${columns}">归母净资产变动</th></tr>`;
    comparisonContext = entity.presentation?.periods?.operating || {};
    body += metricRows(table.equity_bridge.rows, periods, operatingMaterialityBase(entity.operating_table, periods));
    comparisonContext = entity.presentation?.periods?.asset || {};
    body += `<tr><td colspan="${columns}" class="table-note">${esc(table.equity_bridge.note)}</td></tr>`;
  }
  return `<div class="table-wrap"><table class="asset-table"><caption>资产表 <small>期末余额 · ${esc(entity.unit)}</small></caption><thead><tr><th>资产／负债项目</th>${header}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function dilutionTable(entity) {
  const items = (entity.asset_table.potential_dilution?.items || []).filter((item) =>
    item.values ? hasVisibleValues(item.values) : item.maximum_new_shares !== 0);
  if (!items.length) return "";
  const body = items.map((item) => `<tr><th>${esc(item.label)}</th><td>${esc(item.outstanding || "")}</td><td>${esc(item.terms || "")}</td><td class="amount">${fmt(item.maximum_new_shares == null ? null : item.maximum_new_shares / (entity.presentation?.share_quantity_unit === "shares" ? 1e8 : 1))}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="dilution-table"><caption>潜在股权与稀释工具 <small>备查，不参与资产加总</small></caption><thead><tr><th>工具</th><th>存续数量／本金</th><th>主要条款</th><th>最多新增股份（亿股）</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

function operatingMaterialityBase(table, periods) {
  const profitRows = table.modules.flatMap((module) => module.rows ||
    (module.businesses || []).flatMap((business) => business.metrics));
  const parentProfit = profitRows.find((row) => row.id === "parent_profit") || profitRows.find((row) => row.id === "net_profit");
  return Math.max(...periods.map((period) => Math.abs(Number(parentProfit?.values[period]) || 0)), 0);
}

function isMaterialOperatingRow(row, periods, base) {
  if (componentMode) periods = periods.filter((p) => row.values[p] != null);
  if (!periods.length) return false;
  if (!hasVisibleValues(row.values)) return false;
  if (row.kind !== "line") return true;
  if (periods.some((period) => row.values[period] == null)) return true;
  const scale = Math.max(...periods.map((period) => Math.abs(Number(row.values[period]) || 0)), 0);
  return base === 0 ? scale > 0 : scale / base >= 0.03;
}

function metricRows(rows, periods, materialityBase) {
  rows = rows.filter(row => periods.some(p => row.values[p] != null));
  return retainMaterial(rows, (row) => isMaterialOperatingRow(row, periods, materialityBase), periods, materialityBase).map((row) => {
    let html = `<tr class="metric-row metric-${esc(row.kind || "line")}"><th class="metric-label">${esc(row.label)}</th>`;
    periods.forEach((period) => {
      if (openPeriods.has(period)) html += deltaCells(row.values, period, periods, row.evidence?.[period]?.change_explanation || "");
      html += amountCell(row.values[period], 1, row.statuses?.[period], row.evidence?.[period]?.reader_note || "");
    });
    return `${html}</tr>`;
  }).join("");
}

function operatingTable(entity) {
  comparisonContext = entity.presentation?.periods?.operating || {};
  const table = entity.operating_table;
  const periods = table.periods;
  const materialityBase = operatingMaterialityBase(table, periods);
  const header = periods.map((period) => `${openPeriods.has(period) ? `<th>变化原因解释</th><th>金额</th>` : ""}<th>${periodButton(period, "operating", "年度")}</th>`).join("");
  const columnCount = 1 + periods.reduce((count, period) => count + (openPeriods.has(period) ? 3 : 1), 0);
  let body = "";
  table.modules.forEach((module) => {
    if (module.kind === "businesses" && !module.businesses.length) return;
    const moduleRows = module.kind === "rows" ? metricRows(module.rows, periods, materialityBase) : "";
    const attributed = module.id === "other_profit" ? ownershipShare(entity, "profit") : null;
    if (module.kind === "rows" && !moduleRows && !attributed) return;
    body += `<tr class="operation-module"><th colspan="${columnCount}">${esc(module.label)}</th></tr>`;
    if (module.kind === "businesses") {
      const total = module.businesses.find((business) => business.kind === "total");
      module.businesses.forEach((business) => {
        if (business.kind !== "total" && total) {
          const scale = (item, id) => Math.max(...periods.map((period) =>
            Math.abs(Number(item.metrics.find((row) => row.id === id)?.values[period]) || 0)), 0);
          const revenueBase = scale(total, "revenue");
          const revenue = scale(business, "revenue");
          const hasUnknown = !componentMode && business.metrics.some((row) => periods.some((period) => row.values[period] == null));
          if (!hasUnknown && revenueBase > 0 && revenue / revenueBase < 0.03
              && scale(business, "operating_profit") < materialityBase * 0.03) return;
        }
        const metrics = metricRows(business.metrics, periods, materialityBase);
        if (!metrics) return;
        body += `<tr class="business-band ${business.kind === "total" ? "business-total" : ""}"><th colspan="${columnCount}">${esc(business.label)}</th></tr>`;
        body += metrics;
      });
    } else {
      body += moduleRows;
      if (attributed) body += summaryRow(attributed.label, attributed.values, periods, "final-total");
    }
  });
  return `<div class="table-wrap"><table class="operating-table"><caption>经营表 <small>期间发生额 · ${esc(entity.unit)}</small></caption><thead><tr><th>业务／经营项目</th>${header}</tr></thead><tbody>${body}</tbody></table></div><p class="table-note">${esc(table.note)}</p>`;
}

function cashNarrative(entity) {
  if (entity.narratives.cash) return entity.narratives.cash;
  const rows = entity.operating_table.cash_flow_bridge?.rows || [];
  if (!rows.length) return entity.narratives.cash || "";
  const periods = entity.operating_table.periods;
  const period = periods.at(-1);
  const value = (id, p = period) => rows.find((row) => row.id === id)?.values[p];
  if (["net_profit", "operating_cash_flow", "asset_spending", "free_cash_flow"].some((id) => value(id) == null)) {
    const available = [["net_profit", "净利润"], ["operating_cash_flow", "经营现金净额"], ["asset_spending", "现金资本投入"], ["free_cash_flow", "自由现金余额"]]
      .filter(([id]) => value(id) != null)
      .map(([id, label]) => `${label}${Number(value(id)).toPrecision(3)}${rows.find((r) => r.id === id)?.evidence?.[period]?.reader_note ? `（${rows.find((r) => r.id === id).evidence[period].reader_note}）` : ""}`);
    return available.length ? `${period}年${available.join("，")}。金额均为${entity.unit}。` : "";
  }
  const significant = (number) => Number(number).toPrecision(3);
  const signed = (number) => `${number >= 0 ? "+" : ""}${significant(number)}`;
  const end = rows.findIndex((row) => row.id === "operating_cash_flow");
  const adjustments = rows.slice(1, end);
  if (adjustments.some((row) => row.values[period] == null)
      || Math.abs(value("net_profit") + adjustments.reduce((s,r) => s + r.values[period], 0) - value("operating_cash_flow")) > 0.00001) {
    return `${period}年净利润${significant(value("net_profit"))}，经营现金净额${significant(value("operating_cash_flow"))}；现金资本投入${signed(value("asset_spending"))}后，余额${significant(value("free_cash_flow"))}。利润至现金的调整组成未完整列示。金额均为${entity.unit}。`;
  }
  const major = [...adjustments].sort((a, b) => Math.abs(b.values[period]) - Math.abs(a.values[period])).slice(0, 3);
  const rest = adjustments.filter((row) => !major.includes(row)).reduce((sum, row) => sum + row.values[period], 0);
  const explanation = major.map((row) => `${row.label}${signed(row.values[period])}`).join("、");
  const previous = periods.at(-2);
  return `${period}年净利润${significant(value("net_profit"))}，经${explanation}及其余已披露调整合计${signed(rest)}，形成经营现金净额${significant(value("operating_cash_flow"))}；现金资本投入${signed(value("asset_spending"))}后，余额${significant(value("free_cash_flow"))}（${previous}年为${significant(value("free_cash_flow", previous))}）。金额均为${entity.unit}；此余额不是融资前自由现金流。`;
}

function ownershipShare(entity, metric) {
  if (entity.presentation?.mode !== "component") return null;
  if (!Object.values(entity.ownership || {}).some((item) => item[metric + "_share"] != null)) return null;
  return {
    label: metric === "equity" ? "对应上市公司的净资产份额" : "对应上市公司的净利润份额",
    values: Object.fromEntries(entity.asset_table.periods.map((p) => [p, entity.ownership?.[p]?.[metric + "_share"] ?? null])),
  };
}

function ownershipNote(entity) {
  if (entity.presentation?.mode !== "component") return "";
  if (!Object.keys(entity.ownership || {}).length) return "";
  const percent = (value) => value == null ? "未披露" : `${(value * 100).toPrecision(3)}%`;
  const periods = entity.asset_table.periods.map((p) => {
    const item = entity.ownership?.[p] || {};
    const profit = item.profit_ratio !== item.ratio ? `，利润适用比例${percent(item.profit_ratio)}` : "";
    return `${p}年末${percent(item.ratio)}${profit}${item.method === "adjusted" ? "（份额含归属调整）" : ""}`;
  }).join("；");
  return `<p class="table-note">上市公司有效经济权益：${esc(periods)}。主体两表为整体口径，权益份额不等于已收到的分红，也不与母公司投资账面值重复相加。</p>`;
}

function componentTables(children, root) {
  const periods = root.asset_table.periods;
  const columns = 1 + periods.reduce((n, p) => n + (openPeriods.has(p) ? 3 : 1), 0);
  const table = (kind) => {
    const asset = kind === "asset";
    const header = periods.map((p) => `${openPeriods.has(p) ? "<th>变化原因解释</th><th>金额</th>" : ""}<th>${periodButton(p, kind, asset ? "年末" : "年度")}</th>`).join("");
    const blocks = children.map((entity) => {
      const ratio = periods.map((p) => `${p}年末 ${entity.ownership?.[p]?.ratio == null ? "未披露" : (entity.ownership[p].ratio * 100).toPrecision(3) + "%"}`).join("；");
      const rendered = asset ? assetTable(entity) : operatingTable(entity);
      const body = rendered.split("<tbody>")[1].split("</tbody>")[0];
      const note = asset ? entity.narratives.scope : cashNarrative(entity);
      return `<tr class="operation-module" id="${kind}-${esc(entity.id)}"><th colspan="${columns}">${esc(entity.name)}<small> · 上市公司持股：${esc(ratio)}</small></th></tr>${note ? `<tr><td colspan="${columns}" class="table-note">${esc(note)}</td></tr>` : ""}${body}`;
    }).join("");
    return `<div class="table-wrap"><table class="${kind}-table"><caption>${asset ? "资产表" : "经营表"} <small>${esc(root.unit)}</small></caption><thead><tr><th>${asset ? "公司／资产负债项目" : "公司／经营项目"}</th>${header}</tr></thead><tbody>${blocks}</tbody></table></div>`;
  };
  componentMode = true;
  try {
    return `<section class="entity" id="entity-components"><h2>重要子公司及参股公司</h2><p class="table-note">各公司按整体口径列示，仅展示已披露项目；—表示该年无可用数据。持股比例不用于缩减资产、收入，归属份额有依据时另列。本组为补充分析，不与上方集团金额相加。</p>${table("asset")}${table("operating")}</section>`;
  } finally {
    componentMode = false;
  }
}

function entityView(entity, child = false) {
  if (entity.presentation?.mode === "evidence_only") return "";
  const children = (entity.subsidiaries || []).filter((item) => item.presentation?.mode !== "evidence_only");
  const heading = child || children.length
    ? `<h2>${esc(entity.name)} <small>${esc(entity.scope)}</small></h2>` : "";
  const cashText = cashNarrative(entity);
  const cash = cashText ? `<p><strong>现金流</strong>${esc(cashText)}</p>` : "";
  const equity = entity.narratives.equity ? `<p><strong>股权变化</strong>${esc(entity.narratives.equity)}</p>` : "";
  const source = entity.source_url ? `<p class="table-note"><a href="${esc(entity.source_url)}" target="_blank" rel="noopener">2025年报</a></p>` : "";
  const scope = entity.narratives.scope ? `<p class="table-note">${esc(entity.narratives.scope)}</p>` : "";
  const reconciliations = (entity.reconciliations || []).filter((item) => {
    const base = item.domain === "asset" ? assetMaterialityBases(entity.asset_table, entity.asset_table.periods).asset
      : operatingMaterialityBase(entity.operating_table, entity.operating_table.periods);
    return base === 0 ? item.difference !== 0 : Math.abs(item.difference) / base >= 0.03;
  }).map((item) => `<p class="table-note">${esc(item.period)}年${esc(item.label)}：已列金额间差额${esc(Number(item.difference).toPrecision(3))}（${esc(entity.unit)}）。</p>`).join("");
  const hasAssets = entity.asset_table.groups.length || entity.asset_table.disclosure_summary?.length || Object.keys(entity.asset_table.controls).length;
  const hasOperations = entity.operating_table.modules.some((m) => m.rows?.length || m.businesses?.some((b) => b.metrics.length));
  return `<section class="entity" id="entity-${esc(entity.id)}">${heading}${scope}${ownershipNote(entity)}${hasAssets ? assetTable(entity) : ""}${dilutionTable(entity)}${hasOperations ? operatingTable(entity) : ""}<div class="narratives">${equity}${cash}</div>${reconciliations}${source}</section>`
    + (entity.presentation?.component_tables ? componentTables(children, entity) : children.map((subsidiary) => entityView(subsidiary, true)).join(""));
}

function draw(focusSelector = "") {
  $("#company-content").innerHTML = entityView(company);
  if (focusSelector) document.querySelector(focusSelector)?.focus({preventScroll:true});
}

async function init() {
  const response = await fetch(document.body.dataset.report || "./report.json");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  company = await response.json();
  if (!company?.asset_table || !company?.operating_table) throw new Error("报告格式不完整");
  document.title = `${company.name} · 资产表与经营表 | AH Note`;
  $("#page-header").innerHTML = `<strong>${esc(company.name)} <small>${esc(company.code)}</small></strong><span>${esc(company.scope)} · ${esc(company.unit)}</span>`;
  draw();
  $("#company-content").addEventListener("click", (event) => {
    const button = event.target.closest("[data-period]");
    if (!button) return;
    const period = button.dataset.period;
    const entityId = button.closest(".entity").id;
    openPeriods.has(period) ? openPeriods.delete(period) : openPeriods.add(period);
    draw(`#${CSS.escape(entityId)} [data-period="${CSS.escape(period)}"][data-table="${CSS.escape(button.dataset.table)}"]`);
  });
}

init().catch((error) => { $("#company-content").innerHTML = `<p id="status" role="status">加载失败：${esc(error.message)}</p>`; });
