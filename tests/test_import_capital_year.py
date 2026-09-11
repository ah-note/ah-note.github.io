import importlib.util
import json
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("capital_import", Path(__file__).parents[1] / "scripts/import_capital_year.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def document(schema="capital-statement-v5", company="TEST", currency="CNY"):
    return {"schema": schema, "company": company, "currency": currency,
            "period_start": "2025-01-01", "period_end": "2025-12-31",
            "facts": {"revenue": {"source_amount": 1}}, "mappings": [], "custom_fields": [],
            "display_registry": {"version": "capital-display-v1"},
            "validation": {"status": "warning", "errors": []}}


class ImportTest(unittest.TestCase):
    def test_versions_retained_and_period_reference_is_replaced(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source = Path(tmp), Path(tmp) / "input.json"
            value = document()
            source.write_text(json.dumps(value))
            first = module.install(source, root / "site", "TEST", "run1", "digest")
            module.install(source, root / "site", "TEST", "run1", "digest")
            manifest = json.loads((root / "site/annual-manifest.json").read_text())
            self.assertEqual(list(manifest["periods"]), ["2025-12-31"])
            value["revision"] = 2
            source.write_text(json.dumps(value))
            second = module.install(source, root / "site", "TEST", "run2", "digest2")
            self.assertNotEqual(first, second)
            self.assertTrue((root / "site" / first).exists())
            value["validation"]["status"] = "failed"
            source.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "VALIDATION"):
                module.install(source, root / "site", "TEST", "run3", "digest3")

    def test_v3_v4_v5_share_display_contract_and_use_period_end_filename(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source = Path(tmp), Path(tmp) / "input.json"
            for schema in ["capital-statement-v3", "capital-statement-v4", "capital-statement-v5"]:
                source.write_text(json.dumps(document(schema)))
                relative = module.install(source, root / schema, "TEST", "run", "digest")
                self.assertTrue(relative.startswith("annual/2025-12-31."))

    def test_period_display_registry_custom_limit_and_validation_are_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, source = Path(tmp), Path(tmp) / "input.json"
            value = document()
            del value["period_start"]
            source.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "REPORTING_PERIOD"):
                module.install(source, root / "missing-period", "TEST", "run", "digest")
            value = document(); value["custom_fields"] = [{} for _ in range(6)]
            source.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "CUSTOM_FIELD_LIMIT"):
                module.install(source, root / "custom", "TEST", "run", "digest")
            value = document(); del value["display_registry"]
            source.write_text(json.dumps(value))
            with self.assertRaisesRegex(ValueError, "DISPLAY_REGISTRY"):
                module.install(source, root / "registry", "TEST", "run", "digest")


if __name__ == "__main__":
    unittest.main()
