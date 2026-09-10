#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from publish_site import ROOT, publish
from formal_reports import formal_report_digest, load_formal_reports
from site_sources import CURRENT_SCHEMAS, UNIFIED_SCHEMA, is_publishable, normalize_result


def classification_digest(stock_analysis_root: Path) -> str:
    """Hash versioned inputs/code, not generated timestamps or unrelated commits."""
    root = stock_analysis_root.resolve()
    recipe = root / "data/normalized/industry_classification/ahu_site_recipe_v1.json"
    payload = json.loads(recipe.read_text(encoding="utf-8"))
    if payload.get("schema_version") != "industry-review-recipe-v1":
        raise ValueError("unsupported classification recipe")
    inputs = [recipe]
    for key in ("source", "decisions", "sec_evidence", "taxonomy_extension",
                "industry_batch_reviews", "identity_links", "search_aliases"):
        if not payload.get(key):
            continue
        relative = Path(payload[key])
        path = (root / relative).resolve()
        if relative.is_absolute() or not path.is_relative_to(root):
            raise ValueError("classification recipe path escapes repository")
        if not path.exists():
            raise FileNotFoundError(path)
        inputs.extend(sorted(path.rglob("*")) if path.is_dir() else [path])
    # AH names/representative supplements and generator changes affect output too.
    for relative in ("data/snapshots/industry_classification/ah_v4",
                     "src/stock_analysis/industry_classification"):
        directory = root / relative
        if not directory.is_dir():
            raise FileNotFoundError(directory)
        inputs.extend(p for p in directory.rglob("*")
                      if p.suffix in {".json", ".jsonl", ".py"})
    digest = hashlib.sha256()
    for path in sorted(set(p for p in inputs if p.is_file())):
        if not path.resolve().is_relative_to(root):
            raise ValueError("classification input symlink escapes repository")
        digest.update(str(path.relative_to(root)).encode())
        digest.update(b"\0")
        digest.update(hashlib.sha256(path.read_bytes()).digest())
    for relative in ("scripts/industry_catalog.py", "scripts/build_site.py",
                     "assets/industries.js", "assets/styles.css"):
        path = ROOT / relative
        if path.is_file():
            digest.update(relative.encode())
            digest.update(hashlib.sha256(path.read_bytes()).digest())
    return digest.hexdigest()


def site_head() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True,
        capture_output=True, check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or "AH Note is not a Git checkout")
    return completed.stdout.strip()


LOADED_SITE_COMMIT = site_head()


def reload_after_site_update() -> None:
    """Pull before publishing and reload modules when the checkout changes."""
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True,
        capture_output=True, check=False,
    )
    if status.returncode != 0:
        raise RuntimeError(status.stderr.strip() or "AH Note is not a Git checkout")
    if status.stdout.strip():
        raise RuntimeError("AH Note publication checkout is not clean")
    pulled = subprocess.run(
        ["git", "pull", "--ff-only", "origin", "main"], cwd=ROOT, text=True,
        capture_output=True, check=False,
    )
    if pulled.returncode != 0:
        raise RuntimeError(pulled.stderr.strip() or pulled.stdout.strip() or "AH Note pull failed")
    if site_head() != LOADED_SITE_COMMIT:
        os.execv(
            sys.executable,
            [sys.executable, str(Path(__file__).resolve()), *sys.argv[1:]],
        )


def sync_clean_checkout(root: Path, label: str) -> None:
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=root, text=True,
        capture_output=True, check=False,
    )
    if status.returncode != 0:
        raise RuntimeError(status.stderr.strip() or f"{label} is not a Git checkout")
    if status.stdout.strip():
        raise RuntimeError(f"{label} publication mirror is not clean")
    pulled = subprocess.run(
        ["git", "pull", "--ff-only"], cwd=root, text=True,
        capture_output=True, check=False,
    )
    if pulled.returncode != 0:
        raise RuntimeError(pulled.stderr.strip() or pulled.stdout.strip() or f"{label} pull failed")


def sync_clean_stock_report(stock_report_root: Path) -> None:
    sync_clean_checkout(stock_report_root, "stock_report")


def sync_clean_stock_analysis(stock_analysis_root: Path) -> None:
    sync_clean_checkout(stock_analysis_root, "stock_analysis")


