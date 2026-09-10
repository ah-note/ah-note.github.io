# Session Record: 标准字段与展开

- Time: 2026-09-10T13:00:00+08:00
- Window: 当前标准字段网页实施回合
- Previous Record: 2026-09-10T11-58-00+08-00-berun-asset-bridge.md
- Commit: pending
- Branch: feat/value-line-preview
- Task: 标准资产、标准变动及原始明细展开
- Source Sessions:
  - Harness: Codex
  - Evidence: 当前用户确认的设计
  - Checked: 原始数据、映射和渲染测试
  - Used: 当前对话与既有数据
  - Unavailable: 应付款逐笔性质尚未确认

## Outcome

保留原始数据，显式映射经营六项及两组三项；原生折叠展示资产构成与变动来源。待解释差额及重大事项可见。五项测试通过，逐元验证映射不重复和净资产闭合。

## Engineering Context

应付分正常结算、融资性与异常拖欠。未完成证据核实前不迁移余额，网页明确提示未核实，不将未知记零。尚未执行浏览器视觉与交互验收；独立本地预览，无生产流程变动。

## Open Questions And Risks

需要继续核实票据融资和异常应付；当前是展示及映射更新，不代表财务分类终审。
