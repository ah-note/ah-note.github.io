from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import publish_site  # noqa: E402
import build_site  # noqa: E402
from industry_catalog import SNAPSHOT_RELATIVE_DIR, validate_industry_snapshot  # noqa: E402


def git(cwd: Path, *args: str) -> str:
    completed = subprocess.run(
        ["git", *args], cwd=cwd, text=True, capture_output=True, check=True
    )
    return completed.stdout.strip()


def write_snapshot(stock_analysis: Path) -> None:
    target = stock_analysis / SNAPSHOT_RELATIVE_DIR
    target.mkdir(parents=True)
    (target / "taxonomy.json").write_text(
        json.dumps({
            "industries": [], "sectors": [], "subsectors": [], "analysis_leaves": []
        }),
        encoding="utf-8",
    )
    (target / "coverage-audit.json").write_text(
        json.dumps({"final_validation_errors": []}), encoding="utf-8"
    )
    for name in ("issuer-map.jsonl", "representatives.jsonl", "security-seeds.jsonl"):
        (target / name).write_text("", encoding="utf-8")


def create_site(root: Path, *, build_fails: bool) -> tuple[Path, Path]:
    remote = root / "origin.git"
    site = root / "site"
    subprocess.run(["git", "init", "--bare", str(remote)], check=True, capture_output=True)
    subprocess.run(["git", "init", str(site)], check=True, capture_output=True)
    git(site, "checkout", "-b", "main")
    (site / "scripts").mkdir()
    failure = "raise SystemExit('deliberate build failure')" if build_fails else ""
    (site / "scripts/build_site.py").write_text(
        """import argparse, json
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--stock-report-root')
parser.add_argument('--stock-analysis-root')
parser.add_argument('--detail-code', action='append')
parser.parse_args()
root = Path(__file__).resolve().parents[1]
(root / 'data').mkdir(exist_ok=True)
(root / 'data/stocks.json').write_text(json.dumps({'stocks': [{'code': 'TEST'}]}))
(root / 'index.html').write_text('partially generated')
""" + failure + "\n",
        encoding="utf-8",
    )
    (site / "data").mkdir()
    (site / "data/stocks.json").write_text('{"stocks": []}\n', encoding="utf-8")
    (site / "index.html").write_text("original\n", encoding="utf-8")
    git(site, "config", "user.name", "Test")
    git(site, "config", "user.email", "test@example.com")
    git(site, "add", ".")
    git(site, "commit", "-m", "Initial")
    git(site, "remote", "add", "origin", str(remote))
    git(site, "push", "-u", "origin", "main")
    return site, remote


class PublisherTransactionTest(unittest.TestCase):
    def test_missing_snapshot_is_rejected_by_preflight(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(RuntimeError, "snapshot is incomplete"):
                validate_industry_snapshot(Path(temporary))

    def test_direct_build_checks_snapshot_before_writing_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            data_dir = root / "site/data"
            with (
                patch.object(build_site, "DATA_DIR", data_dir),
                self.assertRaisesRegex(RuntimeError, "snapshot is incomplete"),
            ):
                build_site.build_site(
                    root / "stock_report",
                    stock_analysis_root=root / "missing_stock_analysis",
                )
            self.assertFalse(data_dir.exists())

    def test_failed_build_does_not_dirty_persistent_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site, _ = create_site(root, build_fails=True)
            stock_report = root / "stock_report"
            (stock_report / "data/analysis/stock_research").mkdir(parents=True)
            stock_analysis = root / "stock_analysis"
            write_snapshot(stock_analysis)
            with (
                patch.object(publish_site, "ROOT", site),
                patch.object(publish_site, "PUBLISH_PATHS", ["data", "index.html"]),
                self.assertRaisesRegex(RuntimeError, "isolated AH Note build failed"),
            ):
                publish_site.publish(
                    stock_report, ["TEST"], stock_analysis_root=stock_analysis
                )
            self.assertEqual(git(site, "status", "--porcelain"), "")
            self.assertEqual((site / "index.html").read_text(encoding="utf-8"), "original\n")
            self.assertEqual(len(git(site, "worktree", "list", "--porcelain").split("worktree ")) - 1, 1)

    def test_successful_build_pushes_without_mutating_persistent_checkout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            site, remote = create_site(root, build_fails=False)
            stock_report = root / "stock_report"
            (stock_report / "data/analysis/stock_research").mkdir(parents=True)
            stock_analysis = root / "stock_analysis"
            write_snapshot(stock_analysis)
            with (
                patch.object(publish_site, "ROOT", site),
                patch.object(publish_site, "PUBLISH_PATHS", ["data", "index.html"]),
            ):
                result = publish_site.publish(
                    stock_report, ["TEST"], stock_analysis_root=stock_analysis
                )
            self.assertEqual(result["status"], "published")
            self.assertEqual(result["attempts"], 1)
            self.assertEqual(git(site, "status", "--porcelain"), "")
            self.assertEqual((site / "index.html").read_text(encoding="utf-8"), "original\n")
            verify = root / "verify"
            subprocess.run(
                ["git", "clone", "--branch", "main", str(remote), str(verify)],
                check=True, capture_output=True,
            )
            self.assertEqual((verify / "index.html").read_text(encoding="utf-8"), "partially generated")

    def test_push_failure_retries_the_whole_transaction_three_times(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            lock_dir = Path(temporary)
            with (
                patch.object(publish_site, "validate_sources"),
                patch.object(publish_site, "git_common_dir", return_value=lock_dir),
                patch.object(publish_site, "ensure_git_identity"),
                patch.object(
                    publish_site,
                    "transaction",
                    side_effect=[ConnectionError("one"), ConnectionError("two"), {"status": "published"}],
                ) as transaction,
                patch.object(publish_site.time, "sleep") as sleep,
            ):
                result = publish_site.publish(Path(temporary), ["TEST"])
            self.assertEqual(result["attempts"], 3)
            self.assertEqual(transaction.call_count, 3)
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [1, 2])


if __name__ == "__main__":
    unittest.main()
