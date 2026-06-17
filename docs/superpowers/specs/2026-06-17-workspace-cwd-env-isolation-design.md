# 工作目录按环境自动记忆 设计

## 背景

`workspaceCwd` 当前持久化到 MySQL `sessions.cwd`(per-session)。dev 和 docker 两套环境的 `root_dir` 不同(dev=`D:\我的个人区间\Projects`,docker=`/workspace`),共享同一个 session 加载到对方环境时跨环境失效。

现状(`FilesPanel.tsx:50-55`):
```
if (!isCwdValid(workspaceCwd)) {
  setError("当前工作目录 ... 不在根目录 ... 下,请重新切换");
  setInput(''); setWorkspaceCwd('');
}
```
→ 每次切换环境都要手动重输/选历史,且历史下拉里混着另一环境的失效路径。

## 目标

工作目录按 **rootDir** 自动记忆。切回任一环境,自动恢复该环境上次用过的 cwd。无需手动操作。

## 设计

### 单一真相源:localStorage

每个 rootDir 一条记忆,存当前 cwd 与该环境历史:
```
localStorage["agentlab.cwd:" + rootDir]        // string,该环境最后用过的 cwd
localStorage["agentlab.cwdHistory:" + rootDir] // JSON string[],去重 + 限 10
```

key 加 `agentlab.` 前缀避免与其他应用 localStorage 冲突。

### `session.cwd` / `session.cwdHistory` 字段

**停止写,但保留 schema**(向后兼容,不动 DDL,不动后端 router)。
- `selectAgent` 不再从 `session.cwd` 恢复
- `setWorkspaceCwd` 不再 `dbApi.updateSession({cwd, cwdHistory})`
- 老会话的 cwd 字段成为死字段,不影响功能

### 触发点

1. **rootDir 加载完成 / 切换** → `FilesPanel` `useEffect([workspaceCwd, rootDir])` 分支重写:
   - `workspaceCwd` 在 rootDir 下 → 沿用,load(原行为)
   - 不在 rootDir 下(跨环境)/ 为空:
     - 读 `localStorage["agentlab.cwd:"+rootDir]`,若有且仍在 rootDir 下 → `setWorkspaceCwd(记忆)`
     - 否则 → `setWorkspaceCwd(rootDir)` 兜底到根
     - 不再报错、不再清空

2. **cwd 变化** → store `setWorkspaceCwd(cwd)` 仍按原逻辑维护 `workspaceCwd + workspaceCwdHistory` 内存态;持久化由 FilesPanel 中一个 `useEffect([workspaceCwd, workspaceCwdHistory, rootDir])` 统一写 localStorage(覆盖 switchDir / enterChild / goUp / 历史下拉所有入口)。

3. **历史下拉** `workspaceCwdHistory`:
   - `selectAgent` 时不再从 session 恢复;改从 `localStorage["agentlab.cwdHistory:"+rootDir]` 恢复(rootDir 加载后由 FilesPanel 触发一次 `setWorkspaceCwdHistory`)
   - 跨环境时下拉只显示当前环境的历史(自然隔离)

### 改动范围

| 文件 | 改动 |
| --- | --- |
| `src/stores/agentRuntimeStore.ts` | `setWorkspaceCwd` 移除 `dbApi.updateSession({cwd, cwdHistory})`;`selectAgent` 不再读 session.cwd / cwdHistory(初始置 null/空);新增 `setWorkspaceCwdHistory(hist)` action |
| `src/components/agentRuntime/FilesPanel.tsx` | useEffect 跨环境分支改为"取记忆 / fallback rootDir";新增 useEffect 写 localStorage;rootDir 加载后从 localStorage 恢复 history |
| (无后端改动) | session.cwd / cwdHistory 列保留为死字段 |

### 不做

- 不动 `sessions` 表 schema(共享 MySQL,DDL 改动有风险;字段保留即可)
- 不写迁移脚本(老会话 cwd 自然失效,首次进入按新流程取记忆/兜底)
- 不区分 session 颗粒度(用户已确认 A1:per-rootDir 即可,会话间共享同环境记忆)
- 不改 docker 部署、不改 SDK agent cwd 透传

## 测试(TDD)

前端 vitest,无后端测试。

- store: `setWorkspaceCwd` 不再调 `dbApi.updateSession`(mock dbApi 验证未触发 cwd 字段写入)
- store: `selectAgent` 不读 `session.cwd`(load 后 `workspaceCwd` 为 null,history 为空)
- FilesPanel(纯函数抽出):`resolveCwdForRoot(currentCwd, rootDir, memoryCwd)` 决策逻辑
  - currentCwd 在 rootDir 下 → 返回 currentCwd
  - currentCwd 不在 + memoryCwd 在 rootDir 下 → 返回 memoryCwd
  - currentCwd 不在 + memoryCwd 也不在/无 → 返回 rootDir
- FilesPanel 集成:模拟 rootDir 切换 + localStorage 已有记忆 → 自动恢复(useEffect 行为)

## 已知限制

- localStorage 是**浏览器+域名**绑定:换浏览器、清缓存、隐身模式 → 记忆丢失。可接受(用户偶尔切环境,记忆是便利不是关键数据)
- localStorage 是**前端独占**:后端无法读到 cwd 默认值;agent 启动时 cwd 仍由前端透传(原架构未变)
- 共享 MySQL 风险隔离:本设计完全不动 schema,无线上影响
- session.cwd 死字段:未来某次清理时再删,本次不动

## 非目标

- 跨设备同步记忆(localStorage 不同步是已知特性)
- 记忆冲突时的合并/UI 提示
- 历史下拉的去重策略变更(沿用现有"新 cwd 置顶,限 10")
