# GitHub Actions 发布打包设计

## 背景

当前仓库的 `.github/workflows/deploy.yml` 只在 `push` 到 `main` 时触发 Docker 镜像构建并推送到 GHCR。当前本地 `main` 领先 `origin/main`，且包含大量已修改和未跟踪文件。

## 目标

将当前工作区的全部改动整理为发布提交，并推送到远端 `main`，从而触发 GitHub Actions 执行 Docker 打包与推送。

## 范围

本次发布包含用户确认时工作区已有的全部改动，包括前后端代码、测试、Docker/nginx 配置、spec/plan 文档、跟踪矩阵、sandbox 文件、`.docx` 文件、`dist-electron/`、`release/` 以及其他未跟踪文件。后续为发布流程新增的 spec/plan 文档也纳入本次发布。

## 约束与风险

- 当前前端和后端测试均存在失败；本次目标是触发 Actions 打包，不以本地测试全绿作为前置条件。
- 推送目标是 `main`，会直接触发现有 Actions。
- 推送前必须再次展示 `git status` 和待提交 diff 摘要，避免隐藏范围。
- 不做 workflow 行为修改，不新增手动触发入口。

## 成功标准

- 当前全部改动被提交到本地 `main`。
- 本地 `main` 成功推送到 `origin/main`。
- GitHub Actions 的 `Build and Push Docker Image` workflow 被 push 事件触发。
