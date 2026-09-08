# Session Record: Accept stock research analysis v3

- Time: 2026-09-07T10:59:02+08:00
- Window: 2026-09-03T21:31:28+08:00 to 2026-09-07T10:59:02+08:00
- Previous Record: `.agent/records/2026-09-03T21-31-28+08-00-research-current-report-feed.md`
- Commit: pending
- Branch: codex/analysis-v3-publication
- Task: 让AH Note自动识别公司研究v3，同时保留现有v2报告，并在同报告期优先展示v3。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前会话、`stock_analysis`提交`2a8899a`
  - Checked: 当前发布映射、watcher、研究列表、站点测试和远端最新分支
  - Used: `stock-research-analysis-v3`公司历史与最新业务协议
  - Unavailable: 尚未产生中国能建v3真实成果，因此真实页面发布在后续运行验收

## Outcome

站点将`stock-research-analysis-v3`设为当前最高优先级，同时兼容v2和统一v1。v3指标从覆盖期最新年度的`fields.historical`和`computed.historical`读取；准入除五项Sol自审和关键价值字段外，还要求3—5个连续年度及非空最新业务拆分。watcher、详情页、排序和研究列表均接受两代当前协议，研究列表保留实际协议版本。

## Engineering Context

旧工作区落后远端且有用户修改，本次从`origin/main`建立隔离worktree，不触碰原工作区。协议兼容采用显式v3/v2优先级，避免中国能建等尚未重跑的v2页面从公开站点消失。

## Verification

- `python3 -m unittest discover -s tests -v`: 14 passed
- `git diff --check`: passed

## Open Questions And Risks

等待中国能建v3成果写入`stock_report`后执行实际站点构建、页面内容检查和公开URL验证。
