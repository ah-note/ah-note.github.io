#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "_source" / "stock_research"
NOTES_FILE = ROOT / "_source" / "user_stock_evaluations.md"
DATA_DIR = ROOT / "data"
STOCKS_DIR = ROOT / "stocks"
ASSET_PATH = "../../assets/styles.css"
APP_PATH = "assets/app.js"
TZ = ZoneInfo("Asia/Shanghai")


BUCKET_LABELS = {
    "profit_cheap": "赚钱且便宜",
    "liquidation_watch": "清算便宜",
}


def yuan_to_yi(value: float | int | None) -> float | None:
    if value is None:
        return None
    return round(float(value) / 100_000_000, 2)


def pct(value: float | int | None) -> float | None:
    if value is None:
        return None
    return round(float(value) * 100, 2)


def num(value: float | int | None, digits: int = 2) -> float | None:
    if value is None:
        return None
    return round(float(value), digits)


def parse_notes() -> dict[str, dict[str, str]]:
    if not NOTES_FILE.exists():
        return {}

    notes: dict[str, dict[str, str]] = {}
    for line in NOTES_FILE.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|") or "---" in line or "代码" in line:
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) < 6:
            continue
        code, company, note, tags, source, updated_at = cells[:6]
        if code:
            notes[code] = {
                "company": company,
                "note": note,
                "tags": tags,
                "source": source,
                "updated_at": updated_at,
            }
    return notes


def inline_markdown(text: str) -> str:
    escaped = html.escape(text)
    escaped = re.sub(r"`([^`]+)`", r"<code>\1</code>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        r'<a href="\2" target="_blank" rel="noopener">\1</a>',
        escaped,
    )
    return escaped


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def render_table(lines: list[str]) -> str:
    headers = split_table_row(lines[0])
    rows = [split_table_row(line) for line in lines[2:]]
    head = "".join(f"<th>{inline_markdown(cell)}</th>" for cell in headers)
    body_rows = []
    for row in rows:
        body_rows.append(
            "<tr>"
            + "".join(f"<td>{inline_markdown(cell)}</td>" for cell in row)
            + "</tr>"
        )
    return (
        '<div class="table-wrap"><table><thead><tr>'
        + head
        + "</tr></thead><tbody>"
        + "".join(body_rows)
        + "</tbody></table></div>"
    )


def markdown_to_html(markdown: str) -> str:
    lines = markdown.splitlines()
    out: list[str] = []
    paragraph: list[str] = []
    list_open = False
    i = 0

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            out.append("<p>" + inline_markdown(" ".join(paragraph)) + "</p>")
            paragraph = []

    def close_list() -> None:
        nonlocal list_open
        if list_open:
            out.append("</ul>")
            list_open = False

    while i < len(lines):
        line = lines[i].rstrip()
        if not line:
            flush_paragraph()
            close_list()
            i += 1
            continue

        if line.startswith("```"):
            flush_paragraph()
            close_list()
            code_lines: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(code_lines)) + "</code></pre>")
            continue

        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-{3,}", lines[i + 1]):
            flush_paragraph()
            close_list()
            table_lines = [line, lines[i + 1].rstrip()]
            i += 2
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i].rstrip())
                i += 1
            out.append(render_table(table_lines))
            continue

        heading = re.match(r"^(#{1,4})\s+(.+)$", line)
        if heading:
            flush_paragraph()
            close_list()
            level = len(heading.group(1))
            text = inline_markdown(heading.group(2))
            out.append(f'<h{level} id="{slugify(heading.group(2))}">{text}</h{level}>')
            i += 1
            continue

        bullet = re.match(r"^\s*[-*]\s+(.+)$", line)
        if bullet:
            flush_paragraph()
            if not list_open:
                out.append("<ul>")
                list_open = True
            out.append(f"<li>{inline_markdown(bullet.group(1))}</li>")
            i += 1
            continue

        paragraph.append(line)
        i += 1

    flush_paragraph()
    close_list()
    return "\n".join(out)


def slugify(text: str) -> str:
    slug = re.sub(r"\s+", "-", text.strip().lower())
    slug = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff.-]+", "", slug)
    return slug or "section"


def extract_summary(sections: dict[str, str]) -> tuple[str, str]:
    business = sections.get("business_story") or ""
    judgement = sections.get("earnback_story") or sections.get("risk_judgement") or ""
    return business[:180], judgement[:220]


def risk_level(result: dict) -> str:
    order = {"低": 1, "中": 2, "高": 3}
    highest = ""
    for item in result.get("risk_assessment") or []:
        level = item.get("overall_level") if isinstance(item, dict) else None
        if level in order and order[level] > order.get(highest, 0):
            highest = level
    return highest or "未分级"


