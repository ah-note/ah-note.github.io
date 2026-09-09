from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any


CATALOG_SCHEMA = "ah-note-industry-catalog-v4"
SNAPSHOT_RELATIVE_DIR = Path("data/snapshots/industry_classification/ah_v4")
REQUIRED_SNAPSHOT_FILES = (
    "taxonomy.json",
    "issuer-map.jsonl",
    "representatives.jsonl",
    "security-seeds.jsonl",
    "coverage-audit.json",
)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def validate_industry_snapshot(stock_analysis_root: Path) -> Path:
    """Validate the external snapshot before a site build mutates generated files."""
    classification_dir = Path(stock_analysis_root).resolve() / SNAPSHOT_RELATIVE_DIR
    missing = [
        name for name in REQUIRED_SNAPSHOT_FILES
        if not (classification_dir / name).is_file()
    ]
    if missing:
        raise RuntimeError(
            f"industry classification snapshot is incomplete under {classification_dir}: "
            + ", ".join(missing)
        )
    try:
        taxonomy = json.loads((classification_dir / "taxonomy.json").read_text(encoding="utf-8"))
        audit = json.loads((classification_dir / "coverage-audit.json").read_text(encoding="utf-8"))
        for name in ("issuer-map.jsonl", "representatives.jsonl", "security-seeds.jsonl"):
            read_jsonl(classification_dir / name)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"invalid industry classification snapshot under {classification_dir}: {error}") from error
    required_taxonomy_keys = {"industries", "sectors", "subsectors", "analysis_leaves"}
    missing_keys = sorted(required_taxonomy_keys - set(taxonomy))
    if missing_keys:
        raise RuntimeError(
            "industry taxonomy is missing required keys: " + ", ".join(missing_keys)
        )
    if audit.get("final_validation_errors"):
        raise RuntimeError("industry classification snapshot did not pass final validation")
    return classification_dir


def _published_report_codes(path: Path) -> set[str]:
    if not path.exists():
        return set()
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        str(row.get("code") or "").upper()
        for row in payload.get("stocks") or []
        if row.get("code")
    }


def build_display_taxonomy(taxonomy: dict[str, Any]) -> tuple[list[dict[str, str]], dict[str, str]]:
    """Collapse consecutive same-name levels without changing source taxonomy."""
    display_nodes: list[dict[str, str]] = []
    display_by_key: dict[str, dict[str, str]] = {}
    source_to_display: dict[str, str] = {}

    def add_node(node_type: str, node_id: str, name: str, source_parent_key: str) -> None:
        source_key = f"{node_type}:{node_id}"
        parent_key = source_to_display.get(source_parent_key, "root")
        parent = display_by_key.get(parent_key)
        if parent and parent["name"].strip() == name.strip():
            source_to_display[source_key] = parent_key
            return
        node = {
            "key": source_key,
            "type": node_type,
            "id": node_id,
            "name": name,
            "parent_key": parent_key,
        }
        display_nodes.append(node)
        display_by_key[source_key] = node
        source_to_display[source_key] = source_key

    for row in taxonomy["industries"]:
        add_node("industry", row["industry_id"], row["name_zh"], "root")
    for row in taxonomy["sectors"]:
        add_node(
            "sector",
            row["sector_id"],
            row["name_zh"],
            f"industry:{row['industry_id']}",
        )
    for row in taxonomy["subsectors"]:
        add_node(
            "subsector",
            row["subsector_id"],
            row["name_zh"],
            f"sector:{row['sector_id']}",
        )
    for row in taxonomy["analysis_leaves"]:
        add_node(
            "leaf",
            row["leaf_id"],
            row["name_zh"],
            f"subsector:{row['subsector_id']}",
        )

    leaf_display_keys = {
        row["leaf_id"]: source_to_display[f"leaf:{row['leaf_id']}"]
        for row in taxonomy["analysis_leaves"]
    }
    return display_nodes, leaf_display_keys


