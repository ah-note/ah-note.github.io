# Session Record: 补齐双表并修复发布误删

- Time: 2026-09-15T21:56:00+08:00
- Window: 2026-09-15T21:50:00+08:00 to 2026-09-15T21:56:00+08:00
- Previous Record: 2026-09-15T21-50-00+08-00-compact-capital-list.md
- Commit: pending
- Branch: feat/two-table-production
- Task: 恢复拼多多、补接谭木匠博源，确保新增双表自动进入列表。
- Source Sessions: Codex当前对话、本站Git历史与测试、分析仓web_view及company_two_table_pipeline；未读取其他会话。

## Outcome

旧write_research_pages递归清空共享research目录，自动发布28dd7634删除了拼多多页面，目录JSON仍在。改为增量写入，保留其他产品和历史版本。通过原校验导入器恢复拼多多；谭木匠、博源调用原reader展示构建，保留人工展示修订及归母计算，不重算财务事实。历史迁移独立入口、明确provenance，不放宽新Agent协议准入。

54项测试通过，新增“安装新双表→旧发布器生成→刷新列表”回归验证，页面、版本JSON及入口均保留。核对生产分析流水线完成后enqueue_publication，网站worker安装后提交双表目录及两份公共列表，新增公司无需手改列表。

## Open Questions And Risks

提交后部署并验证三家公司HTTP页面与引用JSON。历史样本不视为新协议Agent运行。