def stock_sort_key(stock: dict) -> tuple[int, float, float]:
    bucket_rank = 0 if stock["bucket"] == "profit_cheap" else 1
    earnback = stock["owner_earnback_years"]
    if earnback is None:
        earnback = 9999
    cash_ratio = stock["discounted_net_cash_to_market_cap_pct"]
    return (bucket_rank, float(earnback), -float(cash_ratio or 0))


def load_stocks(notes: dict[str, dict[str, str]]) -> list[dict]:
    stocks: list[dict] = []
    for result_path in sorted(SOURCE_DIR.glob("*/*/result.json")):
        report_path = result_path.with_name("report.md")
        if not report_path.exists():
            continue
        result = json.loads(result_path.read_text(encoding="utf-8"))
        company = result.get("company") or {}
        metrics = result.get("metrics") or {}
        sections = result.get("sections") or {}
        code = company.get("code") or result_path.parents[1].name
        note = notes.get(code, {})
        business_summary, core_judgement = extract_summary(sections)
        market_cap_yi = yuan_to_yi(metrics.get("market_cap"))
        discounted_cash_yi = yuan_to_yi(metrics.get("discounted_detachable_net_cash"))
        stock = {
            "code": code,
            "name": company.get("name") or note.get("company") or code,
            "market": company.get("market") or ("HK" if code.endswith(".HK") else "A"),
            "period": result.get("period") or "2025-12-31",
            "currency": result.get("currency") or "CNY",
            "bucket": metrics.get("investment_case_type") or "unknown",
            "bucket_label": BUCKET_LABELS.get(metrics.get("investment_case_type"), "未分类"),
            "market_cap_yi": market_cap_yi,
            "pe_ttm": num(metrics.get("pe_ttm"), 2),
            "owner_earnback_years": num(metrics.get("owner_earnback_years"), 2),
            "owner_earnback_rate_pct": pct(metrics.get("owner_earnback_rate")),
            "market_profit_payback_years": num(metrics.get("market_profit_payback_years"), 2),
            "market_cash_profit_yield_pct": pct(metrics.get("market_cash_profit_yield")),
            "discounted_detachable_net_cash_yi": discounted_cash_yi,
            "discounted_net_cash_to_market_cap_pct": pct(
                (metrics.get("discounted_detachable_net_cash") or 0) / metrics.get("market_cap")
                if metrics.get("market_cap")
                else None
            ),
            "operating_business_price_yi": yuan_to_yi(metrics.get("operating_business_price_after_haircut") or metrics.get("operating_business_price")),
            "discounted_cash_profit_yi": yuan_to_yi(metrics.get("discounted_sustainable_cash_profit")),
            "revenue_yi": yuan_to_yi(metrics.get("revenue")),
            "gross_profit_yi": yuan_to_yi(metrics.get("gross_profit")),
            "parent_net_profit_yi": yuan_to_yi(metrics.get("parent_net_profit")),
            "gross_margin_pct": pct(metrics.get("gross_margin")),
            "risk_level": risk_level(result),
            "business_summary": business_summary,
            "core_judgement": core_judgement,
            "user_note": note.get("note", ""),
            "user_tags": [tag.strip() for tag in note.get("tags", "").split("；") if tag.strip()],
            "detail_url": f"stocks/{code}/",
            "_report_path": str(report_path),
        }
        stocks.append(stock)
    return sorted(stocks, key=stock_sort_key)


def fmt(value: object, suffix: str = "") -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, float):
        return f"{value:.2f}{suffix}"
    return f"{value}{suffix}"


def stat_block(label: str, value: str) -> str:
    return f'<div class="stat"><span>{html.escape(label)}</span><strong>{html.escape(value)}</strong></div>'


