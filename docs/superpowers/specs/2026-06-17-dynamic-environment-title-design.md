# 动态环境标题设计

## 需求

左上角标题保持 `AGENT LAB`，括号内环境后缀从硬编码 `docker全流程` 改为运行时动态显示：

- Vite dev / Windows 本地开发：`AGENT LAB (dev开发环境)`
- Docker 生产构建运行：`AGENT LAB (docker生产环境)`

## 设计

前端使用 Vite 内置 `import.meta.env.DEV` 判断当前是否为开发服务。开发模式显示 `dev开发环境`，非开发模式显示 `docker生产环境`。不新增后端 API，不引入可编辑配置。

## 验收

- 源码不再出现 `docker全流程` 标题文案。
- `npm run typecheck` 通过。
- `npm run build` 通过。
