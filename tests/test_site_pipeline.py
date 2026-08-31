from __future__ import annotations

import json
import hashlib
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_site import (  # noqa: E402
    load_stocks,
    merge_published_stocks,
    render_research_detail,
    render_research_index,
    render_table,
)
from formal_reports import load_formal_reports  # noqa: E402
from site_sources import UNIFIED_SCHEMA, load_research_documents  # noqa: E402
from watch_stock_report import completed_reports  # noqa: E402


def unified_result(code: str, period: str = "2025-12-31", status: str = "complete") -> dict:
    return {
        "schema_version": UNIFIED_SCHEMA,
        "company": {"code": code, "name": "测试公司", "display_name": "测试公司", "market": "A"},
        "analysis": {"period": period, "currency": "CNY", "generated_at": "2026-07-26T20:55:25+08:00"},
        "valuation": {"market_cap": 1_000_000_000, "pe_ttm": 8.5},
        "metrics": {
            "market_cap": 1_000_000_000,
            "pe_ttm": 8.5,
            "gross_margin": 0.3,
            "net_margin": 0.1,
            "forecast_dividend_yield": 0.04,
            "discounted_net_cash": 200_000_000,
            "discounted_cash_profit": 100_000_000,
            "operating_business_price": 800_000_000,
            "owner_earnback_years": 8.0,
            "market_cap_to_cash_profit": 10.0,
        },
        "financials": {
            "balance_sheet": {"total_assets": 2_000_000_000},
            "income_statement": {
                "revenue": 2_000_000_000,
                "gross_profit": 600_000_000,
                "parent_net_profit": 200_000_000,
            },
            "cash_flow": {"operating_free_cash_flow": 180_000_000},
        },
        "owner_earnback": {
            "discounted_detachable_net_cash": 200_000_000,
            "discounted_sustainable_cash_profit": 100_000_000,
            "operating_business_price": 800_000_000,
            "owner_earnback_years": 8.0,
            "market_profit_payback_years": 10.0,
            "interpretation": "统一 Agent 的回本解释。",
        },
        "business": {"one_line": "卖测试产品，利润来自服务费，生意轻资产且现金转化稳定。"},
        "data_quality": {"status": status},
    }


def write_research(root: Path, code: str, period: str, payload: dict, report: str) -> None:
    target = root / code / period
    target.mkdir(parents=True, exist_ok=True)
    (target / "result.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    (target / "report.md").write_text(report, encoding="utf-8")


def write_formal_database(root: Path, records: list[dict]) -> None:
    database = root / "data" / "derived" / "stock_research" / "research.sqlite3"
    database.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database)
    connection.executescript("""
        CREATE TABLE research_versions (
            analysis_version TEXT PRIMARY KEY, code TEXT, name TEXT, market TEXT,
            report_period TEXT, generated_at TEXT, report_path TEXT, report_sha256 TEXT,
            report_review_json TEXT, status TEXT
        );
        CREATE TABLE latest_research_versions (
            code TEXT, report_period TEXT, analysis_version TEXT,
            PRIMARY KEY (code, report_period)
        );
    """)
    for record in records:
        connection.execute(
            "INSERT INTO research_versions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                record["version"], record["code"], record.get("name", "测试公司"),
                record.get("market", "A"), record.get("period", "2025-12-31"),
                record.get("generated_at", "2026-08-31T10:00:00+08:00"), record["path"],
                record["sha"], json.dumps({"status": record.get("review", "pass")}),
                record.get("status", "complete"),
            ),
        )
        if record.get("latest", True):
            connection.execute(
                "INSERT INTO latest_research_versions VALUES (?, ?, ?)",
                (record["code"], record.get("period", "2025-12-31"), record["version"]),
            )
    connection.commit()
    connection.close()


