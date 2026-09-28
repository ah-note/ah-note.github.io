# Session Record: ZBH 双表亿单位展示

- Time: 2026-09-28T15:18:00+08:00
- Window: 2026-09-28T15:05:00+08:00 之后至本记录
- Previous Record: `.agent/records/2026-09-28T15-05-00+08-00-zbh-one-year-publication.md`
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 将ZBH及今后双表金额统一亿单位，杜绝公开页面科学计数法。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前对话、AH Note线上及本地ZBH页面、分析仓修正产物。
  - Checked: 导入器、表格渲染器、内容寻址JSON、统一目录及相关测试。
  - Used: `stock_analysis` 提交 `85bc9a12` 的亿单位新报告及校验要求。
  - Unavailable: 无。

## Outcome

ZBH当前页面切换到新内容哈希版本，资产、经营金额表头为“亿美元”；2025合并净资产127.058亿美元，营业收入82.315亿美元。原百万单位版本留在不可变历史路径。站点导入拒绝非1亿缩放或可见文字中的科学计数法；表格数值使用标准十进制格式，大数不回退指数形式。旧USD单位标签在网页显示时转换为自然语言。站点相关Python 7项、前端杂项与数字格式测试通过，导入幂等和 `git diff --check` 通过。

## Engineering Context

根因是旧ZBH报告以百万美元缩放，生成器写出 `USD / 1e+06`。修正后的报告保持原始事实金额不变，仅修改阅读缩放和内容寻址版本。站点导入器把显示缩放作为发布门槛，前端对数值及旧单位标签做兜底格式化。

## Open Questions And Risks

GitHub Pages部署完成后须复核线上当前JSON和页面表头。