def render_index(stocks: list[dict], built_at: str) -> str:
    a_count = sum(1 for item in stocks if item["market"] == "A")
    hk_count = sum(1 for item in stocks if item["market"] == "HK")
    profit_count = sum(1 for item in stocks if item["bucket"] == "profit_cheap")
    liq_count = sum(1 for item in stocks if item["bucket"] == "liquidation_watch")
    stats = "\n".join(
        [
            stat_block("公司", str(len(stocks))),
            stat_block("A 股", str(a_count)),
            stat_block("港股", str(hk_count)),
            stat_block("赚钱且便宜", str(profit_count)),
            stat_block("清算便宜", str(liq_count)),
        ]
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AH Note 股票研究</title>
  <meta name="description" content="A 股和港股的 owner_earnback 股票分析报告。">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/styles.css">
</head>
<body>
  <header class="site-header">
    <div>
      <p class="eyebrow">AH Note</p>
      <h1>股票研究</h1>
      <p class="lead">按 owner_earnback 口径整理的 A 股与港股研究报告，重点展示市值、折后净现金、折后现金利润、回本年和人工备注。</p>
    </div>
    <div class="updated">更新：{html.escape(built_at)}</div>
  </header>

  <main>
    <section class="stats" aria-label="统计">{stats}</section>

    <section class="toolbar" aria-label="筛选">
      <input id="searchInput" type="search" placeholder="搜索代码、公司、业务、备注">
      <select id="marketFilter" aria-label="市场">
        <option value="all">全部市场</option>
        <option value="A">A 股</option>
        <option value="HK">港股</option>
      </select>
      <select id="bucketFilter" aria-label="榜单">
        <option value="all">全部榜单</option>
        <option value="profit_cheap">赚钱且便宜</option>
        <option value="liquidation_watch">清算便宜</option>
      </select>
      <select id="sortSelect" aria-label="排序">
        <option value="default">榜单优先</option>
        <option value="earnback">纯按回本年</option>
        <option value="cashProfit">按市值/现金利润</option>
        <option value="netCash">按折后净现金占市值</option>
        <option value="marketCap">按市值</option>
      </select>
      <label class="check"><input id="noteOnly" type="checkbox">只看有备注</label>
    </section>

    <section>
      <div class="section-head">
        <h2>股票表格</h2>
        <span id="resultCount"></span>
      </div>
      <div class="table-wrap stock-table">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>公司</th>
              <th>榜单</th>
              <th>PE</th>
              <th>回本年</th>
              <th>市值/现金利润</th>
              <th>市值</th>
              <th>折后净现金</th>
              <th>折后现金利润</th>
              <th>一句话业务</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody id="stockRows"></tbody>
        </table>
      </div>
    </section>
  </main>

  <script src="{APP_PATH}"></script>
</body>
</html>
"""


def render_detail(stock: dict, report_html: str, built_at: str) -> str:
    tags = "".join(f"<span>{html.escape(tag)}</span>" for tag in stock["user_tags"])
    note_block = ""
    if stock["user_note"]:
        note_block = f"""
        <section class="note-panel">
          <h2>人工备注</h2>
          <p>{html.escape(stock["user_note"])}</p>
          <div class="tags">{tags}</div>
        </section>"""
    metrics = [
        ("PE", fmt(stock["pe_ttm"])),
        ("回本年", fmt(stock["owner_earnback_years"])),
        ("市值/现金利润", fmt(stock["market_profit_payback_years"])),
        ("市值", fmt(stock["market_cap_yi"])),
        ("折后净现金", fmt(stock["discounted_detachable_net_cash_yi"])),
        ("折后现金利润", fmt(stock["discounted_cash_profit_yi"])),
    ]
    metric_html = "\n".join(stat_block(label, value) for label, value in metrics)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(stock["name"])} {html.escape(stock["code"])} - AH Note</title>
  <link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../../assets/styles.css">
</head>
<body>
  <header class="site-header detail-header">
    <div>
      <a class="back-link" href="../../">← 返回股票表格</a>
      <p class="eyebrow">{html.escape(stock["bucket_label"])} · {html.escape(stock["market"])}</p>
      <h1>{html.escape(stock["name"])} <span>{html.escape(stock["code"])}</span></h1>
      <p class="lead">{html.escape(stock["business_summary"])}</p>
    </div>
    <div class="updated">更新：{html.escape(built_at)}</div>
  </header>
  <main>
    <section class="stats detail-stats">{metric_html}</section>
    {note_block}
    <article class="report-content">
      {report_html}
    </article>
  </main>
</body>
</html>
"""


def write_detail_pages(stocks: list[dict], built_at: str) -> None:
    for stock in stocks:
        report_path = Path(stock["_report_path"])
        report_html = markdown_to_html(report_path.read_text(encoding="utf-8"))
        out_dir = STOCKS_DIR / stock["code"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_detail(stock, report_html, built_at), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    STOCKS_DIR.mkdir(exist_ok=True)
    built_at = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S +08:00")
    notes = parse_notes()
    stocks = load_stocks(notes)
    public_stocks = []
    for stock in stocks:
        public_stock = dict(stock)
        public_stock.pop("_report_path", None)
        public_stocks.append(public_stock)
    (DATA_DIR / "stocks.json").write_text(
        json.dumps({"built_at": built_at, "stocks": public_stocks}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (ROOT / "index.html").write_text(render_index(public_stocks, built_at), encoding="utf-8")
    write_detail_pages(stocks, built_at)
    print(f"generated {len(stocks)} stocks at {built_at}")


if __name__ == "__main__":
    main()
