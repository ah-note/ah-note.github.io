#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import csv
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from site_sources import ResearchDocument, UNIFIED_SCHEMA, load_research_documents


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "_source" / "stock_research"
NOTES_FILE = ROOT / "_source" / "user_stock_evaluations.md"
STOCK_REPORT_DIR = ROOT.parent / "stock_report"
STOCK_ANALYSIS_DIR = ROOT.parent / "stock_analysis"
DATA_DIR = ROOT / "data"
STOCKS_DIR = ROOT / "stocks"
REPORTS_DIR = ROOT / "reports"
REFERENCE_DIR = ROOT / "reference"
TZ = ZoneInfo("Asia/Shanghai")
ASSET_VERSION = "20260726-1"


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


def parse_notes(stock_report_root: Path = STOCK_REPORT_DIR) -> dict[str, dict[str, str]]:
    canonical_notes = stock_report_root / "data" / "notes" / "user_stock_evaluations.md"
    notes_file = canonical_notes if canonical_notes.exists() else NOTES_FILE
    if not notes_file.exists():
        return {}

    notes: dict[str, dict[str, str]] = {}
    for line in notes_file.read_text(encoding="utf-8").splitlines():
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


def normalize_code(raw_code: str, market: str | None = None) -> str:
    code = raw_code.strip().replace("\ufeff", "")
    if not code:
        return ""
    if "." in code:
        return code.upper()
    if market == "HK" or len(code) == 5:
        return f"{code.zfill(5)}.HK"
    return code.zfill(6)


def name_is_chinese(name: str) -> bool:
    return bool(re.search(r"[\u4e00-\u9fff]", name))


def add_name(mapping: dict[str, str], code: str, name: str) -> None:
    code = code.strip().upper()
    name = name.strip()
    if not code or not name or not name_is_chinese(name):
        return
    if code not in mapping or not name_is_chinese(mapping[code]):
        mapping[code] = name


def parse_markdown_name_tables(mapping: dict[str, str], root: Path) -> None:
    if not root.exists():
        return
    for path in sorted(root.glob("*.md")):
        for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line.startswith("|") or "---" in line or "代码" in line:
                continue
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if len(cells) < 3:
                continue
            code = cells[1] if re.search(r"\d{3,5}\.(?:HK|SZ|SH|BJ)", cells[1], re.I) else cells[0]
            name = cells[2] if code == cells[1] else cells[1]
            add_name(mapping, normalize_code(code), name)


def parse_csv_name_file(mapping: dict[str, str], path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            raw_code = row.get("stock_code") or row.get("ts_code") or row.get("symbol") or ""
            market = row.get("exchange") or row.get("MARKET") or ""
            name = row.get("stock_name") or row.get("name") or row.get("fullname") or row.get("SECURITY_NAME_ABBR") or ""
            code = normalize_code(str(raw_code), "HK" if str(market).upper() in {"HK", "HKEX"} else None)
            add_name(mapping, code, str(name))


def load_chinese_names(notes: dict[str, dict[str, str]], stock_report_root: Path = STOCK_REPORT_DIR) -> dict[str, str]:
    mapping: dict[str, str] = {}
    add_name(mapping, "01416.HK", "CTR控股")
    for code, note in notes.items():
        add_name(mapping, code, note.get("company", ""))

    parse_markdown_name_tables(mapping, stock_report_root / "data" / "outputs" / "hk_owner_earnback_notes")
    parse_markdown_name_tables(mapping, stock_report_root / "data" / "outputs" / "a_share_owner_earnback_notes")

    imported = STOCK_ANALYSIS_DIR / "data" / "imported" / "stock" / "processed_lists"
    for filename in [
        "hk_stocks_simple_final.csv",
        "hk_stock_codes_final.csv",
        "all_stocks_simple_final.csv",
        "all_stocks_combined_final.csv",
    ]:
        parse_csv_name_file(mapping, imported / filename)
    return mapping


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
    business = make_one_line_business(sections)
    judgement = compact_text(sections.get("earnback_story") or sections.get("risk_judgement") or "", 220)
    return business, judgement


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[。！？；])", text)
    return [part.strip(" ，。；") for part in parts if part.strip(" ，。；")]


