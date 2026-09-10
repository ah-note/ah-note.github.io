from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from collections import Counter
from pathlib import Path
from typing import Any


CATALOG_SCHEMA = "ah-note-industry-catalog-v5"
SNAPSHOT_RELATIVE_DIR = Path("data/snapshots/industry_classification/ah_v4")
REQUIRED_SNAPSHOT_FILES = (
    "taxonomy.json",
    "issuer-map.jsonl",
    "representatives.jsonl",
    "security-seeds.jsonl",
    "coverage-audit.json",
)


@contextmanager
def prepared_industry_snapshot(stock_analysis_root: Path, recipe: Path | None, snapshot: Path | None):
    """Keep a recipe-built input alive only for this build; never silently fall back."""
    if recipe is None:
        yield snapshot
        return
    if snapshot is not None:
        raise ValueError('choose a recipe or a snapshot, not both')
    repository = stock_analysis_root.resolve()
    with tempfile.TemporaryDirectory(prefix='ah-note-industry-') as temporary:
        output = Path(temporary) / 'reviewed'
        environment = dict(os.environ, PYTHONPATH=str(repository / 'src'))
        result = subprocess.run([
            sys.executable, '-m', 'stock_analysis.industry_classification.business_review',
            '--recipe', str(recipe.resolve()), '--repository', str(repository), '--output', str(output),
        ], cwd=repository, env=environment, capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError('industry recipe build failed: ' + (result.stderr or result.stdout)[-4000:])
        validate_industry_snapshot(repository, output)
        yield output


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def validate_industry_snapshot(stock_analysis_root: Path, snapshot: Path | None = None) -> Path:
    """Validate the external snapshot before a site build mutates generated files."""
    classification_dir = Path(snapshot).resolve() if snapshot else Path(stock_analysis_root).resolve() / SNAPSHOT_RELATIVE_DIR
    missing = [
        name for name in REQUIRED_SNAPSHOT_FILES if not snapshot or name not in {"representatives.jsonl", "security-seeds.jsonl"}
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
            if (classification_dir / name).exists():
                read_jsonl(classification_dir / name)
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise RuntimeError(f"invalid industry classification snapshot under {classification_dir}: {error}") from error
    required_taxonomy_keys = {"industries", "sectors", "subsectors", "analysis_leaves"}
    missing_keys = sorted(required_taxonomy_keys - set(taxonomy))
    if missing_keys:
        raise RuntimeError(
            "industry taxonomy is missing required keys: " + ", ".join(missing_keys)
        )
    if audit.get("final_validation_errors") or audit.get("validation_errors"):
        raise RuntimeError("industry classification snapshot did not pass final validation")
    return classification_dir


def review_projection(issuer: dict[str, Any], *, pending_review: bool = False) -> dict[str, Any]:
    """Keep unverified US and changed-boundary candidates out of industry memberships."""
    review = issuer.get("business_review") or {}
    excluded = str(issuer.get("eligibility_status", "")).startswith("no_analysis_value.")
    primary_verified = review.get("primary_review_status") == "verified" and str(review.get("source", "")).startswith("https://")
    complete = primary_verified and all(review.get(k) == "verified" for k in
                                        ("exposure_review_status", "eligibility_review_status"))
    pending = (pending_review or "US" in issuer.get("markets", []) or
               issuer.get("classification_review_status") == "shared_leaf_review_required") and not primary_verified
    state = "excluded" if excluded else "complete" if complete else "primary_verified" if primary_verified else "pending" if pending else "existing"
    primary = issuer.get("primary_leaf_id") if not pending and not excluded else None
    candidates = list(dict.fromkeys(x for x in [issuer.get("primary_leaf_id"),
                                  *(issuer.get("secondary_leaf_ids") or [])] if x)) if pending else []
    exposures = issuer.get("material_exposure_leaf_ids") or []
    evidence = issuer.get("material_exposure_evidence") or []
    if pending or excluded or (review and review.get("exposure_review_status") != "verified"):
        exposures, evidence = [], []
    return {"review_status": state, "primary_leaf_id": primary, "candidate_leaf_ids": candidates,
            "material_exposure_leaf_ids": exposures, "material_exposure_evidence": evidence,
            "browse_eligible": bool(primary) and issuer.get("eligibility_status") == "eligible",
            "classification_evidence": issuer.get("classification_evidence") or {},
            "reviewed_at": review.get("reviewed_at"),
            "exposure_review_status": review.get("exposure_review_status", "not_recorded")}


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
    supplemental_snapshot: Path | None = None,
) -> dict[str, Any]:
    classification_dir = Path(classification_dir)
    taxonomy = json.loads((classification_dir / "taxonomy.json").read_text(encoding="utf-8"))
    issuers = read_jsonl(classification_dir / "issuer-map.jsonl")
    def optional_rows(name: str) -> list[dict[str, Any]]:
        for folder in (classification_dir, supplemental_snapshot):
            if folder is not None and (folder / name).is_file():
                return read_jsonl(folder / name)
        return []
    representatives = optional_rows("representatives.jsonl")
    security_seeds = optional_rows("security-seeds.jsonl")
    audit = json.loads((classification_dir / "coverage-audit.json").read_text(encoding="utf-8"))
    pending_ids = {r["issuer_id"] for r in read_jsonl(classification_dir / "review-queue.jsonl")} if (classification_dir / "review-queue.jsonl").exists() else set()

    leaf_ids = {row["leaf_id"] for row in taxonomy["analysis_leaves"]}
    invalid = [
        row["issuer_id"]
        for row in issuers
        if row.get("eligibility_status") == "eligible"
        and row.get("primary_leaf_id") not in leaf_ids
        and not (row.get("primary_leaf_id") is None and review_projection(row)["review_status"] == "pending")
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
    if audit.get("final_validation_errors") or audit.get("validation_errors"):
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
        projection = review_projection(issuer, pending_review=issuer["issuer_id"] in pending_ids)
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
                **projection,
                "secondary_leaf_ids": [],
                "analysis_model": issuer["analysis_model"],
                "confidence": issuer["classification_confidence"],
                "status": status,
                "status_reason": issuer["eligibility_reason"],
                "representative_rank": representative_rank.get(issuer["issuer_id"]) if projection["browse_eligible"] else None,
                "report_url": f"../reports/{report_code}/" if report_code else "",
            }
        )

    manifest_path = classification_dir / 'build-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    provenance = {key: manifest[key] for key in ('schema_version', 'generator', 'taxonomy_version',
                  'recipe_sha256', 'decisions_sha256', 'source_files_sha256', 'output_files_sha256') if key in manifest}
    return {
        "schema_version": CATALOG_SCHEMA,
        "classification_provenance": provenance,
        "classification_generated_at": audit["generated_at"],
        "taxonomy_effective_date": taxonomy["effective_date"],
        "classification_status": audit.get("status", "existing"),
        "summary": {
            "security_count": sum(len(r["securities"]) for r in public_issuers),
            "issuer_count": len(public_issuers),
            "eligible_issuer_count": sum(r["browse_eligible"] for r in public_issuers),
            "excluded_issuer_count": sum(r["status"].startswith("no_analysis_value.") for r in public_issuers),
            "representative_count": sum(bool(r["representative_rank"]) for r in public_issuers),
            "review_queue_count": audit.get("review_issuer_count", audit.get("review_queue_count", 0)),
            "review_status_counts": dict(Counter(r["review_status"] for r in public_issuers)),
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


def render_industry_index(asset_version: str, *, include_us: bool = False) -> str:
    markets = "A股 · 港股 · 美股" if include_us else "A股 · 港股"
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>公司行业导航 - AH Note</title>
  <meta name="description" content="搜索公司名称或证券代码，查看行业归属、核准状态和同类公司。">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/styles.css?v={asset_version}">
</head>
<body>
  <nav class="site-nav"><a href="../">股票</a><a href="../reports/">报告</a><a href="../research/">深度研报</a><a class="active" href="">行业</a><a href="../reference/">参考资料</a></nav>
  <main class="industry-page">
    <header class="industry-heading">
      <div>
        <p class="eyebrow">{markets}</p>
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
    snapshot: Path | None = None,
) -> dict[str, int]:
    classification_dir = validate_industry_snapshot(stock_analysis_root, snapshot)
    catalog = build_industry_catalog(classification_dir, Path(root) / "data/stocks.json",
                                     Path(stock_analysis_root) / SNAPSHOT_RELATIVE_DIR if snapshot else None)
    data_path = Path(root) / "data/industry-classification.json"
    page_dir = Path(root) / "industries"
    data_path.parent.mkdir(parents=True, exist_ok=True)
    page_dir.mkdir(parents=True, exist_ok=True)
    data_path.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    (page_dir / "index.html").write_text(
        render_industry_index(asset_version, include_us=any("US" in r["markets"] for r in catalog["issuers"])), encoding="utf-8"
    )
    return {
        "issuer_count": len(catalog["issuers"]),
        "leaf_count": len(catalog["leaves"]),
    }
