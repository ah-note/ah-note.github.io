# Alignment Log

## 2026-09-10T13:34:41+08:00 Asia/Shanghai

- Range: `2ff825ed..d03baf8a`，吸收10条本站增量记录；范围内自动报告提交仅作为Git历史，不推断运行状态。
- Changed pages: project-memory/index.md、project/company-sheet-preview.md、project/publication-pipeline.md、status/current.md、README.md。
- Absorbed records: 10，归档到`.agent/records/absorbed/2026-09-10/`；pending: 0。
- Resolved context: 行业源ah_v4与现有实现对齐；本地原型与正式发布分离；紧凑表格、说明另页、12资产主项和资本活动双重闭合；估计税负不得冒充财报事实。
- Conflicts: 13:00旧记录有已知误记时间，按Git演进解释，不修写历史；Sites不可用是早期环境判断，不沿用为当前事实。生产计数标为历史快照，未作远程核验。
- Verification: 本轮23项资产与资本活动测试通过，HTTP200；未进行浏览器视觉QA或公开部署。

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
