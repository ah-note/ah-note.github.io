# Session Record: ZBH 五年年报双表发布

- Time: 2026-09-28T16:13:33+08:00
- Window: 2026-09-28T15:33:00+08:00 之后至本记录
- Previous Record: `.agent/records/2026-09-28T15-33-00+08-00-restore-hkd-label.md`
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 将 ZBH 2021—2025 五份年报双表替换为当前公司页版本。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前对话、分析批次状态与验收产物、站点导入和测试输出。
  - Checked: `two_table_reports.py`、ZBH 旧版与新版公开数据、目录和公司页。
  - Used: `stock_analysis` 批次 `two-table-zbh-five-annual-20260928` 的最终验收结果。
  - Unavailable: 浏览器自动化阻止访问本地 HTTP 预览；使用静态页面、公开 JSON 与渲染器测试验证。

## Outcome

导入五年已验收结果，生成新的内容寻址版本，将公司主页和目录切到 2021—2025 年，保留旧版固定地址。公开资产表与经营表均只含五个年度，单位为亿美元；2025 年年报来源链接已核实。导入器及前端相关测试通过，`git diff --check` 通过。

## Engineering Context

2021 年分拆前余额与持续经营历史损益的口径差异、2025 年收购及分部费用重分类由分析产物解释，站点仅投影 `reader_view`。分析验收保留 20 处不超过 0.001 亿美元的报表舍入尾差；网页数值格式器将接近零的浮点残差显示为零并使用常规十进制格式。

## Open Questions And Risks

本地浏览器预览受客户端阻止；发布后需核对 GitHub Pages 实际页面及部署状态。
