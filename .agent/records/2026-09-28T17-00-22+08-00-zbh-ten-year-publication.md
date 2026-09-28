# Session Record: ZBH 十年年报双表发布

- Time: 2026-09-28T17:00:22+08:00
- Window: 2026-09-28T16:13:33+08:00 之后至本记录
- Previous Record: `.agent/records/2026-09-28T16-13-33+08-00-zbh-five-year-publication.md`
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 将 ZBH 年报双表从五年扩展到 2016—2025 十年并更新公开页面。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前对话、官方年报目录与 PDF、分析批次状态和验收产物、站点导入及测试输出。
  - Checked: ZBH 五年旧版、十年验收结果、导入器、公司页及目录。
  - Used: `stock_analysis` 批次 `two-table-zbh-ten-annual-20260928` 的最终验收结果。
  - Unavailable: 无。

## Outcome

导入十年已验收结果，生成新的内容寻址版本，把 ZBH 当前公司页和目录摘要切为 2016—2025 十个完整年度；五年版固定地址保留。资产表和经营表均含十期，金额为亿美元。站点导入通过，Python 7 项及前端杂项测试通过，`git diff --check` 通过。

## Engineering Context

分析端复用五年成果并核对十份发行人年报。2018 年报追溯重列 2016—2017 年数据，2022 年报提供 2020 年持续经营比较数；2019—2020 年范围断点及地区分部定义变化由公开报告说明，站点只投影验收后的 `reader_view`。验收结果无结构错误，保留 18 处不超过 0.001 亿美元的原报舍入尾差。

## Open Questions And Risks

提交时尚待 GitHub Pages 部署及线上页面核对。
