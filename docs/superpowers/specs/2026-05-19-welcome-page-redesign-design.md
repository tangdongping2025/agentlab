# RQ-032 优化首页内容 — 规格设计

## 需求概述

1. 访问系统时默认进入新建对话页面，而非恢复上次对话
2. 新建对话页面展示能力清单轮播卡片，用户可直观了解平台能力
3. 能力卡片分两类：纯介绍型和可跳转型（底部有操作提示）
4. 底部输入框可直接开始对话

## 设计方案

### 1. 默认进入新建对话

修改 `loadUserConfig`，不再恢复 `currentSessionId`，每次打开都是空对话页面。

### 2. 欢迎页组件

新建 `WelcomePage.tsx` 组件，在 `conversationHistory.length === 0` 时替代空白提示展示。

布局：
- 顶部：标题区（Agent Lab + 副标题）
- 中部：3 列轮播卡片，7 页，自动轮播 5 秒，支持手动切换
- 底部：输入框 + 发送按钮（复用现有输入框逻辑）

### 3. 卡片数据

20 个能力，分 7 页，每页 3 张。数据定义为常量数组。

可跳转型卡片底部显示操作提示（如"点击💡深度思考按钮开启 →"），纯介绍型无提示。

### 4. 轮播交互

- 左右箭头 + 圆点指示器 + 页码标签
- 5 秒自动轮播，鼠标悬停暂停
- CSS transform 动画切换

## 文件改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/components/WelcomePage.tsx` | 新建 | 欢迎页组件 |
| `src/components/ChatInteraction.tsx` | 修改 | 无对话时显示 WelcomePage，输入框逻辑复用 |
| `src/stores/appStore.ts` | 修改 | loadUserConfig 不恢复 currentSessionId |

## 约束

- 输入框逻辑复用 ChatInteraction 现有的 handleSend，不重复实现
- 轮播纯 CSS + 少量 JS，不引入第三方轮播库
- 卡片数据硬编码为常量，不动态获取
