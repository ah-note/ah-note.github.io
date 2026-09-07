from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_site import nav  # noqa: E402
from industry_catalog import build_industry_catalog, render_industry_index  # noqa: E402
from publish_site import PUBLISH_PATHS  # noqa: E402


class IndustryCatalogTest(unittest.TestCase):
    def write_snapshot(self, root: Path, *, valid_leaf: bool = True) -> Path:
        snapshot = root / "snapshot"
        snapshot.mkdir()
        taxonomy = {
            "effective_date": "2026-09-07",
            "industries": [{"industry_id": "10", "name_zh": "工业"}],
            "sectors": [{"sector_id": "1010", "industry_id": "10", "name_zh": "工业工程"}],
            "subsectors": [{"subsector_id": "101020", "sector_id": "1010", "industry_id": "10", "name_zh": "工业设备"}],
            "analysis_leaves": [{"leaf_id": "101020", "subsector_id": "101020", "name_zh": "工业设备"}],
        }
        (snapshot / "taxonomy.json").write_text(json.dumps(taxonomy), encoding="utf-8")
        issuer = {
            "issuer_id": "SH.600000",
            "issuer_name": "测试设备",
            "markets": ["A"],
            "securities": [{"security_id": "SH.600000", "symbol": "600000.SH", "name": "测试设备"}],
            "eligibility_status": "eligible",
            "eligibility_reason": "可分析",
            "primary_leaf_id": "missing" if not valid_leaf else "101020",
            "secondary_leaf_ids": [],
            "analysis_model": "ordinary_operating",
            "classification_confidence": "high",
        }
        (snapshot / "issuer-map.jsonl").write_text(json.dumps(issuer, ensure_ascii=False) + "\n", encoding="utf-8")
        representative = {"issuer_id": "SH.600000", "leaf_representative_rank": 1}
        (snapshot / "representatives.jsonl").write_text(json.dumps(representative) + "\n", encoding="utf-8")
        seed = {"security_id": "SH.600000", "aliases": ["测试机械", "600000"]}
        (snapshot / "security-seeds.jsonl").write_text(json.dumps(seed, ensure_ascii=False) + "\n", encoding="utf-8")
        audit = {
            "generated_at": "2026-09-07T20:00:00+08:00",
            "security_count": 1,
            "issuer_count": 1,
            "eligible_issuer_count": 1,
            "excluded_issuer_count": 0,
            "representative_count": 1,
            "review_queue_count": 0,
            "final_validation_errors": [],
        }
        (snapshot / "coverage-audit.json").write_text(json.dumps(audit), encoding="utf-8")
        return snapshot

    def test_catalog_keeps_search_alias_category_and_report_link(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = self.write_snapshot(root)
            stocks = root / "stocks.json"
            stocks.write_text(json.dumps({"stocks": [{"code": "600000.SH"}]}), encoding="utf-8")

            catalog = build_industry_catalog(snapshot, stocks)

            self.assertEqual(catalog["summary"]["eligible_issuer_count"], 1)
            self.assertEqual(catalog["issuers"][0]["primary_leaf_id"], "101020")
            self.assertIn("测试机械", catalog["issuers"][0]["search_terms"])
            self.assertEqual(catalog["issuers"][0]["report_url"], "../reports/600000.SH/")
            self.assertEqual(catalog["issuers"][0]["representative_rank"], 1)

    def test_catalog_rejects_invalid_leaf_for_eligible_company(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = self.write_snapshot(root, valid_leaf=False)
            with self.assertRaisesRegex(ValueError, "invalid primary leaves"):
                build_industry_catalog(snapshot, root / "missing-stocks.json")

    def test_industry_page_exposes_search_and_browser_hooks(self) -> None:
        page = render_industry_index("test-version")
        self.assertIn('id="industrySearch"', page)
        self.assertIn('id="industryApp"', page)
        self.assertIn("assets/industries.js?v=test-version", page)
        self.assertIn("输入公司名称或股票代码", page)

    def test_primary_navigation_and_publisher_keep_industry_browser(self) -> None:
        self.assertIn('href="industries/"', nav("index"))
        self.assertIn("industries", PUBLISH_PATHS)
        self.assertIn("assets/industries.js", PUBLISH_PATHS)


if __name__ == "__main__":
    unittest.main()
