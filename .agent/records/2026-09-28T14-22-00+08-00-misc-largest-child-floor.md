# Session Record: 杂项分母下限与子项字号

- Time: 2026-09-28T14:22:00+08:00
- Window: 2026-09-28T14:11:00+08:00 之后至本记录
- Previous Record: 2026-09-28T14-11-00+08-00-misc-parent-budget.md
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 经营周转资产与义务净额被正负项目抵销时，杂项预算加入最大单个子项下限；使杂项字号与其他子项一致。
- Source Sessions:
  - Harness: Codex 当前会话
  - Evidence: 用户提出新的分母口径与排版问题。
  - Checked: 三家生猪公司的年报和半年双表、站点渲染器、测试与在线页面模板。
  - Used: 当前已发布 reader_view 与站点显著性规则。

## Outcome

每个可见期间以分类展示金额绝对值和最大单个子项绝对值的较大者作为10%分母。杂项成员仍逐项用绝对金额消耗预算，不以正负抵销后的净额通过检查。杂项行字号调整为与普通项目相同的12px，金额正常字重，名称保留同级项目的粗体。三家公司年报与半年共六个视图逐期检查未超上限；Node 交互测试、56项 Python 测试及行业前端测试通过。公开页面资源版本更新，不改报告 JSON。

## Engineering Context

分类净额可因经营资产与义务互相抵销而远小于主要子项；最大单个子项只用作预算分母下限，不改变分类净额、杂项带符号展示额或原始项目金额。

## Open Questions And Risks

Pages 部署及线上资源核验待推送后完成。
