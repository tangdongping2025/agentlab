# FilesPanel 文件浏览器 + cwd 持久化 设计

## 背景

workspace tabs(T1-8)已实现 FilesPanel 只读文件列表(文件名/时间/大小/类型)。验证时用户提出 4 点扩展:
- 子目录要能点进去导航(当前不能点)
- 文本文件(md/py 等)要能打开看内容
- docx 要能打开(用户决策:**只下载**,后端无 python-docx)
- workspaceCwd 刷新后要保留(用户决策:**存到 session**)

## 目标

FilesPanel 从「只读列表」升级为「只读文件浏览器」(目录导航 + 文本查看 + docx 下载),并把 workspaceCwd 持久化到 session(per-agent,刷新恢复)。

## 需求

### R1:子目录导航
- 点 📁 子目录 → 进入该目录(重新列其内容,workspaceCwd 更新为子目录)
- 「返回上级」按钮 → 回到父目录
- 显示当前完整路径
- 根目录时禁用「返回上级」;根目录约束不变(只能在 root_dir 下浏览)

### R2:文本文件查看
- 点文本类文件 → 跳转到内容视图(只读,等宽字体,可滚动),顶部「返回目录」按钮
- 后端 `read_file` API:`GET /api/db/files/read?path=<abs>`,root 校验 + 扩展名白名单 + 大小上限,返回 `{name, size, content}`
- 文本白名单:md, txt, py, js, ts, jsx, tsx, json, yml, yaml, xml, html, css, csv, log, sh, ini, conf, toml, rs, go, java, c, cpp, h, sql
- 大小上限 1MB(超过或非白名单 → 400,提示不支持查看、可下载)

### R3:docx 下载
- 点 docx(及任何非白名单文件)→ 触发浏览器下载(保留原文件名)
- 后端 `download` API:`GET /api/db/files/download?path=<abs>`,root 校验,`FileResponse` 返回文件流
- 前端:`<a href download>` 或 fetch blob

### R4:workspaceCwd 持久化(per-agent)
- `SessionModel` 加 `cwd` 字段(nullable)
- 切换工作目录(确认对话框后)→ `updateSession(cwd)` 持久化(乐观:先 set 内存,fire-and-forget 落库)
- `selectAgent` 加载 session → 恢复 `workspaceCwd`(若有,否则 null)
- 前端 `Session` 类型加 `cwd?: string`

## 架构

### 后端
- `routers/files.py`:
  - `list_files`(已实现,`/api/db/files`)
  - 新增 `read_file`:`GET /api/db/files/read?path=` → `{name, size, content}`
  - 新增 `download`:`GET /api/db/files/download?path=` → `FileResponse`
  - 抽公共 `_check_under_root(path) -> Path`(list/read/download 复用)
- `models.py`:`SessionModel` 加 `cwd`
- `schemas.py`:`SessionCreate` / `SessionUpdate` 加 `cwd: Optional[str]`;`SessionOut` 加 `cwd`
- `routers/sessions.py`:create 接受 cwd;update 处理 cwd

### 前端
- `dbApi.ts`:加 `readFile(path)` / `downloadFile(path)`
- `FilesPanel.tsx`:
  - 子目录点击 → `setWorkspaceCwd(子目录)` + load(导航)
  - 「返回上级」按钮(compute parent path)
  - 文本文件点击 → 进内容视图(调 readFile)
  - docx/其他点击 → 触发 download
  - 内容视图:只读文本显示 + 「返回目录」
- `agentRuntimeStore.ts`:
  - `setWorkspaceCwd`:set 后 fire-and-forget `updateSession({cwd})`
  - `selectAgent`:恢复 `session.cwd` → workspaceCwd

## 关键约束
- root_dir 校验贯穿(list/read/download 复用 `_check_under_root`):防路径穿越
- 文本白名单 + 1MB 上限:防读巨型/二进制文件
- docx 不解析,只下载
- cwd 可空:未设置时 agent 用默认 sandbox(后端 `_build_options` 已有 `or _SANDBOX_DIR` 兜底)

## 测试(TDD)
- 后端:
  - `test_files` 加 read_file(root 校验 403 / 白名单外 400 / 超 1MB 400 / 成功返回 content)、download(root 校验 403 / 成功返回文件流)
  - `test_sessions`(或新增)加 cwd:create 带 cwd、update cwd、out 含 cwd
- 前端:
  - store:setWorkspaceCwd 触发 updateSession({cwd})(mock 验证);selectAgent 恢复 cwd
  - FilesPanel:导航/查看/下载逻辑尽量抽纯函数测试(如 parent path 计算、扩展名分类)

## 已知风险
- **共享 MySQL**:记忆记录 dev/prod 共享同一个 context_lab 库 → 本地 `ALTER TABLE sessions ADD cwd` 即同步影响线上。cwd nullable,不破坏现有数据,但仍属线上 schema 变更,需谨慎(本地先加,确认无碍)
- 大文本性能:1MB 上限缓解;内容视图纯文本渲染
- docx 下载需后端读文件流(FileResponse,已 root 校验)
- root_dir 默认 `D:\我的个人区间\Projects`,可通过 config 改

## 非目标
- 文件编辑(只读)
- 文件上传/新建/删除
- docx 内容解析(只下载)
- chat 形态改进(markdown/宽列)—— 独立后续
