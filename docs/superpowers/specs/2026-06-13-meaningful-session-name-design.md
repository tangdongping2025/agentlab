# 会话命名改进 — 规格设计

## 需求

当前 `createSession` 在无消息时用场景名（如「📈 投资助手」）命名，缺乏辨识度。改为：会话首次出现用户消息时，用首条用户消息内容截断作为会话名。

## 决策（brainstorming 已确认）

- **命名来源**：首条用户消息，截断 30 字（超长加「…」）。不调 LLM（零成本、即时）。
- **触发时机**：`saveCurrentSession` 检测到当前会话的内存 messages 为空（即首次保存含内容的消息）且存在非空首条用户消息时改名。
- **防重复**：改名后同步更新内存 session 的 name 和 messages，后续保存时 messages 非空 → 跳过改名。
- **并入分支**：`feature/session-mysql-persistence`。

## 改动

- `src/stores/appStore.ts` 的 `saveCurrentSession`：增加首条用户消息改名逻辑（乐观更新内存 + PUT 带 `name`）。后端 `SessionUpdate.name` 已支持可选更新，无需改后端。

## 不做

- 不做 LLM 生成标题（YAGNI）。
- 不改 createSession 的初始默认名（保留场景名作为改名前的占位）。
