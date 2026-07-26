from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_site import load_stocks, merge_published_stocks  # noqa: E402
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


class SitePipelineTest(unittest.TestCase):
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
