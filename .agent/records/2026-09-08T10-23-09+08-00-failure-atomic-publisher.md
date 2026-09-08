# Session Record: Failure-atomic AH Note publisher

- Time: 2026-09-08T10:23:09+08:00
- Window: 2026-09-07T22:06:09+08:00 to 2026-09-08T10:23:09+08:00
- Previous Record: `.agent/records/2026-09-07T22-06-09+08-00-industry-navigation-entry.md`
- Commit: pending
- Branch: `codex/publisher-transaction`
- Task: Permanently prevent failed site builds from poisoning the automatic publication checkout.
- Source Sessions:
  - Harness: Codex
  - Evidence: current collaboration, remote watcher journal and Git status, local repository history
  - Checked: remote AH Note checkout, publisher service, publication scripts, industry snapshot reader, tests
  - Used: the missing industry snapshot failure and the five partially regenerated tracked files it left behind
  - Unavailable: none

## Outcome

- Publishing now builds, commits and pushes from a disposable Git worktree based on the latest remote `main`; the worktree is forcibly removed after success or failure.
- The stock-analysis path is explicit across the publisher CLI, watcher and systemd unit instead of relying on a missing sibling checkout.
- Industry snapshot files and validation status are checked before any generated site file is overwritten, including direct builds.
- Push failures retry the complete transaction up to three times with exponential backoff, so retries also absorb remote non-fast-forward updates.
- Added integration coverage proving a build that writes partial output and then fails leaves the persistent checkout byte-for-byte clean.
- All 26 tests pass locally. Production recovery and backlog publication follow after this commit is pushed.

## Engineering Context

The previous publisher built directly inside its long-lived checkout. `build_site.py` wrote aggregate JSON and index pages before reading the externally stored industry snapshot. A missing `/root/aicode/stock_analysis` therefore raised late, left five tracked files dirty, and caused every later watcher iteration to stop at its clean-checkout guard. Preflight reduces avoidable work, while disposable worktrees provide the actual failure-atomic boundary for all build errors.

## Open Questions And Risks

- The production checkout's five known generated-file changes must be discarded once, then the service must be upgraded and the 46-report publication backlog verified.
