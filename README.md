# AH Note

Public stock research notes website for A-share and Hong Kong stock reports.

## Build

The published site is static. Local source inputs live under `_source/` and are
ignored by git.

```bash
python3 scripts/build_site.py
python3 -m http.server 8765
```

`build_site.py` 会把 `_source/stock_research/` 作为旧报告兜底，并优先读取相邻
`stock_report/data/analysis/stock_research/` 中统一 Agent 的结果。同一股票只发布最新报告期；
相同报告期内，`stock-research-result-v1` 会覆盖旧版结果。

发布单次更新：

```bash
python3 scripts/publish_site.py --stock-report-root ../stock_report --code 000726.SZ
```

远端可安装 `ops/ah-note-publisher.service`。它只监听协议校验完成的统一结果，在报告文件稳定后
串行构建、提交并推送本站；状态文件保存在站点仓库外，不污染 Git 工作区。

Open `http://127.0.0.1:8765/` to preview.

Published pages:

- `/` - ranking tables
- `/reports/` - report list
- `/reports/<code>/` - full report
- `/reference/` - calculation and field reference

## Test

```bash
python3 -m unittest discover -s tests -v
```
