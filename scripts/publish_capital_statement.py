"""Publish one validated capital-statement year into the AH Note capital catalog."""
import argparse
import html
import json
import re
from pathlib import Path

from import_capital_year import install


def company_page(name: str, code: str) -> str:
    title = html.escape(name)
    safe_code = html.escape(code)
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · 资本表 | AH Note</title>
<link rel="stylesheet" href="/assets/styles.css?v=20260910-capital-1">
<link rel="stylesheet" href="/value-line/tan-assets/compare.css?v=20260910-capital-1">
<link rel="stylesheet" href="/value-line/tan-assets/simple.css?v=20260910-capital-1">
<script>globalThis.TAN_COMPARE=true;</script>
<script defer src="/value-line/berun-assets/fields.js?v=20260910-capital-1"></script>
<script defer src="/value-line/tan-assets/mapping.js?v=20260910-capital-1"></script>
<script defer src="/value-line/tan-assets/activities.js?v=20260910-capital-1"></script>
<script defer src="/value-line/tan-assets/annual.js?v=20260910-capital-1"></script>
<script defer src="/value-line/tan-assets/multi.js?v=20260910-capital-1"></script>
<script defer src="/value-line/tan-assets/compare.js?v=20260910-capital-1"></script></head>
<body><nav class="site-nav"><a href="/">股票</a><a href="/reports/">报告</a><a href="/research/">深度研报</a><a href="/industries/">行业</a><a class="active" href="/capital/">资本表</a><a href="/reference/">参考资料</a></nav>
<main><header><strong>{title} <small>{safe_code}</small></strong><span id="filing-currency">合并口径</span></header>
<div id="comparison"></div><p id="compare-status" role="status"></p>
<footer id="view-help">点击年份展开或收起当年明细，两表联动。</footer>
<details class="page-notes" id="legacy-notes" hidden><summary>历史口径说明</summary></details>
</main></body></html>
'''


def catalog_page(entries: list[dict]) -> str:
    rows = "".join(
        f'<tr><td><a href="{html.escape(item["slug"])}/">{html.escape(item["name"])}</a></td>'
        f'<td>{html.escape(item["code"])}</td><td>{html.escape(item["currency"])}</td>'
        f'<td>{"、".join(map(str, item["years"]))}</td></tr>' for item in entries
    )
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>资本表 | AH Note</title><link rel="stylesheet" href="../assets/styles.css?v=20260910-capital-1"></head>
<body><nav class="site-nav"><a href="../">股票</a><a href="../reports/">报告</a><a href="../research/">深度研报</a><a href="../industries/">行业</a><a class="active" href="">资本表</a><a href="../reference/">参考资料</a></nav>
<main class="report-list-page"><section class="report-list"><h1>资本表</h1><div class="table-wrap"><table><thead><tr><th>公司</th><th>代码</th><th>呈报货币</th><th>年度</th></tr></thead><tbody>{rows}</tbody></table></div></section></main></body></html>
'''


def publish(source: Path, site_root: Path, name: str, code: str, run_id: str, bundle_sha: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9._-]+", code):
        raise ValueError("INVALID_CAPITAL_CODE")
    capital_root = site_root / "capital"
    company_root = capital_root / code
    relative = install(source, company_root, code, run_id, bundle_sha)
    company_root.joinpath("index.html").write_text(company_page(name, code), encoding="utf-8")
    catalog_path = capital_root / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else {"schema": "capital-catalog-v1", "companies": []}
    manifest = json.loads(company_root.joinpath("annual-manifest.json").read_text(encoding="utf-8"))
    entry = {"name": name, "code": code, "slug": code, "currency": manifest["currency"],
             "years": sorted(map(int, manifest["years"]))}
    catalog["companies"] = sorted([item for item in catalog["companies"] if item["code"] != code] + [entry], key=lambda item: item["code"])
    capital_root.mkdir(parents=True, exist_ok=True)
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    capital_root.joinpath("index.html").write_text(catalog_page(catalog["companies"]), encoding="utf-8")
    return relative


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--site-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--name", required=True)
    parser.add_argument("--code", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--bundle-sha", required=True)
    args = parser.parse_args()
    print(publish(Path(args.input), Path(args.site_root), args.name, args.code, args.run_id, args.bundle_sha))
