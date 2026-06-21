# 手机端 assistant 卡片右侧溢出修复规格

手机端 Agent 对话窗口中的 assistant 卡片不应因为行宽 `100%`、外层包装、视口 padding/border 组合而在右侧被裁切。

修复范围只限移动端卡片宽度约束：assistant 消息行在移动端应占满可用内容宽度但不超过父容器，卡片自身允许 `min-width: 0` 并使用 `box-sizing: border-box`；不改变桌面端布局、任务导航和消息窗口化逻辑。

验证：补充 MessageBubble 测试覆盖移动端行/卡片宽度约束，运行相关前端测试；如可启动 UI，使用手机宽度检查卡片右侧完整显示。