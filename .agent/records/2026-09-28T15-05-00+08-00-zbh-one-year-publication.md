# Session Record: ZBH 2025 单年度双表发布

- Time: 2026-09-28T15:05:00+08:00
- Window: 本工作树未见未吸收的前序记录；2026-09-28T14:42:00+08:00 至本记录
- Previous Record: none
- Commit: pending
- Branch: publish/hog-three-20260927
- Task: 将 ZBH 最近一个完整年度双表发布到 AH Note。
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前对话、已验收双表JSON、站点导入和相关测试。
  - Checked: `two_table_reports.py`、生成目录、公开报告JSON、目录文件、渲染器。
  - Used: stock_analysis 批次 `two-table-zbh-one-annual-20260928` 的最终验收产物。
  - Unavailable: 浏览器自动化插件无法加载浏览器请求头策略；静态页面与JSON检查已完成。

## Outcome

导入 ZBH 2025 年单年度 reader_view，生成内容寻址版本、公司页及统一目录条目。2024 年为隐藏比较期，公开JSON的资产表展示期间只有2025年。年报独占任务的目录摘要显示“1个完整年度”，不误写最新累计披露。站点导入通过分析协议校验；相关Python 7项及前端杂项测试通过，生成文件 `git diff --check` 通过。

## Engineering Context

分析仓协议校验初次在站点Python 3.9下因浮点尾数与研究端Python 3.14不同而误拒收；分析仓提交 `94c83b32` 加入只针对浮点尾数的极小容差后导入成功。站点仍只公开reader_view并剔除本地文件路径，原报告保留在分析运行目录。

## Open Questions And Risks

未进行浏览器截图复核；发布后需核对GitHub Pages的实际可访问页面。双表保留11处年报百万美元一位小数所致的约0.1舍入差。
