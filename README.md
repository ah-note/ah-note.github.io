# AH Note

Public stock research notes website for multi-market company reports.

## Build

The published site is static. Local source inputs live under `_source/` and are
ignored by git.

```bash
python3 scripts/build_site.py
python3 -m http.server 8765
```

全量构建读取相邻`stock_analysis`的版本化分类配方及经营校准决议，
生成公司行业搜索与层级浏览页。原`ah_v4`快照仅补充A/H名称和代表标记。只更新行业页时可运行：

```bash
python3 scripts/build_site.py --industry-only --stock-analysis-root ../stock_analysis
```

新版多市场分类可显式指定已应用经营决议的快照。下例仅构建分类；移除 `--industry-only` 后，整站构建也使用同一快照，并在写入任何页面前检查该输入：

```bash
python3 scripts/build_site.py --industry-only --stock-analysis-root ../stock_analysis \
  --industry-snapshot ../stock_analysis/data/outputs/industry_evidence/business_review_current
```

预览将候选、主业已核、完整核准及排除状态分别展示；未知分类不是无分析价值。候选不进入行业成员计数，已有A/H别名和代表标记从原快照补充，但待核公司不保留代表标记。

功能分支发布器与直接构建默认统一使用 `<stock_analysis>/data/normalized/industry_classification/ahu_site_recipe_v1.json`。构建会用该仓库代码在临时目录生成输入，失败不回退旧分类，退出后清理。显式 `--industry-snapshot` 可选择历史快照；公开JSON保留生成配方及决议哈希，不暴露本机路径。正式环境尚未部署此分支；上线前须同步包含配方及生成代码的stock_analysis版本，不得引用本机临时输出。`--industry-recipe`与`--industry-snapshot`互斥。

AH Note 是公司研究报告唯一的公开发布渠道。`build_site.py` 会把
`_source/stock_research/` 作为旧报告兜底，并优先读取相邻
`stock_report/data/analysis/stock_research/` 中统一 Agent 的已校验结果；`stock_report`
只作为内部中转和追溯仓，不作为面向读者的发布入口。同一股票只发布最新报告期；相同报告期内，
`stock-research-analysis-v3` 优先于兼容保留的`stock-research-analysis-v2`、
`stock-research-result-v1`和旧版结果。

`/research/` 是统一的最新研究列表：优先展示通过五项自审和关键字段校验的
`stock-research-analysis-v3`当前公司研究，并兼容展示尚未重跑的v2报告，统一链接到
`/reports/<code>/`。列表同时保留旧版
“深度研报”发布链路；它从
`stock_report/data/derived/stock_research/research.sqlite3` 读取每家公司最新研究版本，且只发布
研究状态完成、报告审阅通过、正文哈希校验一致的不可变 `versions/.../report.md`。每份报告作为一篇
固定地址的文章展示。同一公司和报告期同时存在两种报告时，列表只保留当前协议版本。

发布单次更新：

```bash
python3 scripts/publish_site.py --stock-report-root ../stock_report --stock-analysis-root ../stock_analysis --code 000726.SZ
```

远端可安装 `ops/ah-note-publisher.service`。它使用专用的干净
`stock_report_ah_note` 镜像，每轮先执行 Git 快进同步，再监听协议校验完成的统一结果和通过验收的
正式报告；报告文件稳定后串行构建、提交并推送本站。状态文件保存在站点仓库外，不污染 Git 工作区。
自动发布只重建本轮发生变化的当前详情页；研究清单和不可变正式文章始终整体刷新。
分类输入单独变化也会触发构建发布：监听配方、源快照、经营决议、生成代码及网站分类代码的内容摘要。摘要不包含构建时间，发布成功后才写入监听状态；失败不推进，下一轮重试。分类页面或公开JSON缺失时也会补发。首次升级没有分类摘要时执行一次构建，分类单独触发的整站构建会刷新现有页面，不启动研究任务。
每轮发布在一次性 Git worktree 中完成；输入缺失、构建失败或推送失败都不会污染常驻 checkout。
推送默认最多退避重试三次，每次都从最新远端 `main` 重新构建，避免非快进冲突。

Open `http://127.0.0.1:8765/` to preview.

Published pages:

- `/` - ranking tables
- `/reports/` - report list
- `/reports/<code>/` - full report
- `/research/` - latest approved company research feed
- `/research/<code>/<analysis-version>/` - immutable formal research article
- `/industries/` - A/H/US company search and hierarchical industry browser
- `/reference/` - calculation and field reference

## Test

```bash
python3 -m unittest discover -s tests -v
node tests/test_industry_browser.js
```
