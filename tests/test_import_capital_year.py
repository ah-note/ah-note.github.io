import importlib.util
import json
import tempfile
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("capital_import", Path(__file__).parents[1] / "scripts/import_capital_year.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ImportTest(unittest.TestCase):
    def test_versions_retained_and_years_reused(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "input.json"
            d = {"schema": "capital-statement-v1", "company": "TEST", "currency": "CNY", "year": 2025, "validation": {"status": "warning", "errors": []}}
            source.write_text(json.dumps(d))
            first = module.install(source, root / "site", "TEST", "run1", "digest")
            module.install(source, root / "site", "TEST", "run1", "digest")
            self.assertEqual(len(json.loads((root / "site/annual-manifest.json").read_text())["files"]), 1)
            d["revision"] = 2
            source.write_text(json.dumps(d))
            second = module.install(source, root / "site", "TEST", "run2", "digest2")
            self.assertNotEqual(first, second)
            self.assertTrue((root / "site" / first).exists())
            d["validation"]["status"] = "failed"
            source.write_text(json.dumps(d))
            with self.assertRaisesRegex(ValueError, "VALIDATION"):
                module.install(source, root / "site", "TEST", "run3", "digest3")


if __name__ == "__main__":
    unittest.main()
