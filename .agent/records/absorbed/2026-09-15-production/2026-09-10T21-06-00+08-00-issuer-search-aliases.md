# Session Record: 发行人搜索别名

- Time: 2026-09-10T21:06:00+08:00
- Commit: pending
- Branch: `master`
- Task: 让 AH Note 行业目录索引分类输入中的发行人级搜索别名。

## Outcome

行业目录构建器把 `issuer.search_aliases` 合并进搜索词并稳定去重。该字段只影响搜索，不改变公司身份、分类或展示名称。

## Verification

`tests.test_industry_catalog` 共 16 项测试通过，新增发行人别名可搜索断言。
