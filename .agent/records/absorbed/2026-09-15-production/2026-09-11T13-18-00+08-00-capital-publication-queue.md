# Session Record: 资本表单一发布队列

- Time: 2026-09-11T13:18:00+08:00
- Branch: `feat/capital-queue-publisher`
- Task: 让资本分析成果由AH Note常驻发布器串行消费，不由各分析任务直接操作Git。

新增资本表发布队列worker及systemd单元。每个成果从最新远端main创建临时worktree，经过现有资本表导入门禁后只提交capital目录；成功、永久失败和可重试网络失败分别持久化。连接类错误最多退避重试三次。上游通过completed队列项回写报告期完成状态。
