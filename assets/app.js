const state = {
  stocks: [],
  filtered: [],
};

const els = {
  rows: document.querySelector("#stockRows"),
  resultCount: document.querySelector("#resultCount"),
  search: document.querySelector("#searchInput"),
  market: document.querySelector("#marketFilter"),
  bucket: document.querySelector("#bucketFilter"),
  sort: document.querySelector("#sortSelect"),
  noteOnly: document.querySelector("#noteOnly"),
};

function valueText(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "N/A";
  if (typeof value === "number") return value.toFixed(digits);
  return String(value);
}

function textIncludes(stock, query) {
  if (!query) return true;
  const haystack = [
    stock.code,
    stock.name,
    stock.bucket_label,
    stock.business_summary,
    stock.core_judgement,
    stock.user_note,
    ...(stock.user_tags || []),
  ].join(" ").toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function sortStocks(items, mode) {
  const copy = [...items];
  copy.sort((a, b) => {
    if (mode === "default") {
      const bucketDiff = bucketRank(a.bucket) - bucketRank(b.bucket);
      if (bucketDiff !== 0) return bucketDiff;
      return nullLast(a.owner_earnback_years) - nullLast(b.owner_earnback_years);
    }
    if (mode === "cashProfit") {
      return nullLast(a.market_profit_payback_years) - nullLast(b.market_profit_payback_years);
    }
    if (mode === "netCash") {
      return nullLast(b.discounted_net_cash_to_market_cap_pct, -9999) - nullLast(a.discounted_net_cash_to_market_cap_pct, -9999);
    }
    if (mode === "marketCap") {
      return nullLast(b.market_cap_yi, -1) - nullLast(a.market_cap_yi, -1);
    }
    return nullLast(a.owner_earnback_years) - nullLast(b.owner_earnback_years);
  });
  return copy;
}

function bucketRank(bucket) {
  if (bucket === "profit_cheap") return 0;
  if (bucket === "liquidation_watch") return 1;
  return 2;
}

function nullLast(value, fallback = 9999) {
  return value === null || value === undefined ? fallback : Number(value);
}

function riskClass(level) {
  if (level === "高") return "risk-high";
  if (level === "中") return "risk-mid";
  return "";
}

function renderRows(items) {
  els.resultCount.textContent = `${items.length} 只`;
  els.rows.innerHTML = items.map((stock) => {
    const tags = (stock.user_tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const note = stock.user_note
      ? `<div>${escapeHtml(stock.user_note)}</div><div class="tags">${tags}</div>`
      : `<span>无人工备注</span>`;
    return `
      <tr>
        <td><a href="${stock.detail_url}">${escapeHtml(stock.code)}</a></td>
        <td class="company-cell"><strong>${escapeHtml(stock.name)}</strong><span>${escapeHtml(stock.market)} · 风险 ${escapeHtml(stock.risk_level || "未分级")}</span></td>
        <td><span class="badge ${escapeHtml(stock.bucket)}">${escapeHtml(stock.bucket_label)}</span></td>
        <td>${valueText(stock.pe_ttm)}</td>
        <td>${valueText(stock.owner_earnback_years)}</td>
        <td>${valueText(stock.market_profit_payback_years)}</td>
        <td>${valueText(stock.market_cap_yi)}</td>
        <td>${valueText(stock.discounted_detachable_net_cash_yi)}</td>
        <td>${valueText(stock.discounted_cash_profit_yi)}</td>
        <td class="business-cell">${escapeHtml(stock.business_summary || "")}</td>
        <td class="note-cell ${riskClass(stock.risk_level)}">${note}</td>
      </tr>`;
  }).join("");
}

function applyFilters() {
  const query = els.search.value.trim();
  const market = els.market.value;
  const bucket = els.bucket.value;
  const noteOnly = els.noteOnly.checked;

  const filtered = state.stocks.filter((stock) => {
    if (market !== "all" && stock.market !== market) return false;
    if (bucket !== "all" && stock.bucket !== bucket) return false;
    if (noteOnly && !stock.user_note) return false;
    return textIncludes(stock, query);
  });

  state.filtered = sortStocks(filtered, els.sort.value);
  renderRows(state.filtered);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function init() {
  const response = await fetch("data/stocks.json");
  const data = await response.json();
  state.stocks = data.stocks || [];
  for (const el of [els.search, els.market, els.bucket, els.sort, els.noteOnly]) {
    el.addEventListener("input", applyFilters);
    el.addEventListener("change", applyFilters);
  }
  applyFilters();
}

init().catch((error) => {
  els.rows.innerHTML = `<tr><td colspan="11">加载失败：${escapeHtml(error.message)}</td></tr>`;
});
