# Session Record: Remote publisher cache hygiene

- Time: 2026-07-26T21:30:40+08:00
- Window: 2026-07-26T21:26:41+08:00 to 2026-07-26T21:30:40+08:00
- Previous Record: `.agent/records/2026-07-26T21-26-41+08-00-unified-report-publishing.md`
- Commit: pending
- Branch: main
- Task: Deploy and verify the automatic AH Note publisher on the remote analysis server.
- Source Sessions:
  - Harness: Codex
  - Evidence: remote unit test and first watcher-run output
  - Checked: `/root/aicode/ah-note.github.io`, remote Python 3.14 behavior
  - Used: publisher clean-worktree guard and remote Git status output
  - Unavailable: none

## Outcome

- Remote AH Note clone and all four pipeline tests succeeded.
- The first watcher run correctly refused to publish because test/import execution created untracked Python bytecode cache directories.
- Added repository ignore rules for `__pycache__/` and `*.py[cod]`; the clean-worktree requirement remains unchanged.

## Engineering Context

- Importing the publisher itself can create bytecode cache files, so these runtime files must be ignored for the service to remain reproducible and restart-safe.
- Generated Python caches are not project facts and must never enter publication commits.

## Open Questions And Risks

- Remote watcher retry, systemd installation, and public-page verification remain pending after this fix is pushed.
