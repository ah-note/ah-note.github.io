# Session Record: 对齐原版公司页结构

- Time: 2026-09-10T11:30:00+08:00
- Window: 当前用户要求完整对齐的修改回合
- Previous Record: 2026-09-10T11-15-00+08-00-sheet-content-only.md
- Commit: pending
- Branch: feat/value-line-preview
- Task: 原版区块、字段和时间列对齐
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前对话及官方历史样页
  - Checked: 样页转录文本、页面、脚本、测试
  - Used: 原版字段与历史数字
  - Unavailable: 月度图表原始序列

## Outcome

新增评级、交易、持仓、目标价、总回报、完整流动资产负债、季度 EPS/股利及底部质量评级；补齐 10+13 年度行。近期预测回到历史列后，远期列在标签右方。以统一 52px 年份列和 312px 侧栏保证上下对应。删除固定增长公式，E 改用历史来源预测；未知图表序列和评论占位。

## Engineering Context

原样页是 2017-05-05 Disney。品牌保留 AH Note，未全文复制文章。9 项 Node 测试通过，未执行浏览器视觉测试。仅本地样板，生产队列与公开 main 未修改。

## Open Questions And Risks

月度价格/现金流倍数线/相对强弱/换手率缺少序列，图网格保留占位。用户允许占位，未绘制猜测曲线。