def compact_text(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip("，。；、 ") + "..."


def strip_numbers(text: str) -> str:
    text = re.sub(r"\d+(?:\.\d+)?\s*(?:亿元|亿港元|万元|元|%|个百分点|bp|万台|家|天|年|个月)", "", text)
    text = re.sub(r"\d+(?:\.\d+)?", "", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"[，、；]\s*[，、；]+", "，", text)
    return text.strip(" ，。；、")


def extract_main_business(business_story: str) -> str:
    first = split_sentences(business_story)
    text = first[0] if first else business_story
    patterns = [
        r"公司卖的是([^，。；]+)",
        r"公司主要卖([^，。；]+)",
        r"公司主业是([^，。；]+)",
        r"收入主要来自([^，。；]+)",
        r"收入几乎全部来自([^，。；]+)",
        r"收入主体来自([^，。；]+)",
        r"公司收入来自([^。；]+)",
        r"收入来自([^。；]+)",
        r"公司只有(?:一个)?经营分部：([^，。；]+)",
        r"公司是([^，。；]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            clause = strip_numbers(match.group(1))
            return "主业是" + compact_text(clause, 34)
    text = re.sub(r"^公司", "", text)
    text = strip_numbers(text)
    return compact_text("主业是" + text, 38)


def extract_profit_source(sections: dict[str, str]) -> str:
    candidates = split_sentences(sections.get("business_story") or "") + split_sentences(sections.get("profit_bridge") or "")
    for sentence in candidates:
        if "是核心" in sentence and "业务" not in sentence:
            clause = re.split(r"是核心", sentence, 1)[0]
            clause = re.split(r"[，；。]", clause)[-1]
            return "利润主要靠" + compact_text(strip_numbers(clause), 34)
        if "是利润核心" in sentence:
            clause = sentence.split("是利润核心", 1)[0]
            clause = re.split(r"[，；。]", clause)[-1]
            return "利润主要靠" + compact_text(strip_numbers(clause), 34)
        if "贡献最大分部利润" in sentence:
            clause = sentence.split("贡献最大分部利润", 1)[0]
            clause = re.split(r"[，；。]", clause)[-1]
            return "利润主要靠" + compact_text(strip_numbers(clause), 34)
        match = re.search(r"毛利主要受(.+?)影响", sentence)
        if match:
            return "利润主要受" + compact_text(strip_numbers(match.group(1)), 38) + "影响"
        if "毛利主要" in sentence:
            return compact_text(strip_numbers(sentence.replace("毛利主要", "利润主要")), 46)
        if "真正需要观察的是" in sentence:
            clause = sentence.split("真正需要观察的是", 1)[1]
            return "利润主要看" + compact_text(strip_numbers(clause), 38)
        if "利润主要" in sentence:
            return compact_text(strip_numbers(sentence), 46)
        if "说明" in sentence and ("毛利率" in sentence or "毛利" in sentence):
            clause = sentence.split("说明", 1)[1]
            if "问题" in clause:
                continue
            if "而是" in clause:
                clause = clause.split("而是", 1)[1]
            return "利润主要靠" + compact_text(strip_numbers(clause), 38)

    gross_margin = sections.get("_gross_margin")
    if isinstance(gross_margin, (int, float)):
        if gross_margin >= 0.5:
            return "利润主要靠高毛利品类、品牌或服务溢价"
        if gross_margin < 0.15:
            return "利润较薄，主要靠规模周转和费用控制"
    return "利润主要靠主营毛利和费用控制"


def business_model_phrase(sections: dict[str, str]) -> str:
    metrics = sections.get("_metrics") if isinstance(sections.get("_metrics"), dict) else {}
    business_story = sections.get("business_story") or ""
    profit_bridge = sections.get("profit_bridge") or ""
    combined_story = business_story + profit_bridge
    if any(keyword in combined_story for keyword in ["保险服务收入", "财险", "寿险", "再保险"]):
        return "模式是保险承保和投资资产共同驱动，资产负债表决定利润波动"
    if any(keyword in combined_story for keyword in ["证券", "放贷", "保证金", "客户独立账户", "投资公司", "金融服务"]):
        return "模式是金融资产周转，现金质量取决于客户款、监管资金和投资/信用风险"

    parts: list[str] = []
    gross_margin = metrics.get("gross_margin")
    if isinstance(gross_margin, (int, float)):
        if gross_margin >= 0.5:
            parts.append("高毛利")
        elif gross_margin < 0.15:
            parts.append("低毛利")
        else:
            parts.append("中等毛利")

    profit = metrics.get("parent_net_profit") or metrics.get("net_profit")
    free_cash_flow = metrics.get("operating_free_cash_flow")
    if isinstance(profit, (int, float)) and profit > 0 and isinstance(free_cash_flow, (int, float)):
        ratio = free_cash_flow / profit
        if ratio >= 1:
            parts.append("现金转化好")
        elif ratio >= 0.5:
            parts.append("现金转化尚可")
        else:
            parts.append("现金转化偏弱")

    total_assets = metrics.get("total_assets")
    funds_assets = metrics.get("funds_assets")
    operating_assets = metrics.get("operating_assets")
    if isinstance(total_assets, (int, float)) and total_assets > 0:
        if isinstance(funds_assets, (int, float)) and funds_assets / total_assets >= 0.45:
            parts.append("资金资产厚")
        elif isinstance(operating_assets, (int, float)) and operating_assets / total_assets >= 0.55:
            parts.append("经营资产占用重")

    financing_liabilities = metrics.get("financing_liabilities")
    if isinstance(total_assets, (int, float)) and total_assets > 0 and isinstance(financing_liabilities, (int, float)):
        if financing_liabilities / total_assets < 0.05:
            parts.append("有息负债低")

    if not parts:
        parts.append("资产负债表周转驱动")

    asset_story = sections.get("asset_story") or ""
    asset_tail = ""
    if "客户独立账户" in asset_story or "监管" in asset_story:
        asset_tail = "，现金质量取决于监管资金和客户款边界"
    elif "存货" in asset_story and "应收" in asset_story:
        asset_tail = "，资产占用主要看库存和应收回款"
    elif "定存" in asset_story or "理财" in asset_story:
        asset_tail = "，资产端有较多现金、定存或理财"
    elif "固定资产" in asset_story or "在建工程" in asset_story:
        asset_tail = "，仍需要持续投入经营资产"

    return "模式是" + "、".join(parts[:4]) + asset_tail


def make_one_line_business(sections: dict[str, str]) -> str:
    business_story = sections.get("business_story") or ""
    main = extract_main_business(business_story)
    profit = extract_profit_source(sections)
    model = business_model_phrase(sections)
    return compact_text(f"{main}；{profit}；{model}。", 135)


def margin_applicability(sections: dict[str, str], metrics: dict) -> tuple[bool, bool]:
    business_story = sections.get("business_story") or ""
    profit_bridge = sections.get("profit_bridge") or ""
    combined = business_story + profit_bridge
    non_operating_keywords = [
        "公允价值",
        "FVTPL",
        "FVPL",
        "投资收益",
        "证券出售",
        "持有收益",
        "处置收益",
        "减值转回",
        "估值收益",
        "投资物业估值",
    ]
    non_comparable_business = [
        "Chapter 21",
        "investment holding",
        "投资公司",
        "投资组合",
        "自营投资",
        "证券经纪",
        "保证金融资",
        "放贷",
        "资管",
        "金融服务",
        "保险服务收入",
        "财险",
        "寿险",
        "再保险",
    ]
    if any(keyword in combined for keyword in non_comparable_business):
        return (False, False)

    gross_profit = metrics.get("gross_profit")
    parent_net_profit = metrics.get("parent_net_profit")
    operating_profit = metrics.get("operating_profit")
    profit_base = gross_profit if isinstance(gross_profit, (int, float)) and gross_profit > 0 else None
    if (
        profit_base
        and isinstance(parent_net_profit, (int, float))
        and parent_net_profit > profit_base * 1.05
        and any(keyword in combined for keyword in non_operating_keywords)
    ):
        return (True, False)
    if (
        profit_base
        and isinstance(operating_profit, (int, float))
        and operating_profit > profit_base * 1.2
        and any(keyword in combined for keyword in non_operating_keywords)
    ):
        return (True, False)
    return (True, True)


def risk_level(result: dict) -> str:
    order = {"低": 1, "中": 2, "高": 3}
    highest = ""
    for item in result.get("risk_assessment") or []:
        level = item.get("overall_level") if isinstance(item, dict) else None
        if level in order and order[level] > order.get(highest, 0):
            highest = level
    return highest or "未分级"


def stock_sort_key(stock: dict) -> tuple[float, float]:
    earnback = stock["owner_earnback_years"]
    if earnback is None:
        earnback = 9999
    cash_ratio = stock["discounted_net_cash_to_market_cap_pct"]
    return (float(earnback), -float(cash_ratio or 0))


def display_name_for(code: str, fallback: str, chinese_names: dict[str, str]) -> str:
    base_code = code.split(".", 1)[0]
    return chinese_names.get(code) or chinese_names.get(base_code) or fallback


def stock_from_document(
    document: ResearchDocument,
    notes: dict[str, dict[str, str]],
    chinese_names: dict[str, str],
) -> dict:
    result = document.result
    company = result.get("company") or {}
    metrics = result.get("metrics") or {}
    sections = result.get("sections") or {}
    business = result.get("business") or {}
    earnback = result.get("owner_earnback") or {}
    sections_for_summary = dict(sections)
    sections_for_summary["_metrics"] = metrics
    sections_for_summary["_gross_margin"] = metrics.get("gross_margin")
    code = str(company.get("code") or document.result_path.parents[1].name).upper()
    note = notes.get(code, {})
    raw_name = company.get("display_name") or company.get("name") or note.get("company") or code
    display_name = (
        raw_name
        if result.get("schema_version") == UNIFIED_SCHEMA and name_is_chinese(str(raw_name))
        else display_name_for(code, raw_name, chinese_names)
    )
    generated_summary, generated_judgement = extract_summary(sections_for_summary)
    business_summary = compact_text(str(business.get("one_line") or generated_summary), 180)
    core_judgement = compact_text(str(earnback.get("interpretation") or generated_judgement), 240)
    market_cap_yi = yuan_to_yi(metrics.get("market_cap"))
    discounted_cash_yi = yuan_to_yi(metrics.get("discounted_detachable_net_cash"))
    if result.get("schema_version") == UNIFIED_SCHEMA:
        gross_margin_usable = isinstance(metrics.get("gross_margin"), (int, float))
        net_margin_usable = isinstance(metrics.get("net_margin"), (int, float))
    else:
        gross_margin_usable, net_margin_usable = margin_applicability(sections, metrics)
    net_margin = metrics.get("net_margin")
    if net_margin is None and metrics.get("revenue"):
        net_margin = (metrics.get("parent_net_profit") or 0) / metrics["revenue"]
    discounted_cash_ratio = metrics.get("discounted_net_cash_to_market_cap")
    if discounted_cash_ratio is None and metrics.get("market_cap"):
        discounted_cash_ratio = (metrics.get("discounted_detachable_net_cash") or 0) / metrics["market_cap"]
    return {
        "schema_version": result.get("schema_version") or "legacy",
        "code": code,
        "name": display_name,
        "raw_name": raw_name,
        "market": company.get("market") or ("HK" if code.endswith(".HK") else "A"),
        "period": result.get("period") or document.result_path.parent.name,
        "currency": result.get("currency") or "CNY",
        "market_cap_yi": market_cap_yi,
        "pe_ttm": num(metrics.get("pe_ttm"), 2),
        "owner_earnback_years": num(metrics.get("owner_earnback_years"), 2),
        "owner_earnback_rate_pct": pct(metrics.get("owner_earnback_rate")),
        "market_profit_payback_years": num(metrics.get("market_profit_payback_years"), 2),
        "market_cash_profit_yield_pct": pct(metrics.get("market_cash_profit_yield")),
        "discounted_detachable_net_cash_yi": discounted_cash_yi,
        "discounted_net_cash_to_market_cap_pct": pct(discounted_cash_ratio),
        "operating_business_price_yi": yuan_to_yi(
            metrics.get("operating_business_price_after_haircut") or metrics.get("operating_business_price")
        ),
        "discounted_cash_profit_yi": yuan_to_yi(metrics.get("discounted_sustainable_cash_profit")),
        "revenue_yi": yuan_to_yi(metrics.get("revenue")),
        "gross_profit_yi": yuan_to_yi(metrics.get("gross_profit")),
        "parent_net_profit_yi": yuan_to_yi(metrics.get("parent_net_profit")),
        "gross_margin_pct": pct(metrics.get("gross_margin")) if gross_margin_usable else None,
        "net_margin_pct": pct(net_margin) if net_margin_usable else None,
        "forecast_dividend_yield_pct": pct(metrics.get("forecast_dividend_yield")),
        "risk_level": risk_level(result),
        "business_summary": business_summary,
        "core_judgement": core_judgement,
        "user_note": note.get("note", ""),
        "user_tags": [tag.strip() for tag in note.get("tags", "").split("；") if tag.strip()],
        "detail_url": f"reports/{code}/",
        "_report_path": str(document.report_path),
    }


def load_stocks(
    notes: dict[str, dict[str, str]],
    chinese_names: dict[str, str],
    legacy_source_dir: Path = SOURCE_DIR,
    stock_report_root: Path = STOCK_REPORT_DIR,
) -> list[dict]:
    stocks: list[dict] = []
    for document in load_research_documents(legacy_source_dir, stock_report_root):
        stocks.append(stock_from_document(document, notes, chinese_names))
    return sorted(stocks, key=stock_sort_key)


def load_published_stocks() -> list[dict]:
    path = DATA_DIR / "stocks.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload.get("stocks") if isinstance(payload.get("stocks"), list) else []


def merge_published_stocks(published: list[dict], sourced: list[dict]) -> list[dict]:
    merged = {str(stock.get("code") or "").upper(): dict(stock) for stock in published if stock.get("code")}
    for stock in sourced:
        code = str(stock.get("code") or "").upper()
        current = merged.get(code)
        candidate_rank = (str(stock.get("period") or ""), 1 if stock.get("schema_version") == UNIFIED_SCHEMA else 0)
        current_rank = (
            str(current.get("period") or ""),
            1 if current.get("schema_version") == UNIFIED_SCHEMA else 0,
        ) if current else None
        if current_rank is None or candidate_rank >= current_rank:
            merged[code] = dict(stock)
    return sorted(merged.values(), key=stock_sort_key)


def fmt(value: object, suffix: str = "") -> str:
    if value is None or value == "":
        return "N/A"
    if isinstance(value, float):
        return f"{value:.2f}{suffix}"
    return f"{value}{suffix}"


def nav(current: str, prefix: str = "") -> str:
    items = [("股票", "index", ""), ("报告", "reports", "reports/"), ("参考资料", "reference", "reference/")]
    links = []
    for label, key, href in items:
        cls = ' class="active"' if key == current else ""
        links.append(f'<a{cls} href="{prefix}{href}">{html.escape(label)}</a>')
    return '<nav class="site-nav">' + "".join(links) + "</nav>"


def sort_value(stock: dict, key: str) -> float | None:
    value = stock.get(key)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def relative_sort_options(stocks: list[dict]) -> list[tuple[str, str, str]]:
    options = [
        ("owner_earnback_years", "回本年", "asc"),
        ("pe_ttm", "PE", "asc"),
        ("forecast_dividend_yield_pct", "预测分红率", "desc"),
        ("gross_margin_pct", "毛利率", "desc"),
        ("net_margin_pct", "净利率", "desc"),
        ("market_profit_payback_years", "市值/现金利润", "asc"),
        ("market_cash_profit_yield_pct", "现金利润收益率", "desc"),
        ("discounted_net_cash_to_market_cap_pct", "净现金/市值", "desc"),
    ]
    return options


def sort_stocks_for_index(stocks: list[dict], key: str = "owner_earnback_years", direction: str = "asc") -> list[dict]:
    descending = direction == "desc"

    def key_fn(stock: dict) -> tuple[int, float]:
        value = sort_value(stock, key)
        if value is None:
            return (1, 0)
        return (0, -value if descending else value)

    return sorted(stocks, key=key_fn)


def stock_table(stocks: list[dict]) -> str:
    rows = []
    for stock in stocks:
        note = html.escape(stock["user_note"]) if stock["user_note"] else ""
        data_attrs = {
            "pe_ttm": stock.get("pe_ttm"),
            "owner_earnback_years": stock.get("owner_earnback_years"),
            "gross_margin_pct": stock.get("gross_margin_pct"),
            "net_margin_pct": stock.get("net_margin_pct"),
            "market_profit_payback_years": stock.get("market_profit_payback_years"),
            "market_cash_profit_yield_pct": stock.get("market_cash_profit_yield_pct"),
            "discounted_net_cash_to_market_cap_pct": stock.get("discounted_net_cash_to_market_cap_pct"),
            "forecast_dividend_yield_pct": stock.get("forecast_dividend_yield_pct"),
        }
        attrs = " ".join(
            f'data-{key.replace("_", "-")}="{html.escape(str(value))}"'
            for key, value in data_attrs.items()
            if value is not None
        )
        rows.append(
            f"<tr {attrs}>"
            f'<td><a href="{html.escape(stock["detail_url"])}">{html.escape(stock["code"])}</a></td>'
            f'<td>{html.escape(stock["name"])}</td>'
            f"<td>{fmt(stock['pe_ttm'])}</td>"
            f"<td>{fmt(stock.get('forecast_dividend_yield_pct'), '%')}</td>"
            f"<td>{fmt(stock['gross_margin_pct'], '%')}</td>"
            f"<td>{fmt(stock['net_margin_pct'], '%')}</td>"
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
        <table id="stockTable">
          <thead>
            <tr>
              <th>代码</th>
              <th>公司</th>
              <th>PE</th>
              <th>预测分红率</th>
              <th>毛利率</th>
              <th>净利率</th>
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
    options = relative_sort_options(stocks)
    option_html = "".join(
        f'<option value="{html.escape(key)}" data-direction="{html.escape(direction)}"{" selected" if key == "owner_earnback_years" else ""}>{html.escape(label)}</option>'
        for key, label, direction in options
    )
    sorted_stocks = sort_stocks_for_index(stocks)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AH Note 股票研究</title>
  <meta name="description" content="A 股和港股的统一股票研究报告。">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/styles.css?v={ASSET_VERSION}">
</head>
<body>
  {nav("index")}
  <main class="board-page">
    <section class="ranking-section">
      <div class="table-tools">
        <label>
          <span>排序</span>
          <select id="sortBy">
            {option_html}
          </select>
        </label>
      </div>
      {stock_table(sorted_stocks)}
    </section>
  </main>
  <script>
    (() => {{
      const select = document.getElementById("sortBy");
      const table = document.getElementById("stockTable");
      if (!select || !table) return;
      const tbody = table.querySelector("tbody");
      const rows = Array.from(tbody.querySelectorAll("tr"));
      const attrName = (key) => "data-" + key.replaceAll("_", "-");
      const numberOf = (row, key) => {{
        const raw = row.getAttribute(attrName(key));
        if (raw === null || raw === "") return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      }};
      const sortRows = () => {{
        const option = select.selectedOptions[0];
        const key = select.value;
        const descending = option && option.dataset.direction === "desc";
        rows.sort((a, b) => {{
          const av = numberOf(a, key);
          const bv = numberOf(b, key);
          if (av === null && bv === null) return 0;
          if (av === null) return 1;
          if (bv === null) return -1;
          return descending ? bv - av : av - bv;
        }});
        rows.forEach((row) => tbody.appendChild(row));
      }};
      select.addEventListener("change", sortRows);
      sortRows();
    }})();
  </script>
</body>
</html>
"""


def render_reports_index(stocks: list[dict], built_at: str) -> str:
    cards = []
    for stock in stocks:
        note = f'<p class="report-note">{html.escape(stock["user_note"])}</p>' if stock["user_note"] else ""
        card = f"""
            <article class="report-card">
              <a href="{html.escape(stock["code"])}/">
                <span>{html.escape(stock["market"])} · {html.escape(str(stock.get("period") or ""))}</span>
                <h2>{html.escape(stock["name"])} {html.escape(stock["code"])}</h2>
                <p>{html.escape(stock["business_summary"])}</p>
                {note}
              </a>
            </article>
            """.strip()
        cards.append("\n".join(line.rstrip() for line in card.splitlines()))
    cards_html = "\n".join(cards)
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>研究报告 - AH Note</title>
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/styles.css?v={ASSET_VERSION}">
</head>
<body>
  {nav("reports", "../")}
  <main class="reports-page">
    <h1>研究报告</h1>
    <div class="report-list">
      {cards_html}
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
  <link rel="stylesheet" href="../assets/styles.css?v={ASSET_VERSION}">
</head>
<body>
  {nav("reference", "../")}
  <main class="reference-page">
    <h1>参考资料</h1>
    <section class="reference-block">
      <h2>排序口径</h2>
      <p>首页展示全部已完成研究的股票，排序只使用相对指标，例如 PE、预测分红率、毛利率、净利率、回本年、市值/现金利润、现金利润收益率和净现金/市值。</p>
      <p>市值、折后净现金、折后现金利润属于绝对金额，只作为表格数字展示，不作为首页排序选项。</p>
    </section>
    <section class="reference-block">
      <h2>核心字段</h2>
      <p>市值、折后净现金、折后现金利润和回本年均直接来自统一股票研究 Agent 的结构化结果，展示单位默认为亿元人民币。</p>
      <p>一句话业务直接使用统一研究结果中的 <code>business.one_line</code>；旧报告尚未重跑时才使用兼容摘要。</p>
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
  <link rel="stylesheet" href="../../assets/styles.css?v={ASSET_VERSION}">
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
        report_path_text = stock.get("_report_path")
        if not report_path_text:
            continue
        report_path = Path(report_path_text)
        report_html = markdown_to_html(report_path.read_text(encoding="utf-8"))
        out_dir = REPORTS_DIR / stock["code"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(render_detail(stock, report_html, built_at), encoding="utf-8")


def build_site(stock_report_root: Path = STOCK_REPORT_DIR, legacy_source_dir: Path = SOURCE_DIR) -> int:
    DATA_DIR.mkdir(exist_ok=True)
    if STOCKS_DIR.exists():
        shutil.rmtree(STOCKS_DIR)
    REPORTS_DIR.mkdir(exist_ok=True)
    REFERENCE_DIR.mkdir(exist_ok=True)
    built_at = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S +08:00")
    notes = parse_notes(stock_report_root)
    chinese_names = load_chinese_names(notes, stock_report_root)
    sourced_stocks = load_stocks(notes, chinese_names, legacy_source_dir, stock_report_root)
    stocks = merge_published_stocks(load_published_stocks(), sourced_stocks)
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
    return len(stocks)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the AH Note static website.")
    parser.add_argument(
        "--stock-report-root",
        type=Path,
        default=STOCK_REPORT_DIR,
        help="stock_report repository root; unified reports here override legacy snapshots",
    )
    parser.add_argument(
        "--legacy-source-dir",
        type=Path,
        default=SOURCE_DIR,
        help="legacy report snapshot root used only when a stock has no newer unified result",
    )
    args = parser.parse_args()
    build_site(args.stock_report_root.resolve(), args.legacy_source_dir.resolve())


if __name__ == "__main__":
    main()
