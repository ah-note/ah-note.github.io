# Session Record: 双表正式读者入口

- Time: 2026-09-15T21:07:42+08:00
- Window: 2026-09-11 to 2026-09-15T21:07:42+08:00（前条旧格式记录无统一结束时间）
- Previous Record: .agent/records/20260911-capital-period-labels.md
- Commit: pending
- Branch: feat/two-table-production
- Task: 以已验收的资产表和经营表成为公司研究正式页面。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前会话、stock_analysis协议、静态页面和网站回归测试。
  - Checked: 发布构建器、研究feed、资本发布worker、公开reader_view投影。
  - Used: 用户确认双表正式化，旧报告地址保留，公司逐个迁移。
  - Unavailable: 无。

## Outcome

`/research/`按公司优先双表，新增`/research/PDD/`及哈希版本页。渲染器复制已验收样式，仅改静态取数与导航。数据来自自主Agent最终accepted，公开投影移除运行路径，金额和解释不变。普通整站重建亦合并双表目录，旧报告固定地址保留。51项网站测试通过，本地Chrome验证2026半年两表同步展开。

## Engineering Context

新导入器调用分析仓校验工具，保存原结果哈希和公开视图哈希；新队列项复用资本发布器与单一Git锁。分析代码和默认入口属于stock_analysis仓，网站只消费验证结果。原本地main工作区有data/stocks.json未提交变化，本次基于origin/main创建独立工作区。

## Open Questions And Risks

待正式推送部署和公网验证。尚未迁移公司保持旧报告，不把既有数据自动转换为新分析结果。
