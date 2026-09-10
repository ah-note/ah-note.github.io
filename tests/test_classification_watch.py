from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import watch_stock_report as watcher


class ClassificationWatchTests(unittest.TestCase):
    def test_classification_only_publish_is_recorded_and_then_idle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state.json"
            for relative in ("industries/index.html", "data/industry-classification.json"):
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("present")
            with (patch.object(watcher, "ROOT", root),
                  patch.object(watcher, "reload_after_site_update"),
                  patch.object(watcher, "completed_reports", return_value={}),
                  patch.object(watcher, "classification_digest", return_value="new"),
                  patch.object(watcher, "publish", return_value={"status": "published"}) as publish):
                result = watcher.publish_changes(root, root, state, 0)
                self.assertTrue(result["industry_changed"])
                publish.assert_called_once_with(root, [], stock_analysis_root=root)
                self.assertEqual(json.loads(state.read_text())["industry_digest"], "new")
                self.assertEqual(watcher.publish_changes(root, root, state, 0)["status"], "unchanged")
                self.assertEqual(publish.call_count, 1)
                (root / "industries/index.html").unlink()
                watcher.publish_changes(root, root, state, 0)
                self.assertEqual(publish.call_count, 2)

    def test_failure_preserves_state_and_retries(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state = root / "state.json"
            original = json.dumps({"reports": {}, "industry_digest": "old"})
            state.write_text(original)
            with (patch.object(watcher, "ROOT", root),
                  patch.object(watcher, "reload_after_site_update"),
                  patch.object(watcher, "completed_reports", return_value={}),
                  patch.object(watcher, "classification_digest", return_value="new"),
                  patch.object(watcher, "publish", side_effect=[RuntimeError("failed"), {"status": "published"}]) as publish):
                with self.assertRaises(RuntimeError):
                    watcher.publish_changes(root, root, state, 0)
                self.assertEqual(state.read_text(), original)
                watcher.publish_changes(root, root, state, 0)
                self.assertEqual(publish.call_count, 2)

    def test_digest_tracks_content_not_mtime_and_rejects_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            recipe = root / "data/normalized/industry_classification/ahu_site_recipe_v1.json"
            recipe.parent.mkdir(parents=True)
            payload = {"schema_version": "industry-review-recipe-v1", "source": "source", "decisions": "decisions.json",
                       "sec_evidence": "sec.jsonl"}
            recipe.write_text(json.dumps(payload))
            (root / "source").mkdir()
            decisions = root / "decisions.json"
            decisions.write_text("{}")
            sec = root / "sec.jsonl"
            sec.write_text('{}\n')
            for relative in ("data/snapshots/industry_classification/ah_v4", "src/stock_analysis/industry_classification"):
                (root / relative).mkdir(parents=True)
            initial = watcher.classification_digest(root)
            decisions.touch()
            self.assertEqual(initial, watcher.classification_digest(root))
            decisions.write_text('{"changed": true}')
            self.assertNotEqual(initial, watcher.classification_digest(root))
            updated = watcher.classification_digest(root)
            sec.write_text('{"changed": true}\n')
            self.assertNotEqual(updated, watcher.classification_digest(root))
            payload["source"] = "../outside"
            recipe.write_text(json.dumps(payload))
            with self.assertRaises(ValueError):
                watcher.classification_digest(root)


if __name__ == "__main__":
    unittest.main()
