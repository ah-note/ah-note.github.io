(() => {
  "use strict";

  const app = document.getElementById("industryApp");
  const input = document.getElementById("industrySearch");
  const button = document.getElementById("industrySearchButton");
  const results = document.getElementById("searchResults");
  const hint = document.getElementById("searchHint");
  const meta = document.getElementById("catalogMeta");
  let catalog;
  let nodeByKey;
  let childrenByKey;
  let issuerById;
  let issuersByLeaf;
  let countsByNode;
  let leafPath;

  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value) => String(value ?? "")
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\s+/g, "");

  const keyOf = (type, id) => `${type}:${id}`;
  const linkTo = (kind, value, label, className = "") =>
    `<a${className ? ` class="${className}"` : ""} href="#${kind}=${encodeURIComponent(value)}">${escapeHtml(label)}</a>`;

  function prepare(data) {
    catalog = data;
    nodeByKey = new Map();
    childrenByKey = new Map([["root", []]]);
    issuerById = new Map(data.issuers.map((issuer) => [issuer.id, issuer]));
    issuersByLeaf = new Map(data.leaves.map((leaf) => [leaf.leaf_id, []]));
    countsByNode = new Map([["root", 0]]);
    leafPath = new Map();

    const addNode = (type, id, name, parentKey) => {
      const key = keyOf(type, id);
      const node = { key, type, id, name, parentKey };
      nodeByKey.set(key, node);
      if (!childrenByKey.has(parentKey)) childrenByKey.set(parentKey, []);
      childrenByKey.get(parentKey).push(node);
      if (!childrenByKey.has(key)) childrenByKey.set(key, []);
      countsByNode.set(key, 0);
      return node;
    };

    data.display_nodes.forEach((row) => addNode(row.type, row.id, row.name, row.parent_key));

    data.leaves.forEach((leaf) => {
      const path = [];
      let node = nodeByKey.get(data.leaf_display_keys[leaf.leaf_id]);
      while (node) {
        path.unshift(node);
        node = nodeByKey.get(node.parentKey);
      }
      leafPath.set(leaf.leaf_id, path);
    });

    data.issuers.forEach((issuer) => {
      if (!(issuer.browse_eligible ?? (issuer.status === "eligible"))) return;
      const memberships = [...new Set([
        issuer.primary_leaf_id,
        ...(issuer.material_exposure_leaf_ids || []),
      ].filter(Boolean))];
      memberships.forEach((leafId) => issuersByLeaf.get(leafId)?.push(issuer));
      countsByNode.set("root", countsByNode.get("root") + 1);
      const countedNodes = new Set();
      memberships.forEach((leafId) => (leafPath.get(leafId) || []).forEach((node) => countedNodes.add(node.key)));
      countedNodes.forEach((nodeKey) => {
        const node = nodeByKey.get(nodeKey);
        countsByNode.set(node.key, countsByNode.get(node.key) + 1);
      });
    });
    issuersByLeaf.forEach((rows) => rows.sort((a, b) => a.name.localeCompare(b.name, "zh-CN")));
    childrenByKey.forEach((rows) => rows.sort((a, b) => b.type === "leaf" ? a.name.localeCompare(b.name, "zh-CN") : a.id.localeCompare(b.id)));
  }

  function breadcrumb(nodes, currentCompany = "") {
    const items = [linkTo("category", "root", "全部行业")];
    nodes.forEach((node) => items.push(linkTo("category", node.key, node.name)));
    if (currentCompany) items.push(`<span>${escapeHtml(currentCompany)}</span>`);
    return `<nav class="industry-breadcrumb" aria-label="行业路径">${items.join("<i>›</i>")}</nav>`;
  }

  function companyCode(issuer) {
    return issuer.securities.map((security) => security.code).join(" / ");
  }

  function companyLink(issuer, compact = false) {
    const markers = [
      issuer.representative_rank ? '<span class="company-marker">代表</span>' : "",
      issuer.report_url ? '<span class="company-marker report">有报告</span>' : "",
      issuer.review_status && issuer.review_status !== "existing" ? `<span class="company-marker">${reviewLabel(issuer)}</span>` : "",
    ].join("");
    return `${linkTo("company", issuer.id, issuer.name, "industry-company-link")} ${markers}`
      + `<small>${escapeHtml(companyCode(issuer))}${compact ? "" : ` · ${escapeHtml(issuer.markets.join("/"))}`}</small>`;
  }

  function reviewLabel(issuer) {
    return ({ complete: "完整核准", primary_verified: "主业已核", pending: "待核准", excluded: "已排除", existing: "既有分类" })[issuer.review_status] || "既有分类";
  }

  function childCards(parentKey) {
    const children = (childrenByKey.get(parentKey) || []).filter((node) => countsByNode.get(node.key) > 0);
    if (!children.length) return "";
    return `<section class="industry-section"><div class="industry-section-head"><h2>下一级分类</h2><span>${children.length} 个</span></div>`
      + `<div class="industry-node-grid">${children.map((node) => `
        <a class="industry-node-card" href="#category=${encodeURIComponent(node.key)}">
          <span>${escapeHtml(node.name)}</span><strong>${countsByNode.get(node.key).toLocaleString("zh-CN")}</strong><small>家公司</small>
        </a>`).join("")}</div></section>`;
  }

  function descendantLeaves(nodeKey) {
    const target = nodeByKey.get(nodeKey);
    if (nodeKey !== "root" && !target) return [];
    return catalog.leaves
      .map((leaf) => ({ id: leaf.leaf_id, name: leaf.name_zh }))
      .filter((leaf) => nodeKey === "root" || leafPath.get(leaf.id).some((part) => part.key === nodeKey));
  }

  function groupedCompanies(nodeKey) {
    const groups = descendantLeaves(nodeKey)
      .map((leaf) => ({ leaf, issuers: issuersByLeaf.get(leaf.id) || [] }))
      .filter((group) => group.issuers.length);
    if (!groups.length) return "";
    const uniqueCount = new Set(groups.flatMap(group => group.issuers.map(issuer => issuer.id))).size;
    return `<section class="industry-section"><div class="industry-section-head"><h2>股票列表</h2><span>${uniqueCount.toLocaleString("zh-CN")} 家（跨类重复展示）</span></div>`
      + `<div class="industry-leaf-groups">${groups.map(({ leaf, issuers }) => `
        <details class="industry-leaf-group"${groups.length <= 8 || issuers.length <= 30 ? " open" : ""}>
          <summary><span>${escapeHtml(leaf.name)}</span><strong>${issuers.length}</strong></summary>
          <div class="industry-company-grid">${issuers.map((issuer) => `<div class="industry-company">${companyLink(issuer)}</div>`).join("")}</div>
        </details>`).join("")}</div></section>`;
  }

  function renderCategory(nodeKey) {
    if (nodeKey === "excluded") return renderExcluded();
    if (nodeKey === "pending") return renderPending();
    const node = nodeKey === "root" ? null : nodeByKey.get(nodeKey);
    if (nodeKey !== "root" && !node) return renderNotFound("没有找到这个行业分类。");
    const path = node ? (() => {
      const parts = [];
      let current = node;
      while (current) {
        parts.unshift(current);
        current = nodeByKey.get(current.parentKey);
      }
      return parts;
    })() : [];
    const title = node ? node.name : "全部行业";
    const count = countsByNode.get(nodeKey) || 0;
    const excludedCard = nodeKey === "root" ? `
      <a class="industry-node-card excluded" href="#category=excluded">
        <span>无分析价值类</span><strong>${catalog.summary.excluded_issuer_count}</strong><small>家公司</small>
      </a>` : "";
    const pendingCount = catalog.issuers.filter((r) => ["pending", "primary_verified"].includes(r.review_status)).length;
    const pendingCard = nodeKey === "root" && pendingCount ? `<a class="industry-node-card" href="#category=pending"><span>待完成核准</span><strong>${pendingCount}</strong><small>家公司</small></a>` : "";
    app.innerHTML = `${breadcrumb(path.slice(0, -1))}
      <header class="industry-view-head"><div><p>${node ? "当前分类" : "分类总览"}</p><h2>${escapeHtml(title)}</h2></div><strong>${count.toLocaleString("zh-CN")}<small> 家公司</small></strong></header>
      ${childCards(nodeKey)}
      ${excludedCard || pendingCard ? `<section class="industry-section"><div class="industry-node-grid">${excludedCard}${pendingCard}</div></section>` : ""}
      ${nodeKey === "root" ? "" : groupedCompanies(nodeKey)}`;
  }

  function renderExcluded() {
    const excluded = catalog.issuers.filter((issuer) => issuer.status.startsWith("no_analysis_value."));
    app.innerHTML = `${breadcrumb([])}
      <header class="industry-view-head excluded"><div><p>单独归档</p><h2>无分析价值类</h2></div><strong>${excluded.length}<small> 家公司</small></strong></header>
      <p class="industry-view-note">当前快照中包括 ST、退市整理等有明确排除证据的公司；仍可搜索并查看其行业归属，但不进入代表公司和经营分析队列。</p>
      <section class="industry-section"><div class="industry-company-grid">${excluded.map((issuer) => `<div class="industry-company">${companyLink(issuer)}<em>${escapeHtml(issuer.status_reason)}</em></div>`).join("")}</div></section>`;
  }

  function renderPending() {
    const pending = catalog.issuers.filter((r) => ["pending", "primary_verified"].includes(r.review_status));
    app.innerHTML = `${breadcrumb([])}<h2>待完成核准 · ${pending.length} 家</h2><p>候选归属不计入正式行业成员；主业已核的公司仍可能有其他重大业务待核。</p><div class="industry-company-grid">${pending.map((r) => `<div class="industry-company">${companyLink(r)}</div>`).join("")}</div>`;
  }

  function classificationPath(leafId) {
    return leafPath.get(leafId) || [];
  }

  function renderCompany(id) {
    const issuer = issuerById.get(id);
    if (!issuer) return renderNotFound("没有找到这家公司。");
    const path = classificationPath(issuer.primary_leaf_id);
    const leaf = path[path.length - 1];
    const peers = (issuersByLeaf.get(issuer.primary_leaf_id) || []).filter((row) => row.id !== issuer.id);
    const modelNames = {
      ordinary_operating: "一般经营企业",
      financial: "金融企业",
      project_asset: "项目与资产主导企业",
      holding_company: "多元控股企业",
      pre_revenue_rd: "研发前商业化企业",
    };
    const confidenceNames = { high: "高", medium: "中", low: "低", insufficient: "不足" };
    const status = issuer.status.startsWith("no_analysis_value.") ? "无分析价值类" : issuer.status === "eligible" ? reviewLabel(issuer) : "分析资格待核";
    const materialExposures = (issuer.material_exposure_leaf_ids || []).length
      ? `<div class="company-secondary"><span>重大业务暴露</span>${issuer.material_exposure_leaf_ids.map((leafId) => {
          const node = nodeByKey.get(catalog.leaf_display_keys[leafId]);
          return node ? linkTo("category", node.key, node.name) : "";
        }).join("")}</div>` : "";
    const report = issuer.report_url
      ? `<a class="industry-report-link" href="${escapeHtml(issuer.report_url)}">查看经营分析报告 →</a>`
      : '<span class="industry-no-report">暂无公开经营分析报告</span>';
    const primaryClassification = path.length
      ? path.map((node) => linkTo("category", node.key, node.name)).join(" <i>›</i> ")
      : issuer.review_status === "pending" ? "尚未核准" : "未纳入行业浏览";
    const candidates = (issuer.candidate_leaf_ids || []).map((id) => catalog.leaves.find((r) => r.leaf_id === id)?.name_zh).filter(Boolean);
    const candidateNote = candidates.length ? `<p class="industry-view-note">候选类别（待核）：${escapeHtml(candidates.join("、"))}</p>` : "";
    const evidence = issuer.classification_evidence || {};
    const evidenceNote = /^https:\/\//.test(evidence.source || "") ? `<p class="industry-view-note"><a href="${escapeHtml(evidence.source)}" target="_blank" rel="noopener noreferrer">${escapeHtml(evidence.source_document || "分类来源")}</a>${evidence.period_end ? ` · ${escapeHtml(evidence.period_end)}` : ""}</p>` : "";
    const exposurePending = issuer.exposure_review_status === "pending" ? '<p class="industry-view-note">重大跨行业业务尚待核准。</p>' : "";
    const peersSection = leaf ? `
      <section class="industry-section"><div class="industry-section-head"><h2>${escapeHtml(leaf.name)}的其他公司</h2><span>${peers.length} 家</span></div>
        ${peers.length ? `<div class="industry-company-grid">${peers.map((peer) => `<div class="industry-company">${companyLink(peer)}</div>`).join("")}</div>` : '<p class="industry-empty">当前没有其他合资格公司。</p>'}
      </section>` : "";
    app.innerHTML = `${breadcrumb(path, issuer.name)}
      <article class="company-profile">
        <div class="company-title-row"><div><p>${escapeHtml(companyCode(issuer))}</p><h2>${escapeHtml(issuer.name)}</h2></div><span class="status-pill ${issuer.status === "eligible" ? "eligible" : "excluded"}">${status}</span></div>
        <div class="company-classification"><span>主分类</span><strong>${primaryClassification}</strong></div>
        ${candidateNote}${evidenceNote}${exposurePending}
        <dl class="company-meta"><div><dt>市场</dt><dd>${escapeHtml(issuer.markets.join(" / "))}</dd></div><div><dt>分析模型</dt><dd>${escapeHtml(modelNames[issuer.analysis_model] || issuer.analysis_model)}</dd></div><div><dt>分类置信度</dt><dd>${escapeHtml(confidenceNames[issuer.confidence] || issuer.confidence)}</dd></div><div><dt>行业代表</dt><dd>${issuer.representative_rank ? `第 ${issuer.representative_rank} 顺位` : "否"}</dd></div></dl>
        ${materialExposures}
        <div class="company-report-action">${report}</div>
      </article>${peersSection}`;
  }

  function renderNotFound(message) {
    app.innerHTML = `<section class="industry-empty-state"><h2>${escapeHtml(message)}</h2><a href="#category=root">返回全部行业</a></section>`;
  }

  function searchScore(issuer, query) {
    const values = issuer.search_terms.map(normalize);
    if (values.some((value) => value === query)) return 0;
    if (values.some((value) => value.startsWith(query))) return 1;
    if (values.some((value) => value.includes(query))) return 2;
    return 99;
  }

  function runSearch() {
    const query = normalize(input.value);
    if (!query) {
      results.hidden = true;
      results.innerHTML = "";
      hint.textContent = "也可以从下方行业树逐层浏览。";
      return;
    }
    const matches = catalog.issuers
      .map((issuer) => ({ issuer, score: searchScore(issuer, query) }))
      .filter((row) => row.score < 99)
      .sort((a, b) => a.score - b.score || a.issuer.name.localeCompare(b.issuer.name, "zh-CN"));
    const shown = matches.slice(0, 80);
    hint.textContent = matches.length > 80 ? `找到 ${matches.length} 家，显示最相关的 80 家` : `找到 ${matches.length} 家`;
    results.hidden = false;
    results.innerHTML = shown.length ? shown.map(({ issuer }) => {
      const path = classificationPath(issuer.primary_leaf_id);
      const category = path.length ? path.map((node) => node.name).join(" › ") : issuer.status.startsWith("no_analysis_value.") ? "无分析价值类" : "分类待核准";
      return `<a class="industry-search-result" href="#company=${encodeURIComponent(issuer.id)}"><span><strong>${escapeHtml(issuer.name)}</strong><small>${escapeHtml(companyCode(issuer))}</small></span><em>${escapeHtml(category)}</em></a>`;
    }).join("") : '<p class="industry-empty">没有匹配公司，请检查名称或代码。</p>';
  }

  function route() {
    if (!catalog) return;
    results.hidden = true;
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.has("company")) renderCompany(params.get("company"));
    else renderCategory(params.get("category") || "root");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  let searchTimer;
  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 100);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") runSearch();
  });
  button.addEventListener("click", runSearch);
  window.addEventListener("hashchange", route);

  fetch(window.AH_INDUSTRY_CATALOG_URL || "../data/industry-classification.json")
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => {
      prepare(data);
      meta.textContent = `${data.summary.issuer_count.toLocaleString("zh-CN")} 家公司 · ${data.summary.eligible_issuer_count.toLocaleString("zh-CN")} 家已归类${data.classification_status === "draft" ? " · 校准中" : ""} · 分类基准 ${data.taxonomy_effective_date}`;
      route();
    })
    .catch(() => {
      meta.textContent = "行业数据暂时不可用";
      renderNotFound("行业数据加载失败，请稍后刷新。");
    });
})();
