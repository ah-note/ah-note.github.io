#!/usr/bin/env python3
from __future__ import annotations

import argparse
import fcntl
import json
import re
import subprocess
from pathlib import Path
from typing import Any

from build_site import ROOT, build_site


PUBLISH_PATHS = ["data", "index.html", "reports", "reference"]
CODE_RE = re.compile(r"^[0-9A-Z.-]+$")


def run_git(args: list[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {detail}")
    return completed


def clean_worktree_required() -> None:
    status = run_git(["status", "--porcelain"]).stdout.strip()
    if status:
        raise RuntimeError(f"AH Note worktree is not clean:\n{status}")


def ensure_git_identity() -> None:
    defaults = {
        "user.name": "AH Note Publisher",
        "user.email": "publisher@ah-note.github.io",
    }
    for key, value in defaults.items():
        configured = run_git(["config", "--get", key], check=False)
        if configured.returncode != 0 or not configured.stdout.strip():
            run_git(["config", key, value])


def commit_message(codes: list[str]) -> str:
    safe_codes = sorted({code.upper() for code in codes if CODE_RE.fullmatch(code.upper())})
    if not safe_codes:
        return "Publish completed stock research"
    shown = ", ".join(safe_codes[:4])
    suffix = f" and {len(safe_codes) - 4} more" if len(safe_codes) > 4 else ""
    return f"Publish stock research for {shown}{suffix}"


def publish(stock_report_root: Path, codes: list[str], *, push: bool = True) -> dict[str, Any]:
    stock_report_root = stock_report_root.resolve()
    if not (stock_report_root / "data" / "analysis" / "stock_research").is_dir():
        raise RuntimeError(f"stock research source not found under {stock_report_root}")
    git_dir = ROOT / ".git"
    if not git_dir.is_dir():
        raise RuntimeError(f"AH Note is not a Git checkout: {ROOT}")

    lock_path = git_dir / "ah-note-publish.lock"
    with lock_path.open("a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        ensure_git_identity()
        clean_worktree_required()
        run_git(["pull", "--ff-only", "origin", "main"])
        clean_worktree_required()
        if push:
            # Retry a commit left locally by an earlier transient push failure before rebuilding.
            run_git(["push", "origin", "HEAD:main"])

        count = build_site(stock_report_root)
        run_git(["add", "--all", "--", *PUBLISH_PATHS])
        changed = run_git(["diff", "--cached", "--quiet"], check=False).returncode != 0
        if not changed:
            return {"status": "unchanged", "stock_count": count, "commit": ""}

        run_git(["commit", "-m", commit_message(codes)])
        commit = run_git(["rev-parse", "HEAD"]).stdout.strip()
        if push:
            run_git(["push", "origin", "HEAD:main"])
        return {"status": "published" if push else "committed", "stock_count": count, "commit": commit}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build, commit, and publish completed stock research to AH Note.")
    parser.add_argument("--stock-report-root", type=Path, default=ROOT.parent / "stock_report")
    parser.add_argument("--code", action="append", default=[], help="code included in the publication commit message")
    parser.add_argument("--no-push", action="store_true", help="commit locally without pushing")
    args = parser.parse_args()
    result = publish(args.stock_report_root, args.code, push=not args.no_push)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
