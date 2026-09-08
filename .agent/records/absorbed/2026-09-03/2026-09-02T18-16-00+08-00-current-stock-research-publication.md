# Session Record: Publish current stock research through AH Note

- Time: 2026-09-02T18:16:00+08:00
- Window: 2026-08-31T09:59:28+08:00 to 2026-09-02T18:16:00+08:00
- Previous Record: `.agent/records/2026-08-31T09-59-28+08-00-formal-research-article-feed.md`
- Commit: pending
- Branch: detached from `origin/main`
- Task: Make AH Note the sole public channel for current company research and publish the PDD 2025 report.
- Source Sessions:
  - Harness: Codex
  - Evidence: current user instruction, AH Note source, PDD `stock-research-analysis-v2` result and report
  - Checked: source normalization, publication watcher, generated listing/detail pages, public-link hygiene, unit tests
  - Used: validated PDD artifacts from `stock_report` commit `f903948d7da49ff6f88967ff6baec13c42131172`
  - Unavailable: current PDD market-price snapshot, so market-relative fields remain empty

## Outcome

AH Note now treats `stock-research-analysis-v2` as the current company-research publication schema, ahead of the older unified and legacy formats. Current results are publishable only when all five self-review checks pass and actual FCFF, stable FCFF and common-equity value are present. The watcher detects settled v2 reports automatically.

The site maps v2 period, currency, revenue, gross profit, margins, parent profit, FCFF and operating-business value without reinterpreting the research. Report-list summaries come from the approved report prose. Security codes without A/H suffixes are identified as US listings. PDD is generated at `/reports/PDD/` with its complete report and corrected ROIC presentation.

## Engineering Context

`stock_report` remains an internal transfer and traceability repository because the current publisher consumes its validated artifacts. AH Note is the only reader-facing publication endpoint; source-repository blob URLs are not the report-delivery interface. Ten pipeline tests pass.

## Open Questions And Risks

The current v2 schema does not include a valid PDD market snapshot, so AH Note intentionally leaves PE, market capitalization and market-relative return fields empty. The watcher service on the active publication host must fast-forward to this AH Note commit before subsequent v2 reports publish automatically.
