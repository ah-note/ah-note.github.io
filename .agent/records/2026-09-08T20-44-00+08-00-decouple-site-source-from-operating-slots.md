# Session Record: Decouple site source from operating slots

- Time: 2026-09-08T20:44:00+08:00
- Commit: pending
- Branch: `codex/publisher-health`
- Task: Remove the AH Note publisher's residual dependency on the retired operating-analysis B slot.
- Source Sessions:
  - Harness: Codex
  - Evidence: current collaboration, production service command, publisher logs and Git-backed source trees

## Outcome

- Replaced the `stock_analysis_operating_current` input with a dedicated `stock_analysis_site_source` checkout.
- The watcher now verifies that both stock-report and stock-analysis publication mirrors are clean and fast-forwards both before every scan.
- The site-source path is independent of Bundle activation, old-version draining and runtime cleanup.
- Added tests for clean fast-forward and dirty-checkout rejection.

## Verification

- `python3 -m unittest tests.test_site_pipeline`: 20 tests passed.

## Open Questions And Risks

- Production must clone the dedicated source, install the revised service unit and confirm that the 14-page backlog self-heals.
