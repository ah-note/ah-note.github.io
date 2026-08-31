#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from pathlib import Path
from typing import Any

from publish_site import ROOT, publish
from formal_reports import formal_report_digest, load_formal_reports
from site_sources import UNIFIED_SCHEMA


def sync_clean_stock_report(stock_report_root: Path) -> None:
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=stock_report_root, text=True,
        capture_output=True, check=False,
    )
    if status.returncode != 0:
        raise RuntimeError(status.stderr.strip() or "stock_report is not a Git checkout")
    if status.stdout.strip():
        raise RuntimeError("stock_report publication mirror is not clean")
    pulled = subprocess.run(
        ["git", "pull", "--ff-only"], cwd=stock_report_root, text=True,
        capture_output=True, check=False,
    )
    if pulled.returncode != 0:
        raise RuntimeError(pulled.stderr.strip() or pulled.stdout.strip() or "stock_report pull failed")


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
        quality = result.get("data_quality") if isinstance(result.get("data_quality"), dict) else {}
        if result.get("schema_version") != UNIFIED_SCHEMA or quality.get("status") not in {"complete", "partial"}:
            continue
        company = result.get("company") if isinstance(result.get("company"), dict) else {}
        analysis = result.get("analysis") if isinstance(result.get("analysis"), dict) else {}
        code = str(company.get("code") or result_path.parents[1].name).upper()
        period = str(analysis.get("period") or result_path.parent.name)
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


def save_state(path: Path, reports: dict[str, dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps({"updated_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "reports": reports}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary.replace(path)


def publish_changes(stock_report_root: Path, state_file: Path, settle_seconds: int) -> dict[str, Any]:
    reports = completed_reports(stock_report_root, settle_seconds)
    previous = load_state(state_file).get("reports") or {}
    changed = [record for key, record in reports.items() if previous.get(key) != record]
    if not changed:
        return {"status": "unchanged", "changed_codes": []}
    codes = sorted({record["code"] for record in changed})
    result = publish(stock_report_root, codes)
    save_state(state_file, reports)
    result["changed_codes"] = codes
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish new unified stock reports to AH Note.")
    parser.add_argument("--stock-report-root", type=Path, default=ROOT.parent / "stock_report")
    parser.add_argument("--state-file", type=Path, default=ROOT.parent / "runs" / "ah-note-publisher" / "state.json")
    parser.add_argument("--interval-seconds", type=int, default=20)
    parser.add_argument("--settle-seconds", type=int, default=10)
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--sync-stock-report", action="store_true",
        help="fast-forward a dedicated clean stock_report mirror before every scan",
    )
    args = parser.parse_args()

    while True:
        try:
            if args.sync_stock_report:
                sync_clean_stock_report(args.stock_report_root.resolve())
            result = publish_changes(args.stock_report_root.resolve(), args.state_file.resolve(), args.settle_seconds)
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
