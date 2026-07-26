#!/usr/bin/env python3
from __future__ import annotations

import html
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "_source" / "stock_research"
NOTES_FILE = ROOT / "_source" / "user_stock_evaluations.md"
DATA_DIR = ROOT / "data"
STOCKS_DIR = ROOT / "stocks"
REPORTS_DIR = ROOT / "reports"
REFERENCE_DIR = ROOT / "reference"
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
    business = compact_text(sections.get("business_story") or "", 150)
    judgement = compact_text(sections.get("earnback_story") or sections.get("risk_judgement") or "", 220)
    return business, judgement


def compact_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip("，。；、 ") + "..."


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
            "detail_url": f"reports/{code}/",
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


def nav(current: str, prefix: str = "") -> str:
    items = [("榜单", "index", ""), ("报告", "reports", "reports/"), ("参考资料", "reference", "reference/")]
    links = []
    for label, key, href in items:
        cls = ' class="active"' if key == current else ""
        links.append(f'<a{cls} href="{prefix}{href}">{html.escape(label)}</a>')
    return '<nav class="site-nav">' + "".join(links) + "</nav>"


def stock_table(stocks: list[dict]) -> str:
    rows = []
    for stock in stocks:
        note = html.escape(stock["user_note"]) if stock["user_note"] else ""
        rows.append(
            "<tr>"
            f'<td><a href="{html.escape(stock["detail_url"])}">{html.escape(stock["code"])}</a></td>'
            f'<td>{html.escape(stock["name"])}</td>'
            f"<td>{fmt(stock['pe_ttm'])}</td>"
            f"<td>{fmt(stock['owner_earnback_years'])}</td>"
            f"<td>{fmt(stock['market_profit_payback_years'])}</td>"
            f"<td>{fmt(stock['market_cap_yi'])}</td>"
            f"<td>{fmt(stock['discounted_detachable_net_cash_yi'])}</td>"
            f"<td>{fmt(stock['discounted_cash_profit_yi'])}</td>"
            f'<td class="business-cell">{html.escape(stock["business_summary"])}</td>'
            f'<td class="note-cell">{note}</td>'
            "</tr>"
        )
    return """
      <div class="table-wrap stock-table">
        <table>
          <thead>
            <tr>
              <th>代码</th>
              <th>公司</th>
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
          <tbody>
            """ + "\n".join(rows) + """
          </tbody>
        </table>
      </div>
    """


def render_index(stocks: list[dict], built_at: str) -> str:
    profit_stocks = [item for item in stocks if item["bucket"] == "profit_cheap"]
    liquidation_stocks = [item for item in stocks if item["bucket"] == "liquidation_watch"]
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
  {nav("index")}
  <main class="board-page">
    <section class="ranking-section">
      <h1>赚钱且便宜榜</h1>
      {stock_table(profit_stocks)}
    </section>

    <section class="ranking-section">
      <h1>清算便宜榜</h1>
      {stock_table(liquidation_stocks)}
    </section>
  </main>
</body>
</html>
"""


def render_reports_index(stocks: list[dict], built_at: str) -> str:
    cards = []
    for stock in stocks:
        note = f'<p class="report-note">{html.escape(stock["user_note"])}</p>' if stock["user_note"] else ""
        cards.append(
            f"""
            <article class="report-card">
              <a href="{html.escape(stock["code"])}/">
                <span>{html.escape(stock["bucket_label"])} · {html.escape(stock["market"])}</span>
                <h2>{html.escape(stock["name"])} {html.escape(stock["code"])}</h2>
                <p>{html.escape(stock["business_summary"])}</p>
                {note}
              </a>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>研究报告 - AH Note</title>
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/styles.css">
</head>
<body>
  {nav("reports", "../")}
  <main class="reports-page">
    <h1>研究报告</h1>
    <div class="report-list">
      {"".join(cards)}
    </div>
  </main>
</body>
</html>
"""


def render_reference() -> str:
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>参考资料 - AH Note</title>
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/styles.css">
</head>
<body>
  {nav("reference", "../")}
  <main class="reference-page">
    <h1>参考资料</h1>
    <section class="reference-block">
      <h2>榜单口径</h2>
      <p>赚钱且便宜榜：折后现金利润能在约 15 年内覆盖市值或经营业务购买价的公司。</p>
      <p>清算便宜榜：利润回本不进入第一类，但折后净现金或可清算资产相对市值有观察价值的公司。</p>
    </section>
    <section class="reference-block">
      <h2>核心字段</h2>
      <p>市值、折后净现金、折后现金利润和回本年均来自 owner_earnback 分析结果，展示单位默认为亿元人民币。</p>
      <p>一句话业务来自研究报告结构化结果中的 <code>sections.business_story</code>，用于在榜单页快速识别公司实际做什么。</p>
    </section>
  </main>
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
  {nav("reports", "../../")}
  <main class="report-page">
    <a class="back-link" href="../">← 返回报告</a>
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
        out_dir = REPORTS_DIR / stock["code"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_detail(stock, report_html, built_at), encoding="utf-8")


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    if STOCKS_DIR.exists():
        shutil.rmtree(STOCKS_DIR)
    if REPORTS_DIR.exists():
        shutil.rmtree(REPORTS_DIR)
    if REFERENCE_DIR.exists():
        shutil.rmtree(REFERENCE_DIR)
    REPORTS_DIR.mkdir(exist_ok=True)
    REFERENCE_DIR.mkdir(exist_ok=True)
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
    (REPORTS_DIR / "index.html").write_text(render_reports_index(public_stocks, built_at), encoding="utf-8")
    (REFERENCE_DIR / "index.html").write_text(render_reference(), encoding="utf-8")
    write_detail_pages(stocks, built_at)
    print(f"generated {len(stocks)} stocks at {built_at}")


if __name__ == "__main__":
    main()
