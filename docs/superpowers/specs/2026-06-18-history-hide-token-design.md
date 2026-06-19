# 历史与恢复隐藏 Token 信息

## 需求

历史与恢复页面不再展示 token 信息，也不再提供 token 查询条件。token 属于技术观测字段，和用户找回上下文、继续会话的核心目标关系不大。

## 设计

- 移除 HistoryPage 筛选区中的最小 token / 最大 token 输入。
- HistoryPage 查询参数不再传 `min_token` / `max_token`。
- 左侧会话列表不再显示 token 数。
- 右侧会话信息卡不再显示 Token 字段。
- 不修改后端 API、数据库字段或已有 session 数据。

## 验收

- 历史与恢复页面没有 token 筛选输入。
- 会话列表和会话信息卡不显示 token 数。
- 关键词、agent、日期筛选仍可用。
- 继续上下文功能不回归。
