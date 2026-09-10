# Alignment Log

## 2026-09-03T16:36:11+08:00 Asia/Shanghai

- Range: repository bootstrap through commit `0ce7c080`.
- Changed pages:
  - `project-memory/index.md`
  - `project-memory/project/publication-pipeline.md`
  - `project-memory/status/current.md`
  - `.agent/alignment-record`
  - `.agent/alignment-log.md`
- Absorbed records: all `8` files from `.agent/records/*.md`, covering unified report publication, remote publisher hardening, formal report feeds, current-schema admission, three-report publication and the simplified research index.
- Archive path: `.agent/records/absorbed/2026-09-03/`.
- Resolved context:
  - AH Note is the sole reader-facing company-report channel; `stock_report` is an internal source and traceability repository.
  - Current-schema reports require complete structural and self-review admission and override legacy reports for the same company and period.
  - The public layer renders research outputs without repairing their economic interpretation.
  - Current reports for Carpenter Tan, Ninebot, PDD and China Energy Engineering are published; the research index opens directly on the article feed.
- Verification: ten site-pipeline tests passed for the current-schema publication changes; GitHub Pages deployments through `0ce7c080` completed successfully.

## 2026-09-08T23:44:00+08:00 Asia/Shanghai

- Range: `0ce7c080..2ff825ed` plus pending `ah_v3` industry-browser update.
- Changed pages:
  - `project-memory/project/publication-pipeline.md`
  - `project-memory/status/current.md`
  - `.agent/alignment-record`
  - `.agent/alignment-log.md`
- Absorbed records: all 10 pending files from `.agent/records/*.md`, covering current-report feed, v3/v4 schema admission, industry browser and display collapse, publisher failure atomicity/recovery, missing-page reconciliation, dedicated site-source checkout and the `ah_v3` switch.
- Archive path: `.agent/records/absorbed/2026-09-08/`.
- Resolved context:
  - Publication remains isolated, failure-atomic and sourced from dedicated clean mirrors.
  - The industry browser reads the finalized `stock_analysis` `ah_v3` snapshot and preserves residual leaves as upstream evidence states.
  - Display-only duplicate-name collapse remains separate from the auditable taxonomy.
- Verification: 32 site tests passed and the real `ah_v3` industry-only build generated 8,061 issuers across 244 leaves.

## 2026-09-10T18:03:00+08:00 Asia/Shanghai

- Range: `2ff825ed..4731cf9a`.
- Changed pages:
  - `README.md`
  - `project-memory/project/publication-pipeline.md`
  - `project-memory/status/current.md`
  - `.agent/alignment-record`
  - `.agent/alignment-log.md`
  - `.agent/absorbed-records-20260910.json`
- Absorbed records: 11 files listed in `.agent/absorbed-records-20260910.json`, covering A/H v4, shared-tree recipe integration, multi-market browsing and QA, independent classification publication, lightweight evidence levels, and SIC-backed batch mappings.
- Resolved context:
  - Industry publication now reads the versioned A/H/US shared-tree recipe and builds its intermediate snapshot only in a temporary directory.
  - A mapped company may be browsed without being presented as industry- or company-reviewed; unresolved mappings and other exceptions remain explicit.
  - Classification-only changes are independently published and include optional SEC evidence in the content digest.
- Verification: latest real build generated 13,349 issuers across 378 leaves, including 12,216 mapped and 826 unmapped; 45 Python tests and the Node browser-state test passed before commit `4731cf9a` was pushed to main.