class SitePipelineTest(unittest.TestCase):
    def test_report_tables_only_expand_when_they_have_many_columns(self) -> None:
        standard = render_table(["| 项目 | 金额 |", "| --- | --- |", "| 收入 | 100 |"])
        wide = render_table([
            "| 业务 | 收入 | 成本 | 毛利 | 资产 | 资金 |",
            "| --- | --- | --- | --- | --- | --- |",
            "| 主业 | 100 | 60 | 40 | 80 | 20 |",
        ])

        self.assertIn('class="table-wrap table-wrap-standard"', standard)
        self.assertIn('class="table-wrap table-wrap-wide"', wide)

    def test_formal_report_feed_only_loads_approved_hash_verified_latest_versions(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stock_report = Path(temporary) / "stock_report"
            approved_text = "# 测试公司研究报告\n\n这是一段足够长的业务导读，用来说明客户、产品、供应链、经营资产、现金流和企业价值之间的关系，并作为文章列表摘要。\n\n## 折算三表\n\n| 项目 | 金额 |\n| --- | --- |\n| 收入 | 100 |"
            rejected_text = "# 不应发布\n\n这份报告没有通过审阅，所以不应出现在文章列表中。"
            approved_path = stock_report / "data/analysis/stock_research/000001.SZ/2025-12-31/versions/v2/report.md"
            rejected_path = stock_report / "data/analysis/stock_research/000002.SZ/2025-12-31/versions/v1/report.md"
            approved_path.parent.mkdir(parents=True, exist_ok=True)
            rejected_path.parent.mkdir(parents=True, exist_ok=True)
            approved_path.write_text(approved_text, encoding="utf-8")
            rejected_path.write_text(rejected_text, encoding="utf-8")
            write_formal_database(stock_report, [
                {"version": "v2", "code": "000001.SZ", "path": str(approved_path.relative_to(stock_report)),
                 "sha": hashlib.sha256(approved_text.encode()).hexdigest()},
                {"version": "v1", "code": "000002.SZ", "path": str(rejected_path.relative_to(stock_report)),
                 "sha": hashlib.sha256(rejected_text.encode()).hexdigest(), "review": "fail"},
            ])

            reports = load_formal_reports(stock_report)

            self.assertEqual([report.code for report in reports], ["000001.SZ"])
            self.assertEqual(reports[0].title, "测试公司研究报告")
            self.assertIn("客户、产品、供应链", reports[0].excerpt)
            self.assertIn('href="000001.SZ/v2/"', render_research_index(reports))
            self.assertIn("折算三表", render_research_detail(reports[0]))

    def test_watcher_detects_formal_report_without_legacy_result(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stock_report = Path(temporary) / "stock_report"
            markdown = "# 正式报告\n\n这是已经通过报告验收的正式公司研究。"
            report_path = stock_report / "data/analysis/stock_research/000003.SZ/2025-12-31/versions/v1/report.md"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(markdown, encoding="utf-8")
            write_formal_database(stock_report, [{
                "version": "v1", "code": "000003.SZ", "path": str(report_path.relative_to(stock_report)),
                "sha": hashlib.sha256(markdown.encode()).hexdigest(),
            }])

            reports = completed_reports(stock_report, settle_seconds=0)

            self.assertEqual(list(reports), ["000003.SZ/2025-12-31"])
            self.assertEqual(len(reports["000003.SZ/2025-12-31"]["digest"]), 64)

    def test_formal_excerpt_skips_report_period_disclaimer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stock_report = Path(temporary) / "stock_report"
            markdown = (
                "# 正式报告\n\n报告期为 2025 年，金额均为人民币；本文不构成买卖建议。\n\n"
                "## 生意模式\n\n公司通过直营网点和加盟商把产品卖给消费者，利润取决于产品溢价、渠道效率和库存周转，这是应该展示的业务摘要。"
            )
            report_path = stock_report / "data/analysis/stock_research/000004.SZ/2025-12-31/versions/v1/report.md"
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(markdown, encoding="utf-8")
            write_formal_database(stock_report, [{
                "version": "v1", "code": "000004.SZ", "path": str(report_path.relative_to(stock_report)),
                "sha": hashlib.sha256(markdown.encode()).hexdigest(),
            }])

            report = load_formal_reports(stock_report)[0]

            self.assertTrue(report.excerpt.startswith("公司通过直营网点"))

    def test_unified_result_overrides_legacy_and_maps_site_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            legacy_root = root / "legacy"
            stock_report = root / "stock_report"
            canonical_root = stock_report / "data" / "analysis" / "stock_research"
            legacy = {
                "company": {"code": "000001.SZ", "name": "旧报告", "market": "A"},
                "period": "2025-12-31",
                "metrics": {"market_cap": 2_000_000_000, "owner_earnback_years": 20},
                "sections": {"business_story": "公司卖的是旧产品。"},
            }
            write_research(legacy_root, "000001.SZ", "2025-12-31", legacy, "# 旧报告")
            write_research(
                canonical_root,
                "000001.SZ",
                "2025-12-31",
                unified_result("000001.SZ"),
                "# 新报告",
            )

            documents = load_research_documents(legacy_root, stock_report)
            self.assertEqual(len(documents), 1)
            self.assertEqual(documents[0].result["schema_version"], UNIFIED_SCHEMA)

            stocks = load_stocks({}, {}, legacy_root, stock_report)
            stock = stocks[0]
            self.assertEqual(stock["name"], "测试公司")
            self.assertEqual(stock["forecast_dividend_yield_pct"], 4.0)
            self.assertEqual(stock["discounted_detachable_net_cash_yi"], 2.0)
            self.assertEqual(stock["market_profit_payback_years"], 10.0)
            self.assertEqual(stock["business_summary"], "卖测试产品，利润来自服务费，生意轻资产且现金转化稳定。")
            self.assertEqual(Path(stock["_report_path"]).read_text(encoding="utf-8"), "# 新报告")

    def test_latest_period_wins_and_invalid_unified_result_is_not_published(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stock_report = Path(temporary) / "stock_report"
            source = stock_report / "data" / "analysis" / "stock_research"
            write_research(source, "000001.SZ", "2024-12-31", unified_result("000001.SZ", "2024-12-31"), "old")
            write_research(source, "000001.SZ", "2025-12-31", unified_result("000001.SZ"), "new")
            write_research(source, "000002.SZ", "2025-12-31", unified_result("000002.SZ", status="invalid"), "bad")

            documents = load_research_documents(None, stock_report)
            self.assertEqual([(item.result["company"]["code"], item.result["period"]) for item in documents], [
                ("000001.SZ", "2025-12-31")
            ])

    def test_published_unified_record_is_not_replaced_by_same_period_legacy_record(self) -> None:
        published = [{"code": "000001.SZ", "period": "2025-12-31", "schema_version": UNIFIED_SCHEMA,
                      "owner_earnback_years": 8, "discounted_net_cash_to_market_cap_pct": 20, "name": "新"}]
        legacy = [{"code": "000001.SZ", "period": "2025-12-31", "schema_version": "legacy",
                   "owner_earnback_years": 3, "discounted_net_cash_to_market_cap_pct": 50, "name": "旧"}]

        merged = merge_published_stocks(published, legacy)

        self.assertEqual(merged[0]["name"], "新")

    def test_watcher_only_detects_settled_publishable_unified_reports(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            stock_report = Path(temporary) / "stock_report"
            source = stock_report / "data" / "analysis" / "stock_research"
            write_research(source, "000001.SZ", "2025-12-31", unified_result("000001.SZ"), "report")
            write_research(source, "000002.SZ", "2025-12-31", unified_result("000002.SZ", status="invalid"), "bad")

            reports = completed_reports(stock_report, settle_seconds=0)

            self.assertEqual(list(reports), ["000001.SZ/2025-12-31"])
            self.assertEqual(len(reports["000001.SZ/2025-12-31"]["digest"]), 64)


if __name__ == "__main__":
    unittest.main()