def build_industry_catalog(
    classification_dir: Path,
    published_stocks_path: Path,
) -> dict[str, Any]:
    classification_dir = Path(classification_dir)
    taxonomy = json.loads((classification_dir / "taxonomy.json").read_text(encoding="utf-8"))
    issuers = read_jsonl(classification_dir / "issuer-map.jsonl")
    representatives = read_jsonl(classification_dir / "representatives.jsonl")
    security_seeds = read_jsonl(classification_dir / "security-seeds.jsonl")
    audit = json.loads((classification_dir / "coverage-audit.json").read_text(encoding="utf-8"))

    leaf_ids = {row["leaf_id"] for row in taxonomy["analysis_leaves"]}
    invalid = [
        row["issuer_id"]
        for row in issuers
        if row.get("eligibility_status") == "eligible"
        and row.get("primary_leaf_id") not in leaf_ids
    ]
    if invalid:
        raise ValueError(f"industry catalog contains invalid primary leaves: {invalid[:10]}")
    invalid_exposures = [
        row["issuer_id"]
        for row in issuers
        if any(
            leaf not in leaf_ids or leaf == row.get("primary_leaf_id")
            for leaf in row.get("material_exposure_leaf_ids") or []
        )
    ]
    if invalid_exposures:
        raise ValueError(
            f"industry catalog contains invalid material exposures: {invalid_exposures[:10]}"
        )
    if audit.get("final_validation_errors"):
        raise ValueError("industry classification snapshot did not pass final validation")

    aliases_by_security = {
        row["security_id"]: [str(value) for value in row.get("aliases") or [] if value]
        for row in security_seeds
    }
    representative_rank = {
        row["issuer_id"]: int(row["leaf_representative_rank"])
        for row in representatives
    }
    report_codes = _published_report_codes(published_stocks_path)
    public_issuers: list[dict[str, Any]] = []
    status_counts: Counter[str] = Counter()
    display_nodes, leaf_display_keys = build_display_taxonomy(taxonomy)

    for issuer in issuers:
        status = str(issuer["eligibility_status"])
        status_counts[status] += 1
        securities = []
        search_terms: list[str] = []
        for security in issuer.get("securities") or []:
            symbol = str(security.get("symbol") or "").upper()
            security_id = str(security.get("security_id") or "")
            name = str(security.get("name") or "")
            securities.append({"code": symbol, "name": name})
            search_terms.extend([symbol, symbol.split(".", 1)[0], security_id, name])
            search_terms.extend(aliases_by_security.get(security_id, []))
        search_terms.append(str(issuer["issuer_name"]))
        search_terms = list(dict.fromkeys(value.strip() for value in search_terms if value.strip()))
        report_code = next(
            (security["code"] for security in securities if security["code"] in report_codes),
            "",
        )
        public_issuers.append(
            {
                "id": issuer["issuer_id"],
                "name": issuer["issuer_name"],
                "markets": issuer["markets"],
                "securities": securities,
                "search_terms": search_terms,
                "primary_leaf_id": issuer["primary_leaf_id"],
                "secondary_leaf_ids": issuer.get("secondary_leaf_ids") or [],
                "material_exposure_leaf_ids": issuer.get("material_exposure_leaf_ids") or [],
                "material_exposure_evidence": issuer.get("material_exposure_evidence") or [],
                "analysis_model": issuer["analysis_model"],
                "confidence": issuer["classification_confidence"],
                "status": status,
                "status_reason": issuer["eligibility_reason"],
                "representative_rank": representative_rank.get(issuer["issuer_id"]),
                "report_url": f"../reports/{report_code}/" if report_code else "",
            }
        )

    return {
        "schema_version": CATALOG_SCHEMA,
        "classification_generated_at": audit["generated_at"],
        "taxonomy_effective_date": taxonomy["effective_date"],
        "summary": {
            "security_count": audit["security_count"],
            "issuer_count": audit["issuer_count"],
            "eligible_issuer_count": audit["eligible_issuer_count"],
            "excluded_issuer_count": audit["excluded_issuer_count"],
            "representative_count": audit["representative_count"],
            "review_queue_count": audit["review_queue_count"],
            "status_counts": dict(status_counts),
        },
        "industries": taxonomy["industries"],
        "sectors": taxonomy["sectors"],
        "subsectors": taxonomy["subsectors"],
        "leaves": taxonomy["analysis_leaves"],
        "display_nodes": display_nodes,
        "leaf_display_keys": leaf_display_keys,
        "issuers": public_issuers,
    }


def render_industry_index(asset_version: str) -> str:
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>公司行业导航 - AH Note</title>
  <meta name="description" content="搜索 A 股和港股公司，查看所属行业、同类公司和完整行业层级。">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/styles.css?v={asset_version}">
</head>
<body>
  <nav class="site-nav"><a href="../">股票</a><a href="../reports/">报告</a><a href="../research/">深度研报</a><a class="active" href="">行业</a><a href="../reference/">参考资料</a></nav>
  <main class="industry-page">
    <header class="industry-heading">
      <div>
        <p class="eyebrow">A股 · 港股</p>
        <h1>公司行业导航</h1>
      </div>
      <p id="catalogMeta" class="industry-meta">正在读取行业分类…</p>
    </header>
    <section class="industry-search" aria-labelledby="industrySearchLabel">
      <label id="industrySearchLabel" for="industrySearch">输入公司名称或股票代码</label>
      <div class="industry-search-row">
        <input id="industrySearch" type="search" autocomplete="off" placeholder="例如：中国能建、601868、02020.HK">
        <button id="industrySearchButton" type="button">搜索</button>
      </div>
      <p id="searchHint" class="industry-hint">也可以从下方行业树逐层浏览。</p>
      <div id="searchResults" class="industry-search-results" hidden></div>
    </section>
    <div id="industryApp" aria-live="polite">
      <p class="industry-loading">正在加载公司与行业数据…</p>
    </div>
  </main>
  <script>window.AH_INDUSTRY_CATALOG_URL = "../data/industry-classification.json?v={asset_version}";</script>
  <script src="../assets/industries.js?v={asset_version}" defer></script>
</body>
</html>
"""


def write_industry_site(
    *,
    root: Path,
    stock_analysis_root: Path,
    asset_version: str,
) -> dict[str, int]:
    classification_dir = validate_industry_snapshot(stock_analysis_root)
    catalog = build_industry_catalog(classification_dir, Path(root) / "data/stocks.json")
    data_path = Path(root) / "data/industry-classification.json"
    page_dir = Path(root) / "industries"
    data_path.parent.mkdir(parents=True, exist_ok=True)
    page_dir.mkdir(parents=True, exist_ok=True)
    data_path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (page_dir / "index.html").write_text(
        render_industry_index(asset_version), encoding="utf-8"
    )
    return {
        "issuer_count": len(catalog["issuers"]),
        "leaf_count": len(catalog["leaves"]),
    }
