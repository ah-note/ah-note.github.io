import importlib.util
import json
import sys
from pathlib import Path


SCRIPTS = Path(__file__).parents[1] / "scripts"
spec = importlib.util.spec_from_file_location("capital_queue", SCRIPTS / "capital_publication_worker.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)


def test_queue_success_moves_item_to_completed(monkeypatch, tmp_path):
    queue = tmp_path / "queue"
    module.initialize(queue)
    source = tmp_path / "result.json"
    source.write_text("{}")
    item = {"period_key": "abc", "result_path": str(source), "company": "600585.SH",
            "name": "海螺水泥", "period_end": "2025-12-31", "source_run": "run",
            "bundle_revision": "sha"}
    module.write_json(queue / "pending/abc.json", item)
    monkeypatch.setattr(module, "publish", lambda item, root: {"status": "published", "commit": "123"})
    result = module.process_next(queue, tmp_path / "site")
    assert result["status"] == "completed"
    assert (queue / "completed/abc.json").is_file()
    assert not (queue / "pending/abc.json").exists()


def test_non_network_failure_is_not_retried(monkeypatch, tmp_path):
    queue = tmp_path / "queue"
    module.initialize(queue)
    module.write_json(queue / "pending/abc.json", {"period_key": "abc"})
    monkeypatch.setattr(module, "publish", lambda item, root: (_ for _ in ()).throw(ValueError("bad")))
    result = module.process_next(queue, tmp_path / "site")
    assert result["status"] == "failed"
    assert (queue / "failed/abc.json").is_file()
