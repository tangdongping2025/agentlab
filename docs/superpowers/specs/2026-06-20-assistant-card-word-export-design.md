# Assistant 卡片 Word 导出设计

## 背景

当前 assistant 回复卡片已支持复制、复制纯文本、朗读和重新生成。用户希望在单张卡片上继续增加 Word 文档导出能力：先保存该卡片 Markdown，再转换为 docx，文件存储在当前工作目录下，并允许用户从卡片上下载。

## 范围

- 仅支持 assistant 回复卡片。
- 仅支持用户手动导出单张卡片内容。
- 导出目录固定为当前工作目录下的 `exports/` 子目录。
- 每次导出生成一份 `.md` 和一份 `.docx`。
- 第一版不支持用户自定义文件名、目录、Word 模板或样式配置。
- 第一版不自动打开 docx，只提供下载。

## 方案

前端在 assistant 卡片操作区增加“导出 Word”按钮。点击后，前端把当前卡片的原始 Markdown 内容和当前 `workspaceCwd` 发送给后端。后端校验 `cwd` 必须位于 `ROOT_DIR` 下，创建 `cwd/exports/`，写入 Markdown 文件，然后调用 pandoc 将 Markdown 转换为 docx。

新增后端接口：

```http
POST /api/db/files/export-docx
```

请求体：

```json
{
  "cwd": "当前工作目录",
  "markdown": "卡片 Markdown 内容"
}
```

响应体：

```json
{
  "mdPath": ".../exports/assistant-card-20260620-094500.md",
  "docxPath": ".../exports/assistant-card-20260620-094500.docx",
  "downloadUrl": "/api/db/files/download?path=..."
}
```

文件名由后端自动生成，避免用户输入文件名带来的路径穿越或非法字符问题。

## Markdown 转换能力

Markdown 到 docx 的转换交给 pandoc 处理。第一版期望支持：

- 标题
- 段落
- 无序列表
- 有序列表
- 代码块
- 链接
- 粗体
- Markdown 表格转换为 Word 表格

前端不做 Markdown 结构解析，也不在第一版实现 Word 模板、页眉页脚、目录或复杂样式。

## 交互

- assistant 卡片操作区新增“导出 Word”。
- 如果当前没有 `workspaceCwd`，点击后显示“请先选择工作目录”。
- 导出中按钮显示“导出中…”，并避免重复提交。
- 导出成功后，卡片操作区显示“下载 Word”。
- 点击“下载 Word”通过现有 `/api/db/files/download` 下载 docx。
- 流式输出中的临时 assistant 卡片继续不显示操作区，因此不显示导出按钮。

## 错误处理

- `cwd` 为空：前端提示“请先选择工作目录”。
- `cwd` 不在 `ROOT_DIR` 下：后端返回 403。
- 服务器未安装 pandoc：后端返回明确错误“服务器未安装 pandoc”。
- pandoc 转换失败：后端返回“Word 导出失败”。
- 前端导出失败时在卡片操作区显示失败提示，不影响复制、朗读和重新生成。

## 部署依赖

- 本地开发机需要安装 pandoc。
- Docker 运行镜像需要安装 pandoc。
- 后端调用 pandoc 时使用 `subprocess.run([...])` 参数数组，不使用 shell 字符串。

## 验收标准

- 有工作目录时，点击 assistant 卡片“导出 Word”可以在 `workspaceCwd/exports/` 下生成 `.md` 和 `.docx`。
- Markdown 表格在 docx 中以 Word 表格形式保留。
- 导出成功后可以点击“下载 Word”下载生成的 docx。
- 无工作目录时点击导出会提示先选择工作目录。
- 未安装 pandoc 时后端返回清晰错误。
- 现有复制、纯文本复制、朗读、重新生成行为不受影响。

## 测试

- 后端测试覆盖成功导出：写入 `.md`、调用 pandoc、生成 `.docx`、返回下载 URL。
- 后端测试覆盖 `cwd` 越界返回 403。
- 后端测试覆盖 pandoc 不存在时返回明确错误。
- 前端测试覆盖有 `workspaceCwd` 时点击“导出 Word”调用 API，成功后显示“下载 Word”。
- 前端测试覆盖无 `workspaceCwd` 时显示“请先选择工作目录”。
- 前端测试覆盖 `showActions={false}` 时不显示导出按钮。
