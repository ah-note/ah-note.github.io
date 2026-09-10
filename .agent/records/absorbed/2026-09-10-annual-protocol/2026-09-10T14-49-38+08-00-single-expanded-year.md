# Session Record: 唯一展开年份

- Time: 2026-09-10T14:49:38+08:00
- Window: 2026-09-10T14:47:13+08:00 to 2026-09-10T14:49:38+08:00
- Previous Record: 2026-09-10T14-47-13+08-00-fold-year-columns.md
- Commit: pending
- Branch: feat/value-line-preview
- Task: 多年版同时只展开一个年份
- Source Sessions: Codex当前会话、前端状态逻辑与回归测试；未检索其他历史或浏览器视觉QA。

## Outcome

两张表联动到唯一年份，点击其他年份替换，重复点击当前年份全部折叠。更新状态与同页事件测试。简版与财务数据不变。

## Engineering Context

替代上一轮两表独立选年的规则，仍保持简版列结构。

## Open Questions And Risks

无新增数据风险，未改生产队列或公开部署。
