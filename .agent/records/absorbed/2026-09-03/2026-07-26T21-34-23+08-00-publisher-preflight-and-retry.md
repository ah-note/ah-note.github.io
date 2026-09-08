# Session Record: Publisher preflight and retry

- Time: 2026-07-26T21:34:23+08:00
- Window: 2026-07-26T21:30:40+08:00 to 2026-07-26T21:34:23+08:00
- Previous Record: `.agent/records/2026-07-26T21-30-40+08-00-remote-publisher-cache-hygiene.md`
- Commit: pending
- Branch: main
- Task: Complete remote automatic publishing after the initial deployment failures.
- Source Sessions:
  - Harness: Codex
  - Evidence: remote watcher, Git commit, and push output
  - Checked: remote AH Note staged scope, Git identity, generated site inventory
  - Used: remote publisher failure output and repository history
  - Unavailable: none

## Outcome

- The remote publisher generated 92 stock pages, including seven completed reports present only on the remote `stock_report`, and published commit `15da6c1` after repository-local author identity was configured.
- Added publisher preflight that supplies a repository-local automation identity when missing.
- The publisher now retries any clean local commit that was left ahead of `origin/main` by a transient push failure before starting a new build.
- Static builds preserve the prior `built_at` value when the public stock payload is unchanged. Repeated builds now produce no timestamp-only Git diff.

## Engineering Context

- Publication preconditions are checked before generated files are changed, preventing a missing identity or known push problem from leaving the service worktree dirty.
- The source watcher remains responsible for saving its digest state only after the publisher returns successfully; failed runs therefore retry the same report.

## Open Questions And Risks

- Pulling this hardening commit to the remote host, installing the systemd unit, and verifying the public page remain pending.
