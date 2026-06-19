# Assistant 卡片复制内容设计

## 背景

截图复制基于 DOM/SVG/canvas 渲染，实际点击耗时长且不稳定，不适合日常高频使用。

## 设计

放弃 assistant 卡片截图复制功能，移除截图生成链路和相关按钮。assistant 卡片仅保留稳定的文本/Markdown 内容复制，按钮文案改为“复制内容”，成功后显示“已复制”。

## 验收

- assistant 卡片默认显示“复制内容”。
- 点击后调用 `navigator.clipboard.writeText(content)`。
- 不再显示“截图复制 / 截图中 / 已截图 / 截图失败”。
- `showActions=false` 时不显示复制动作。
- “重新生成”保持原有行为。
