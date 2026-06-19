# 沙箱工作目录稳定性设计

## 背景

当前 FilesPanel 在 `workspaceCwd` 为空、跨环境或不在 `rootDir` 下时，会自动把工作目录改成 localStorage 记忆或 `rootDir`。这会让用户感觉“每次设置最终都变化了”，也混淆了安全根目录和当前工作目录。

## 设计

保持后端 `rootDir` 作为只读安全边界，前端 `workspaceCwd` 作为用户主动选择的当前工作目录。

- FilesPanel 不再在 cwd 为空或无效时静默调用 `setWorkspaceCwd(rootDir)`。
- 有有效记忆时可恢复记忆；无有效记忆时只展示提示，让用户主动输入或选择目录。
- 当前 cwd 不在 rootDir 下时显示明确提示，不修改当前 cwd。
- 历史只由用户主动切换目录、进入子目录、上级目录或历史下拉触发，不记录系统自动兜底目录。

## 验收

- 首次打开 FilesPanel 且没有 cwd 记忆时，不会自动把工作目录设置成 rootDir。
- 当前 cwd 不在 rootDir 下时，界面提示重新选择，不会静默改成 rootDir。
- 用户主动点击“切换”后，cwd 和历史正常更新。
- Claude SDK Agent 运行时仍使用用户当前选择的 cwd；没有 cwd 时仍走后端默认 sandbox。
