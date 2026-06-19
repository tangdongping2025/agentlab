# RQ-059 Assistant 卡片截图复制

## 背景

当前 assistant 回复卡片底部已有“复制”和“重新生成”等文本操作。用户希望增加“截图复制”，把当前回复卡片复制成一张图片，便于粘贴到聊天、文档或笔记工具中。

## 目标

- 在 assistant 回复卡片底部操作区新增“截图复制”按钮。
- 点击后将当前 assistant 卡片内容渲染为 PNG 图片，并写入系统剪贴板。
- 成功后按钮短暂显示“截图已复制”；失败后短暂显示“截图失败”。

## 范围

- 仅支持 assistant 消息卡片；用户消息不新增截图复制入口。
- 仅在 `showActions=true` 时显示；流式生成中的临时回复不显示。
- 不新增第三方依赖，优先使用浏览器原生 DOM、SVG、Canvas 和 Clipboard API。
- 不改变现有文本“复制”和“重新生成”的行为。

## 方案

在 `MessageBubble` 内为 assistant 卡片保留 DOM ref。点击“截图复制”时，克隆当前卡片节点并通过 SVG `foreignObject` 转成图片，再绘制到 canvas 生成 PNG blob，最后使用 `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])` 写入剪贴板。

如果浏览器不支持图片剪贴板或渲染失败，按钮显示失败状态，不回退为文本复制。

## 验收标准

- assistant 消息默认显示“截图复制”按钮。
- 点击“截图复制”会调用图片剪贴板写入能力，写入类型为 `image/png`。
- `showActions=false` 时不显示“截图复制”。
- 点击失败时不会影响已有文本复制和重新生成按钮。

## 测试

- 为 `MessageBubble` 增加单元测试，覆盖按钮显示、成功写入、隐藏动作区、失败状态。
- 保持现有 `MessageBubble` 测试通过。
