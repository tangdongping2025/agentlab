---
title: RQ-012 配置与状态持久化恢复
type: spec
date: 2026-05-16
domain: AI与技术
---

# RQ-012 配置与状态持久化恢复

## 目标

用户在 Context Lab 中修改的配置（策略、场景、工具、提示词）和会话数据，在刷新页面或下次打开时应完整恢复，包括上次活动的会话和对话历史。

## 背景

当前实现中，`saveUserConfig` 和 `loadUserConfig` 方法存在于 store 中，但 `loadUserConfig` 从未被调用，导致以下数据在刷新后丢失：

- 策略配置（滑动窗口/完整记忆/摘要记忆/无记忆）
- 上下文窗口大小（4K/8K/32K/128K/1M）
- 当前选中的场景
- 系统提示词内容
- 选中的工具列表
- 侧栏开关状态
- 上次活动的会话（虽然会话数据已通过 sessionService 持久化，但启动时没有恢复到该会话）

## 存储方案

使用浏览器 localStorage，数据以域名隔离，存储在浏览器内部数据库中：

| 存储 key | 内容 | 格式 |
|----------|------|------|
| `context-lab.config` | 当前配置状态 | JSON |
| `context-lab.sessions` | 所有会话数据 | JSON |
| `context-lab.scenes` | 用户创建的自定义场景 | JSON |

## 持久化数据清单

| 数据字段 | 存储 key | 保存触发时机 | 启动恢复行为 |
|----------|---------|------------|------------|
| currentScene | context-lab.config | setScene | 恢复到上次场景 |
| contextStrategy | context-lab.config | setStrategy | 恢复到上次策略 |
| contextSize | context-lab.config | setContextSize | 恢复到上次大小 |
| systemPrompt | context-lab.config | setSystemPrompt, toggleTool | 恢复到上次提示词 |
| selectedTools | context-lab.config | toggleTool, selectAllTools, clearAllTools | 恢复到上次工具选择 |
| currentSessionId | context-lab.config | saveCurrentSession | 恢复并加载对话历史 |
| sidebarOpen | context-lab.config | toggleSidebar | 恢复侧栏状态 |
| 会话列表 | context-lab.sessions | 消息发送后 auto-save | 加载全部会话 |
| 自定义场景 | context-lab.scenes | addScene, updateScene | 合并预设+自定义场景 |

## 核心行为

### 1. 自动保存

关键操作完成后自动调用 `saveUserConfig()`，用户无需手动保存：

- 切换场景 → saveUserConfig
- 切换策略 → saveUserConfig
- 切换上下文大小 → saveUserConfig
- 修改提示词 → saveUserConfig
- 切换工具 → saveUserConfig
- 切换侧栏 → saveUserConfig
- 消息发送后 → saveCurrentSession

### 2. 启动恢复

App mount 时按顺序执行：

1. `loadUserConfig()` — 从 localStorage 读取配置，恢复场景/策略/大小/提示词/工具/侧栏状态
2. `loadSessions()` — 从 localStorage 读取会话列表
3. 如果 `currentSessionId` 存在且对应会话有消息，恢复该会话的完整对话历史，直接显示聊天界面（跳过欢迎页）

### 3. 数据损坏保护

`loadUserConfig` 使用 try/catch 包裹 JSON.parse，损坏时静默回退默认值，不抛异常，不阻塞应用启动。

### 4. 会话恢复的显示行为

- 上次会话有消息 → 直接显示聊天界面，用户看到历史对话，可无缝继续
- 上次会话无消息（新建但没发过言）→ 显示欢迎页
- 没有 currentSessionId → 显示欢迎页，但侧栏会话列表中有历史记录

## 受影响文件

| 文件 | 变更内容 |
|------|---------|
| `src/stores/appStore.ts` | 扩展 saveUserConfig 覆盖 currentSessionId 和 sidebarOpen；扩展 loadUserConfig 恢复会话；操作后自动调用 saveUserConfig |
| `src/App.tsx` | mount 时调用 loadUserConfig + loadSessions；根据恢复的会话消息数决定 hasStarted |

## 乔布斯设计理念合规检查

| 原则 | 合规 |
|------|------|
| 极简 | ✅ 持久化对用户透明，无需手动保存/加载操作 |
| 专注 | ✅ 不增加 UI 元素，纯粹的数据层改动 |
| 直觉 | ✅ 重启后看到和离开时一样的状态，符合预期 |
| 一致性 | ✅ 沿用现有 localStorage 模式，不引入新机制 |
| 工匠精神 | ✅ 数据损坏保护，不因 localStorage 异常导致白屏 |
