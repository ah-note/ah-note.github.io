from __future__ import annotations

import json
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from build_site import nav  # noqa: E402
from industry_catalog import (  # noqa: E402
    build_display_taxonomy,
    build_industry_catalog,
    render_industry_index,
    review_projection,
    prepared_industry_snapshot,
    validate_industry_snapshot,
)
from publish_site import PUBLISH_PATHS  # noqa: E402


class IndustryCatalogTest(unittest.TestCase):
    def test_public_provenance_keeps_hashes_not_local_paths(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = self.write_snapshot(root)
            (snapshot/'build-manifest.json').write_text(json.dumps({'decisions_sha256': 'abc', 'recipe_sha256': 'def', 'source_directory': '/private/source', 'decisions_file': '/private/reviews.json'}))
            catalog = build_industry_catalog(snapshot, root/'stocks.json')
            self.assertEqual(catalog['classification_provenance'], {'decisions_sha256': 'abc', 'recipe_sha256': 'def'})

    def test_default_cli_uses_same_recipe_as_publisher(self):
        from contextlib import nullcontext
        from build_site import main
        with patch('sys.argv', ['build_site.py', '--stock-analysis-root', '/source']), patch('build_site.prepared_industry_snapshot', return_value=nullcontext(Path('/prepared'))) as prepare, patch('build_site.build_site') as build:
            main()
        prepare.assert_called_once_with(Path('/source'), Path('/source/data/normalized/industry_classification/ahu_site_recipe_v1.json'), None)
        self.assertEqual(build.call_args.kwargs['industry_snapshot'], Path('/prepared'))

    def test_recipe_failure_never_yields_or_falls_back(self):
        import subprocess
        result = subprocess.CompletedProcess([], 1, '', 'bad recipe')
        with patch('industry_catalog.subprocess.run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'bad recipe'):
                with prepared_industry_snapshot(ROOT, Path('recipe.json'), None):
                    self.fail('failed recipe yielded an input')

    def test_recipe_temporary_input_removed_even_when_consumer_fails(self):
        import subprocess
        result = subprocess.CompletedProcess([], 0, '', '')
        with patch('industry_catalog.subprocess.run', return_value=result), patch('industry_catalog.validate_industry_snapshot'):
            with self.assertRaisesRegex(ValueError, 'consumer'):
                with prepared_industry_snapshot(ROOT, Path('recipe.json'), None) as snapshot:
                    parent = snapshot.parent
                    self.assertTrue(parent.exists())
                    raise ValueError('consumer')
        self.assertFalse(parent.exists())

    def test_full_build_validates_selected_snapshot_before_writes(self):
        from build_site import build_site
        selected = Path("selected-snapshot")
        with patch("build_site.validate_industry_snapshot", side_effect=RuntimeError("invalid selected snapshot")) as validate:
            with self.assertRaisesRegex(RuntimeError, "invalid selected snapshot"):
                build_site(stock_analysis_root=Path("source"), industry_snapshot=selected)
        validate.assert_called_once_with(Path("source"), selected)

    def test_full_build_accepts_explicit_classification_snapshot(self):
        from build_site import main
        with patch("sys.argv", ["build_site.py", "--industry-snapshot", "reviewed-snapshot"]), patch("build_site.build_site") as build:
            main()
        self.assertEqual(build.call_args.kwargs["industry_snapshot"], Path("reviewed-snapshot").resolve())

    def test_review_projection_exposes_mapping_without_promoting_verification(self):
        issuer = {"markets": ["US"], "primary_leaf_id": "a", "secondary_leaf_ids": ["b"],
                  "eligibility_status": "eligible", "material_exposure_leaf_ids": ["c"]}
        candidate = review_projection(issuer)
        self.assertEqual(candidate["primary_leaf_id"], "a")
        self.assertEqual(candidate["candidate_leaf_ids"], ["b"])
        self.assertTrue(candidate["browse_eligible"])
        self.assertEqual(candidate["review_status"], "mapped")
        self.assertEqual(candidate["evidence_level"], "mapped")
        issuer["classification_method"] = "reviewed_sic_industry_group_v1"
        calibrated = review_projection(issuer)
        self.assertEqual(calibrated["review_status"], "industry_reviewed")
        self.assertEqual(calibrated["evidence_level"], "industry_reviewed")
        issuer["business_review"] = {"primary_review_status": "verified", "source": "https://example.com/report",
                                    "exposure_review_status": "pending", "eligibility_review_status": "verified"}
        partial = review_projection(issuer)
        self.assertEqual(partial["review_status"], "company_primary")
        self.assertEqual(partial["material_exposure_leaf_ids"], [])
        issuer["business_review"]["exposure_review_status"] = "verified"
        self.assertEqual(review_projection(issuer)["review_status"], "company_complete")

    def test_changed_ah_boundary_stays_browsable_but_flagged(self):
        issuer = {"markets": ["HK"], "primary_leaf_id": "a", "eligibility_status": "eligible",
                  "classification_review_status": "shared_leaf_review_required"}
        self.assertEqual(review_projection(issuer)["review_status"], "mapped")
        self.assertTrue(review_projection(issuer)["review_pending"])
        issuer.pop("classification_review_status")
        self.assertEqual(review_projection(issuer, pending_review=True)["review_status"], "mapped")
        self.assertTrue(review_projection(issuer, pending_review=True)["review_pending"])
        issuer["eligibility_status"] = "no_analysis_value.shell"
        self.assertEqual(review_projection(issuer)["review_status"], "excluded")

    def test_explicit_draft_snapshot_uses_real_counts_without_optional_representatives(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = self.write_snapshot(root)
            supplemental = root / "supplemental"
            supplemental.mkdir()
            for name in ("representatives.jsonl", "security-seeds.jsonl"):
                (supplemental / name).write_text((snapshot / name).read_text())
            (snapshot / "representatives.jsonl").unlink()
            (snapshot / "security-seeds.jsonl").unlink()
            issuer = json.loads((snapshot / "issuer-map.jsonl").read_text())
            issuer.update(markets=["A", "US"], eligibility_status="review_required")
            (snapshot / "issuer-map.jsonl").write_text(json.dumps(issuer)+'\n')
            (snapshot / "coverage-audit.json").write_text(json.dumps({"status":"draft", "generated_at":"2026-09-10T13:00:00+08:00"}))
            self.assertEqual(validate_industry_snapshot(root, snapshot), snapshot.resolve())
            result = build_industry_catalog(snapshot, root / "stocks.json", supplemental)
            self.assertEqual(result["summary"]["excluded_issuer_count"], 0)
            self.assertEqual(result["summary"]["eligible_issuer_count"], 1)
            self.assertEqual(result["summary"]["issuer_count"], 1)
            self.assertEqual(result["issuers"][0]["review_status"], "mapped")
            self.assertEqual(result["issuers"][0]["evidence_level"], "mapped")
            self.assertIn("测试机械", result["issuers"][0]["search_terms"])
            self.assertIsNone(result["issuers"][0]["representative_rank"])

    def test_unmapped_company_remains_searchable_and_not_browsable(self):
        projection = review_projection({"markets": ["US"], "primary_leaf_id": None,
                                        "secondary_leaf_ids": ["a", "b"],
                                        "eligibility_status": "review_required"})
        self.assertEqual(projection["review_status"], "unresolved")
        self.assertEqual(projection["candidate_leaf_ids"], ["a", "b"])
        self.assertFalse(projection["browse_eligible"])

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
            "material_exposure_leaf_ids": [],
            "material_exposure_evidence": [],
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
            self.assertEqual(catalog["issuers"][0]["material_exposure_leaf_ids"], [])
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
        self.assertIn("industry-classification.json?v=test-version", page)
        self.assertIn("输入公司名称或股票代码", page)

    def test_primary_navigation_and_publisher_keep_industry_browser(self) -> None:
        self.assertIn('href="industries/"', nav("index"))
        self.assertIn("industries", PUBLISH_PATHS)
        self.assertIn("assets/industries.js", PUBLISH_PATHS)

    def test_display_taxonomy_collapses_consecutive_same_name_levels(self) -> None:
        taxonomy = {
            "industries": [{"industry_id": "00", "name_zh": "能源"}],
            "sectors": [{"sector_id": "0020", "industry_id": "00", "name_zh": "煤炭"}],
            "subsectors": [{"subsector_id": "002010", "sector_id": "0020", "name_zh": "煤炭"}],
            "analysis_leaves": [{"leaf_id": "002010", "subsector_id": "002010", "name_zh": "煤炭"}],
        }

        nodes, leaf_keys = build_display_taxonomy(taxonomy)

        self.assertEqual([node["name"] for node in nodes], ["能源", "煤炭"])
        self.assertEqual(leaf_keys["002010"], "sector:0020")

    def test_catalog_keeps_evidence_backed_material_exposures(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            snapshot = self.write_snapshot(root)
            taxonomy_path = snapshot / "taxonomy.json"
            taxonomy = json.loads(taxonomy_path.read_text(encoding="utf-8"))
            taxonomy["analysis_leaves"].append(
                {"leaf_id": "101020.exposure", "subsector_id": "101020", "name_zh": "设备服务"}
            )
            taxonomy_path.write_text(json.dumps(taxonomy, ensure_ascii=False), encoding="utf-8")
            issuer_path = snapshot / "issuer-map.jsonl"
            issuer = json.loads(issuer_path.read_text(encoding="utf-8"))
            issuer["material_exposure_leaf_ids"] = ["101020.exposure"]
            issuer["material_exposure_evidence"] = [
                {"leaf_id": "101020.exposure", "source": "annual_report"}
            ]
            issuer_path.write_text(json.dumps(issuer, ensure_ascii=False) + "\n", encoding="utf-8")

            catalog = build_industry_catalog(snapshot, root / "missing-stocks.json")

            self.assertEqual(catalog["issuers"][0]["material_exposure_leaf_ids"], ["101020.exposure"])


if __name__ == "__main__":
    unittest.main()
