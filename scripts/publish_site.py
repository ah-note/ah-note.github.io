#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from build_site import ROOT
from industry_catalog import validate_industry_snapshot


PUBLISH_PATHS = [
    "assets/styles.css",
    "assets/industries.js",
    "data",
    "index.html",
    "industries",
    "reports",
    "research",
    "reference",
]
CODE_RE = re.compile(r"^[0-9A-Z.-]+$")
DEFAULT_PUSH_ATTEMPTS = 3


def run_git(
    args: list[str], *, cwd: Path | None = None, check: bool = True
) -> subprocess.CompletedProcess[str]:
    cwd = cwd or ROOT
    completed = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return completed


def git_common_dir() -> Path:
    result = run_git(["rev-parse", "--git-common-dir"])
    path = Path(result.stdout.strip())
    return path if path.is_absolute() else (ROOT / path).resolve()


def ensure_git_identity(cwd: Path) -> None:
    defaults = {
        "user.name": "AH Note Publisher",
        "user.email": "publisher@ah-note.github.io",
    }
    for key, value in defaults.items():
        configured = run_git(["config", "--get", key], cwd=cwd, check=False)
        if configured.returncode != 0 or not configured.stdout.strip():
            run_git(["config", key, value], cwd=cwd)


def commit_message(codes: list[str]) -> str:
    safe_codes = sorted({code.upper() for code in codes if CODE_RE.fullmatch(code.upper())})
    if not safe_codes:
        return "Publish completed stock research"
    shown = ", ".join(safe_codes[:4])
    suffix = f" and {len(safe_codes) - 4} more" if len(safe_codes) > 4 else ""
    return f"Publish stock research for {shown}{suffix}"


def validate_sources(stock_report_root: Path, stock_analysis_root: Path) -> None:
    if not (stock_report_root / "data" / "analysis" / "stock_research").is_dir():
        raise RuntimeError(f"stock research source not found under {stock_report_root}")
    validate_industry_snapshot(stock_analysis_root)


def run_build(
    worktree: Path,
    stock_report_root: Path,
    stock_analysis_root: Path,
    codes: list[str],
) -> int:
    command = [
        sys.executable,
        str(worktree / "scripts" / "build_site.py"),
        "--stock-report-root",
        str(stock_report_root),
        "--stock-analysis-root",
        str(stock_analysis_root),
        "--industry-recipe",
        str(stock_analysis_root / "data/normalized/industry_classification/ahu_site_recipe_v1.json"),
    ]
    for code in sorted({code.upper() for code in codes if CODE_RE.fullmatch(code.upper())}):
        command.extend(["--detail-code", code])
    completed = subprocess.run(
        command,
        cwd=worktree,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"isolated AH Note build failed: {detail}")
    payload = json.loads((worktree / "data" / "stocks.json").read_text(encoding="utf-8"))
    return len(payload.get("stocks") or [])


def transaction(
    stock_report_root: Path,
    stock_analysis_root: Path,
    codes: list[str],
    *,
    push: bool,
) -> dict[str, Any]:
    run_git(["fetch", "origin", "main"])
    with tempfile.TemporaryDirectory(prefix="ah-note-publish-") as temporary:
        worktree = Path(temporary) / "site"
        registered = False
        try:
            run_git(["worktree", "add", "--detach", str(worktree), "origin/main"])
            registered = True
            ensure_git_identity(worktree)
            count = run_build(worktree, stock_report_root, stock_analysis_root, codes)
            run_git(["add", "--all", "--", *PUBLISH_PATHS], cwd=worktree)
            changed = run_git(
                ["diff", "--cached", "--quiet"], cwd=worktree, check=False
            ).returncode != 0
            if not changed:
                return {"status": "unchanged", "stock_count": count, "commit": ""}
            run_git(["commit", "-m", commit_message(codes)], cwd=worktree)
            commit = run_git(["rev-parse", "HEAD"], cwd=worktree).stdout.strip()
            if not push:
                return {"status": "validated", "stock_count": count, "commit": commit}
            pushed = run_git(["push", "origin", "HEAD:main"], cwd=worktree, check=False)
            if pushed.returncode != 0:
                detail = pushed.stderr.strip() or pushed.stdout.strip()
                raise ConnectionError(f"git push origin HEAD:main failed: {detail}")
            return {"status": "published", "stock_count": count, "commit": commit}
        finally:
            if registered:
                run_git(["worktree", "remove", "--force", str(worktree)], check=False)
            run_git(["worktree", "prune"], check=False)


def publish(
    stock_report_root: Path,
    codes: list[str],
    *,
    stock_analysis_root: Path | None = None,
    push: bool = True,
    push_attempts: int = DEFAULT_PUSH_ATTEMPTS,
) -> dict[str, Any]:
    stock_report_root = stock_report_root.resolve()
    stock_analysis_root = (stock_analysis_root or ROOT.parent / "stock_analysis").resolve()
    validate_sources(stock_report_root, stock_analysis_root)
    common_dir = git_common_dir()
    lock_path = common_dir / "ah-note-publish.lock"
    with lock_path.open("a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        ensure_git_identity(ROOT)
        attempts = max(push_attempts, 1) if push else 1
        for attempt in range(1, attempts + 1):
            try:
                result = transaction(
                    stock_report_root,
                    stock_analysis_root,
                    codes,
                    push=push,
                )
                result["attempts"] = attempt
                return result
            except ConnectionError:
                if attempt == attempts:
                    raise
                time.sleep(2 ** (attempt - 1))
    raise AssertionError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build and publish completed stock research through an isolated Git transaction."
    )
    parser.add_argument("--stock-report-root", type=Path, default=ROOT.parent / "stock_report")
    parser.add_argument("--stock-analysis-root", type=Path, default=ROOT.parent / "stock_analysis")
    parser.add_argument("--code", action="append", default=[], help="code included in the publication commit message")
    parser.add_argument("--no-push", action="store_true", help="validate and commit only in a disposable worktree")
    parser.add_argument("--push-attempts", type=int, default=DEFAULT_PUSH_ATTEMPTS)
    args = parser.parse_args()
    result = publish(
        args.stock_report_root,
        args.code,
        stock_analysis_root=args.stock_analysis_root,
        push=not args.no_push,
        push_attempts=args.push_attempts,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
