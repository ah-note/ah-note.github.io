# Session Record: 浏览器验收与父类去重

- Time: 2026-09-10T14:53:57+08:00
- Window: 2026-09-10T14:50:42+08:00 to 2026-09-10T14:53:57+08:00
- Previous Record: .agent/records/2026-09-10T14-51-00+08-00-unified-default-catalog.md
- Commit: pending
- Branch: feat/ahu-classification
- Task: 分类网页实际验收

## Outcome

Chrome实际搜索TJX，进入公司页可见服饰零售主类、家居零售暴露及同类公司；父类专营零售展示六个子类和分组公司列表。截图布局正常。

发现父类标题170家公司，而列表错误加总为174家。修复为按issuer.id去重，保留跨叶重复展示；新增Node回归通过。更新资源版本20260910-ahu1后，真实浏览器截图确认列表变成170家，旧资源缓存问题一并消除。

## Open Questions And Risks

本地预览服务会话78961端口55759；浏览器tab663498217标为handoff供继续验收。未部署。待核公司详情及身份多代码仍需浏览器抽查；全市场证据任务仍未完成，分析队列不动。
