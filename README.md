# AH Note

Public stock research notes website for multi-market company reports.

## Build

The published site is static. Local source inputs live under `_source/` and are
ignored by git.

```bash
python3 scripts/build_site.py
python3 -m http.server 8765
```

AH Note 是公司研究报告唯一的公开发布渠道。`build_site.py` 会把
`_source/stock_research/` 作为旧报告兜底，并优先读取相邻
`stock_report/data/analysis/stock_research/` 中统一 Agent 的已校验结果；`stock_report`
只作为内部中转和追溯仓，不作为面向读者的发布入口。同一股票只发布最新报告期；相同报告期内，
`stock-research-analysis-v2` 优先于 `stock-research-result-v1` 和旧版结果。

`/research/` 是统一的最新研究列表：优先展示通过五项自审和关键字段校验的
`stock-research-analysis-v2` 当前公司研究，并链接到 `/reports/<code>/`。列表同时保留旧版
“深度研报”发布链路；它从
`stock_report/data/derived/stock_research/research.sqlite3` 读取每家公司最新研究版本，且只发布
研究状态完成、报告审阅通过、正文哈希校验一致的不可变 `versions/.../report.md`。每份报告作为一篇
固定地址的文章展示。同一公司和报告期同时存在两种报告时，列表只保留当前协议版本。

发布单次更新：

```bash
python3 scripts/publish_site.py --stock-report-root ../stock_report --code 000726.SZ
```

远端可安装 `ops/ah-note-publisher.service`。它使用专用的干净
`stock_report_ah_note` 镜像，每轮先执行 Git 快进同步，再监听协议校验完成的统一结果和通过验收的
正式报告；报告文件稳定后串行构建、提交并推送本站。状态文件保存在站点仓库外，不污染 Git 工作区。
自动发布只重建本轮发生变化的当前详情页；研究清单和不可变正式文章始终整体刷新。

Open `http://127.0.0.1:8765/` to preview.

Published pages:

- `/` - ranking tables
- `/reports/` - report list
- `/reports/<code>/` - full report
- `/research/` - latest approved company research feed
- `/research/<code>/<analysis-version>/` - immutable formal research article
- `/reference/` - calculation and field reference

## Test

```bash
python3 -m unittest discover -s tests -v
```
