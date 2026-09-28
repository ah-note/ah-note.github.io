# Session Record: 三家生猪公司双表公开发布

- Time: 2026-09-27T22:56:00+08:00
- Window: 2026-09-18T13:01:26+08:00 之后至本记录；仅覆盖本次站点改动
- Previous Record: 2026-09-18T13-01-26+08-00-conch-five-year-publication.md
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 牧原、温氏、新希望研究完成后直接公开；主页面仅完整年度，非年度独立页面，并明确业务拆分披露边界。
- Source Sessions: 当前对话、本站 README 和 project-memory、分析仓三份 accepted 结果及两份业务资产披露补充。

## Outcome

从 origin/main 的干净 worktree 导入三家五年双表。导入器传输 period_metadata，生成各公司主页和 latest 页面；前端按期间类型分别渲染。新希望业务分部资产负债按年报数据及抵销额勾稽合并数；温氏明确猪鸡资产不能完整拆分。公开结果只保存 reader_view 和来源 URL，不保存本机抓取路径。导入测试及三家公司两种版面 Node 渲染检查通过。

## Engineering Context

分部资产是年报抵销前口径；“其他分部及未分配”由分部合计减饲料和猪产业得出。不能把抵销分配给具体业务。温氏仅产品经营收入成本可分，资产负债仍以合并口径列示。新导入结果需用期间元数据区分年度和累计期间；历史 reader_view 缺少该元数据时保持原展示。

## Open Questions And Risks

公开站外部可用性待推送和页面核验；站点渲染核查使用 Node 模拟 DOM，当前环境没有可用本地浏览器。
