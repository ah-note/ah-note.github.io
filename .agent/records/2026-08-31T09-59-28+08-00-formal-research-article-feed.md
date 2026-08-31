# Session Record: Formal research article feed

- Time: 2026-08-31T09:59:28+08:00
- Previous Record: `.agent/records/2026-07-26T21-37-00+08-00-automatic-publisher-deployed.md`
- Commit: pending
- Branch: `codex/new-reports-20260831`
- Task: Add a dedicated AH Note article feed for approved formal stock research and connect it to automatic publication.
- Source Sessions:
  - Harness: Codex
  - Evidence: AH Note source, myv-daily public layout, formal research SQLite registry, immutable report Markdown, browser preview, and unit tests
  - Checked: five latest approved reports at stock_report commit `8ba488fc2e27d12ed8f7b1ea350770899636a954`
  - Used: `research_versions`, `latest_research_versions`, `report_review_json`, report SHA-256, and generated report Markdown

## Outcome

- Added `/research/` as a narrow, chronological article feed inspired by myv-daily while keeping the existing ranking and legacy report pages intact.
- Added immutable detail URLs at `/research/<code>/<analysis-version>/` and initially published 古茗、谭木匠、伟星股份、安踏体育和贵州茅台.
- The feed only accepts the latest formal version when research is complete, report review is `pass` or `pass_with_warnings`, the report stays inside the source repository, and its SHA-256 matches the registry.
- Added `data/research.json` as the public article manifest. List excerpts skip report-period disclaimers and favor business-model prose.
- Extended the watcher to detect formal reports without relying on legacy `result.json` and added optional fast-forward synchronization for a dedicated clean stock_report publication mirror.
- Local browser verification covered the feed and a full article containing all three recast tables. Seven pipeline tests pass.

## Engineering Context

- The old `/reports/` route remains the compatibility view for unified/legacy result protocol output. Formal research is deliberately separate because its authoritative registry and approval semantics are different.
- The production service should point at `%h/aicode/stock_report_ah_note`, a clean Git clone used only for publication. Runtime state remains under `%h/aicode/runs/ah-note-publisher/`.

## Open Questions And Risks

- GitHub Pages deployment latency remains external to the repository; public verification is required after push.
- The publication mirror must remain clean. The watcher stops synchronization and reports an error instead of overwriting remote changes.
