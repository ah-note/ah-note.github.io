"""Single-owner publisher for validated capital-statement queue items."""
from __future__ import annotations

import argparse
import fcntl
import json
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


BEIJING = ZoneInfo("Asia/Shanghai")


def now_iso() -> str:
    return datetime.now(BEIJING).isoformat(timespec="seconds")


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def initialize(root: Path) -> None:
    for state in ("pending", "processing", "completed", "failed"):
        (root / state).mkdir(parents=True, exist_ok=True)


def run_git(site_root: Path, args: list[str], *, cwd: Path | None = None, check: bool = True):
    result = subprocess.run(["git", *args], cwd=cwd or site_root, text=True, capture_output=True)
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip())
    return result


def publish(item: dict, site_root: Path) -> dict:
    source = Path(item["result_path"])
    if not source.is_file():
        raise ValueError("CAPITAL_RESULT_NOT_FOUND")
    common = run_git(site_root, ["rev-parse", "--git-common-dir"]).stdout.strip()
    common_dir = Path(common) if Path(common).is_absolute() else (site_root / common).resolve()
    with (common_dir / "ah-note-publish.lock").open("a+") as git_lock:
        fcntl.flock(git_lock, fcntl.LOCK_EX)
        run_git(site_root, ["fetch", "origin", "main"])
        with tempfile.TemporaryDirectory(prefix="capital-publish-") as temporary:
            worktree = Path(temporary) / "site"
            try:
                run_git(site_root, ["worktree", "add", "--detach", str(worktree), "origin/main"])
                subprocess.run([
                    sys.executable, str(worktree / "scripts/publish_capital_statement.py"),
                    "--input", str(source), "--site-root", str(worktree),
                    "--name", item["name"], "--code", item["company"],
                    "--run-id", item["source_run"], "--bundle-sha", item["bundle_revision"],
                ], cwd=worktree, check=True)
                run_git(site_root, ["add", "--all", "--", "capital"], cwd=worktree)
                changed = run_git(site_root, ["diff", "--cached", "--quiet"], cwd=worktree, check=False).returncode != 0
                if changed:
                    run_git(site_root, ["config", "user.name", "AH Note Publisher"], cwd=worktree)
                    run_git(site_root, ["config", "user.email", "publisher@ah-note.github.io"], cwd=worktree)
                    run_git(site_root, ["commit", "-m", f"Publish capital statement for {item['company']} {item['period_end']}"], cwd=worktree)
                    pushed = run_git(site_root, ["push", "origin", "HEAD:main"], cwd=worktree, check=False)
                    if pushed.returncode:
                        raise ConnectionError(pushed.stderr.strip() or pushed.stdout.strip())
                    commit = run_git(site_root, ["rev-parse", "HEAD"], cwd=worktree).stdout.strip()
                else:
                    commit = ""
                return {"status": "published" if changed else "unchanged", "commit": commit}
            finally:
                run_git(site_root, ["worktree", "remove", "--force", str(worktree)], check=False)
                run_git(site_root, ["worktree", "prune"], check=False)


def recover(root: Path) -> int:
    count = 0
    for source in (root / "processing").glob("*.json"):
        item = json.loads(source.read_text(encoding="utf-8"))
        item["status"] = "pending"
        write_json(root / "pending" / source.name, item)
        source.unlink()
        count += 1
    return count


def process_next(root: Path, site_root: Path) -> dict:
    for source in sorted((root / "pending").glob("*.json")):
        item = json.loads(source.read_text(encoding="utf-8"))
        if item.get("next_attempt_at") and datetime.fromisoformat(item["next_attempt_at"]) > datetime.now(BEIJING):
            continue
        claimed = root / "processing" / source.name
        try:
            source.replace(claimed)
        except FileNotFoundError:
            continue
        item["status"] = "processing"
        write_json(claimed, item)
        try:
            result = publish(item, site_root)
        except Exception as exc:
            attempts = int(item.get("attempt_count", 0)) + 1
            item.update(attempt_count=attempts, error=str(exc), updated_at=now_iso())
            retryable = isinstance(exc, (ConnectionError, TimeoutError)) and attempts < 3
            if retryable:
                item.update(status="pending", next_attempt_at=(datetime.now(BEIJING) + timedelta(seconds=15 * 2 ** (attempts - 1))).isoformat())
                target = root / "pending" / claimed.name
            else:
                item.update(status="failed", next_attempt_at=None)
                target = root / "failed" / claimed.name
            write_json(target, item)
            claimed.unlink()
            return {"status": item["status"], "period_key": item["period_key"], "error": str(exc)}
        item.update(status="completed", publication=result, completed_at=now_iso(), updated_at=now_iso(), next_attempt_at=None)
        target = root / "completed" / claimed.name
        write_json(target, item)
        claimed.unlink()
        return {"status": "completed", "period_key": item["period_key"], "publication": result}
    return {"status": "idle"}


def serve(root: Path, site_root: Path, poll_seconds: float, once: bool) -> None:
    initialize(root)
    with (root / "publisher.lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        recover(root)
        while True:
            result = process_next(root, site_root)
            print(json.dumps(result, ensure_ascii=False), flush=True)
            if once:
                return
            if result["status"] in {"idle", "pending"}:
                time.sleep(max(poll_seconds, 1))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["serve", "once"])
    parser.add_argument("--queue-root", required=True, type=Path)
    parser.add_argument("--site-root", required=True, type=Path)
    parser.add_argument("--poll-seconds", type=float, default=5)
    args = parser.parse_args()
    serve(args.queue_root.resolve(), args.site_root.resolve(), args.poll_seconds, args.command == "once")


if __name__ == "__main__":
    main()