def report_digest(result_path: Path, report_path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(result_path.read_bytes())
    digest.update(b"\0")
    digest.update(report_path.read_bytes())
    return digest.hexdigest()


def completed_reports(stock_report_root: Path, settle_seconds: int = 10) -> dict[str, dict[str, str]]:
    source_root = stock_report_root / "data" / "analysis" / "stock_research"
    now = time.time()
    completed: dict[str, dict[str, str]] = {}
    for result_path in sorted(source_root.glob("*/*/result.json")):
        report_path = result_path.with_name("report.md")
        if not report_path.is_file():
            continue
        if now - max(result_path.stat().st_mtime, report_path.stat().st_mtime) < settle_seconds:
            continue
        try:
            result = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if result.get("schema_version") not in {UNIFIED_SCHEMA, *CURRENT_SCHEMAS}:
            continue
        normalized = normalize_result(result, result_path)
        if not is_publishable(normalized):
            continue
        company = normalized.get("company") if isinstance(normalized.get("company"), dict) else {}
        code = str(company.get("code") or result_path.parents[1].name).upper()
        period = str(normalized.get("period") or result_path.parent.name)
        completed[f"{code}/{period}"] = {
            "code": code,
            "period": period,
            "digest": report_digest(result_path, report_path),
        }
    for report in load_formal_reports(stock_report_root):
        if now - report.report_path.stat().st_mtime < settle_seconds:
            continue
        completed[f"{report.code}/{report.report_period}"] = {
            "code": report.code,
            "period": report.report_period,
            "digest": formal_report_digest(report),
        }
    return completed


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"reports": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"reports": {}}
    return payload if isinstance(payload, dict) else {"reports": {}}


def save_state(path: Path, reports: dict[str, dict[str, str]], industry_digest: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "reports": reports,
                    "industry_digest": industry_digest}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def missing_published_codes(reports: dict[str, dict[str, str]]) -> list[str]:
    """Return completed report codes whose public detail page is absent."""
    codes = {record["code"] for record in reports.values()}
    return sorted(
        code for code in codes
        if not (ROOT / "reports" / code / "index.html").is_file()
    )


def publish_changes(
    stock_report_root: Path,
    stock_analysis_root: Path,
    state_file: Path,
    settle_seconds: int,
) -> dict[str, Any]:
    # Keep the long-running checkout aligned with the public branch before using
    # local page existence as publication evidence.  If the pull advances HEAD,
    # reload_after_site_update replaces this process so imported modules match it.
    reload_after_site_update()
    reports = completed_reports(stock_report_root, settle_seconds)
    state = load_state(state_file)
    previous = state.get("reports") or {}
    industry_digest = classification_digest(stock_analysis_root)
    industry_changed = state.get("industry_digest") != industry_digest or any(
        not (ROOT / relative).is_file()
        for relative in ("industries/index.html", "data/industry-classification.json")
    )
    changed = [record for key, record in reports.items() if previous.get(key) != record]
    missing_codes = missing_published_codes(reports)
    if not changed and not missing_codes and not industry_changed:
        return {"status": "unchanged", "changed_codes": []}
    codes = sorted({record["code"] for record in changed} | set(missing_codes))
    result = publish(
        stock_report_root,
        codes,
        stock_analysis_root=stock_analysis_root,
    )
    save_state(state_file, reports, industry_digest)
    result["changed_codes"] = codes
    result["industry_changed"] = industry_changed
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish new unified stock reports to AH Note.")
    parser.add_argument("--stock-report-root", type=Path, default=ROOT.parent / "stock_report")
    parser.add_argument("--stock-analysis-root", type=Path, default=ROOT.parent / "stock_analysis")
    parser.add_argument("--state-file", type=Path, default=ROOT.parent / "runs" / "ah-note-publisher" / "state.json")
    parser.add_argument("--interval-seconds", type=int, default=20)
    parser.add_argument("--settle-seconds", type=int, default=10)
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--sync-stock-report", action="store_true",
        help="fast-forward a dedicated clean stock_report mirror before every scan",
    )
    parser.add_argument(
        "--sync-stock-analysis", action="store_true",
        help="fast-forward a dedicated clean stock_analysis site-source mirror before every scan",
    )
    args = parser.parse_args()

    while True:
        try:
            if args.sync_stock_report:
                sync_clean_stock_report(args.stock_report_root.resolve())
            if args.sync_stock_analysis:
                sync_clean_stock_analysis(args.stock_analysis_root.resolve())
            result = publish_changes(
                args.stock_report_root.resolve(),
                args.stock_analysis_root.resolve(),
                args.state_file.resolve(),
                args.settle_seconds,
            )
            if result.get("status") != "unchanged":
                print(json.dumps(result, ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({"status": "error", "error": str(error)}, ensure_ascii=False), flush=True)
            if args.once:
                raise SystemExit(1) from error
        if args.once:
            return
        time.sleep(max(args.interval_seconds, 5))


if __name__ == "__main__":
    main()
