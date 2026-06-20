# 工作目录设置数据库化设计

## 背景

当前文件面板的工作目录 `cwd` 和历史记录依赖浏览器 `localStorage`，同一用户在不同访问地址、不同浏览器或 Windows / container 环境之间切换时会出现设置丢失。工作目录设置需要进入数据库，并按运行环境隔离。

## 范围

- 使用 MySQL `app_settings` 作为工作目录设置真相源，不新增数据表。
- 后端文件路由提供当前环境的 workspace settings 读写接口，返回 `environment`、`rootDir`、`cwd`、`cwdHistory`。
- 环境只区分 `windows` 与 `container`：Windows 盘符或反斜杠路径归为 `windows`，其他根目录归为 `container`。
- `FilesPanel` 首次加载时从数据库恢复当前环境的 `cwd` 和 `cwdHistory`，切换工作目录后保存到数据库。
- 不改变文件读取、预览、下载的 root 安全校验。
- `localStorage` 不再作为工作目录真相源。

## 验收

- Windows 和 container 环境保存的工作目录互不覆盖。
- 打开文件面板时会从数据库恢复当前环境的工作目录和历史记录。
- 切换目录、进入子目录、返回上级、历史下拉选择后，数据库中的当前环境设置会更新。
- 无数据库记录时保持现有提示：需要用户选择安全范围内的工作目录。
