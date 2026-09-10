import importlib.util
import json
import sys
import tempfile
from pathlib import Path
import unittest

SCRIPTS = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("capital_publish", SCRIPTS / "publish_capital_statement.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CapitalPublishTest(unittest.TestCase):
    def test_publish_builds_catalog_company_page_and_content_addressed_year(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.json"
            source.write_text(json.dumps({"schema": "capital-statement-v4", "company": "UVV", "currency": "USD",
                "year": 2026, "facts": {"x": {}}, "mappings": [], "custom_fields": [],
                "display_registry": {"version": "capital-display-v1"},
                "validation": {"status": "warning", "errors": []}}))
            relative = module.publish(source, root / "site", "环球烟草", "UVV", "run", "bundle")
            self.assertTrue((root / "site/capital/UVV" / relative).exists())
            self.assertIn("环球烟草", (root / "site/capital/index.html").read_text())
            self.assertIn("资本表", (root / "site/capital/UVV/index.html").read_text())


if __name__ == "__main__":
    unittest.main()
