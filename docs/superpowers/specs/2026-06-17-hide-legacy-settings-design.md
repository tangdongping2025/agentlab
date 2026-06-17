# 隐藏旧版配置入口设计

## 需求

右上角设置页隐藏旧版配置入口，降低误用概率。隐藏范围：

- 隐藏 `旧版 Chat` tab。
- 隐藏 `旧版 API` tab。
- 保留旧版配置相关代码，不删除实现，避免引入回归。

## 设计

仅从 `SettingsModal` 的 tab 列表移除旧版入口。原 `activeTab === 'context'` 和 `activeTab === 'api'` 分支保留在文件中，当前 UI 不再提供入口。

## 验收

- 设置页左侧只显示 `系统信息` 和 `MCP`。
- 旧版配置代码未删除。
- `npm run typecheck` 通过。
- `npm run build` 通过。
