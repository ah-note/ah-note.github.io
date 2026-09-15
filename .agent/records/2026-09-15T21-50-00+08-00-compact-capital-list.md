# Session Record: 恢复紧凑资本目录

- Time: 2026-09-15T21:50:00+08:00
- Window: 2026-09-15T21:46:00+08:00 to 2026-09-15T21:50:00+08:00
- Previous Record: 2026-09-15T21-46-00+08-00-unified-capital-entry.md
- Commit: pending
- Branch: feat/two-table-production
- Task: 资本表目录恢复之前的简洁列表形式。
- Source Sessions: Codex；依据当前对话、本站git历史028b91fa的capital/index.html、生成模板与测试；未读取其他会话。

## Outcome

恢复原report-list/table样式，一家公司一行，列公司、代码、内容、报告截止日。去掉卡片和正文摘要；双表→深度研报→报告的选择逻辑与2929家公司不变，研究兼容目录同步。53项Python测试通过，新增紧凑布局回归断言。

## Engineering Context

用户要求合并入口不等于重新设计列表。复用原样式，修改共享生成模板而非单独静态HTML。研究数据和详情不变。

## Open Questions And Risks

提交后按既有Git发布链路部署，核对公开页面。
