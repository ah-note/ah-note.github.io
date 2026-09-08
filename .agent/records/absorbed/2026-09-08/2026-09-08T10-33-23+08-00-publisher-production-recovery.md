# Session Record: Publisher production recovery

- Time: 2026-09-08T10:33:23+08:00
- Window: 2026-09-08T10:23:09+08:00 to 2026-09-08T10:33:23+08:00
- Previous Record: `.agent/records/2026-09-08T10-23-09+08-00-failure-atomic-publisher.md`
- Commit: pending
- Branch: `codex/publisher-transaction`
- Task: Deploy the failure-atomic publisher, recover its backlog and verify public delivery.
- Source Sessions:
  - Harness: Codex
  - Evidence: current collaboration, production systemd state, Git commits and public HTTP responses
  - Checked: `root@43.98.202.194`, `ah-note-publisher.service`, publisher state, AH Note remote tree and all current-analysis URLs
  - Used: production deployment and publication results
  - Unavailable: GitHub Pages builds API returned unauthenticated 404; direct public URL validation was used instead

## Outcome

- Stopped the poisoned old watcher and restored only the five confirmed partial generated files: `data/research.json`, `data/stocks.json`, `index.html`, `reports/index.html` and `research/index.html`.
- Pulled publisher commit `7177a229`, installed the service with explicit stock-analysis input, and passed all 26 tests on production.
- The one-shot recovery published commit `daed163e` on its first attempt and advanced watcher state only after the push succeeded.
- Re-enabled the systemd watcher; it is active, enabled and running against the clean persistent checkout.
- The 264-company representative pool now has 128 current-protocol analyses. All 128 exist in the AH Note Git source and all 128 public report URLs returned HTTP 200.

## Engineering Context

The watcher's state also tracks legacy-compatible and registered formal reports, so its total of more than 2,600 codes is not the operating-analysis completion count. Publication completeness for the current queue must be measured by intersecting the 264-company manifest with current `stock-research-analysis-v*` results.

## Open Questions And Risks

- None for the publisher recovery. Queue analysis failures and remaining material-preflight gaps are separate from the publication service.
