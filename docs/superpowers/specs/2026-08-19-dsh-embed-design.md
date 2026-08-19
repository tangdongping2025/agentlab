# DeepSeek Harness (dsh) 单独部署 + 前端 iframe 集成 — 设计规格

日期：2026-08-19
状态：已批准（用户"那动手吧" + 三决策点批量确认）

## 1. 背景与已定决策

评估结论（2026-08-19 报告）：dsh 不作为对话智能体接入 context-lab agent registry（协议/运行时模型不匹配），推荐**独立部署 + 前端 iframe 嵌入**路径。用户批准实施。

三个决策点（用户全选推荐项）：
1. **LLM 后端 = GLM 智谱**：复用 ECS 现有 key（open.bigmodel.cn anthropic 兼容端点），与生产 assistant 同后端。
2. **部署范围 = 一步到位**：本机 PoC 验证通过后直接 ECS 生产部署 + 前端集成。
3. **退路 = 授权自动切换**：iframe 子路径 404 时自动改独立端口/外链，在 spec 记录结论，不打断用户。

## 2. PoC 结论（已完成验证）

| 项 | 结论 | 依据 |
|---|---|---|
| iframe 嵌入 | ✅ 可行 | dsh web 响应无 X-Frame-Options / CSP frame-ancestors |
| 子路径挂载 | ❌ 不可行 | dsh 前端用根绝对路径 `/assets/`、`/plugins/`，与主站 nginx 路径冲突 |
| 定案 | **独立端口 nginx server 块反代**，dsh 绑 127.0.0.1 | — |

## 3. GLM 接入（已完成端到端验证）

dsh-base bundle 内置 `@deepseek-ai/dsh-llm-pi-ai`（免安装），配置级接入。

`~/.dsh/settings.yaml`（ECS 部署时同款照搬）：

```yaml
ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
llm-pi-ai:
  providers:
    anthropic:
      apiKeyEnv: GLM_API_KEY
      baseURL: https://open.bigmodel.cn/api/anthropic
      models:
        - id: glm-4.7
          name: GLM-4.7
          contextWindow: 200000
agent-default-model:
  provider: anthropic
  model: glm-4.7
```

- key 不落配置文件：`apiKeyEnv` 引用进程环境变量，启动时 `GLM_API_KEY=$(cat ~/.dsh/glm_key)` 注入（ECS 用 systemd `EnvironmentFile`）。
- `models` 列表**替换**（非扩展）anthropic catalog → 模型选择器只显示 GLM-4.7。
- `agent-default-model` 段使新会话默认走 GLM（不写则默认 deepseek-v4-flash，实测确认）。

验证矩阵（本机 127.0.0.1:3080，全部通过）：
1. 智谱端点直连 curl（key/模型名/端点三者独立确认）
2. `llm.providers` → anthropic `active: true`
3. `llm.models` → anthropic 组含 GLM-4.7
4. `session.selectModel` + `session.prompt` 端到端 → `turn 2 provider=anthropic model=glm-4.7 content=['2']`（key env 解析无 MISSING_CREDENTIAL，真实 LLM 调用成功）

## 4. wire 协议（逆向确认，反代配置的依据）

从运行中的前端 JS（`dsh-client-connection/client.js`）提取：

- **RPC 上行**：`POST /api/{method}`，body envelope `{type:"client-request", rpcId:<uuid>, method, payload}`；响应 `{type:"server-response", rpcId, result:{ok, value|error}}`。注意 README 写的 `/api/` 有误导，实际方法名拼进路径。
- **下行是 WebSocket（不是 SSE）**：`/api/events.mux`（mux 帧）+ `/api/events.host`（host 帧）→ **nginx 反代必须配 `Upgrade`/`Connection` 头**。
- 其他端点：`POST /api/respond`（服务端问答回执）、`GET /api/session.export`（会话导出 ZIP）。
- 静态资源：`/assets/*`、`/plugins/*/client.js`、`/manifest.webmanifest`、`/favicon.svg`。
- **browser-trust fence**：浏览器 carrier 把配置面（`settings.*`/`credentials.*`/`llm.*` 及路径选择等特权方法）限制为 **loopback same-origin**。经反代（非 127.0.0.1 authority）访问时被拒 → dsh web 启动需 `--trusted-host <外部authority>`（可多次）把外部 authority 加入信任集。

## 5. ECS 部署架构（方向已定）

**核心矛盾**：context-lab 生产是单镜像容器（nginx+uvicorn via supervisord）+ Watchtower 60s 轮询自动升级——镜像更新时容器重建，容器内手动安装全部丢失。

**决策：dsh 跑在 ECS 宿主机（systemd 服务），容器 nginx 反代到宿主机端口。**

理由（对比另两案）：
- 烤进镜像：镜像膨胀（Node + dsh + 每次升级重装），维护重；
- 容器内挂载卷跑：supervisord 多一个进程管理域，与 Watchtower 重建语义纠缠；
- 宿主机跑：与容器生命周期完全解耦，Watchtower 重建零影响；dsh 自升级也可独立控制。

拓扑：

```
浏览器 → http://47.97.66.45:3080（nginx 独立 server 块，token 校验）
        → 宿主机 127.0.0.1:3081（dsh web，--host 127.0.0.1 --port 3081）
          --trusted-host 47.97.66.45:3080
```

要点：
- **端口**：外露 3080（dsh 在宿主机内部挪到 3081，避免与 nginx 监听冲突——nginx 在容器内但用 host 网络还是 bridge？按现有容器实际网络模式定，部署时验证 3080 可用性，冲突则外露改 3082）。
- **访问控制**：nginx 层静态 token query param 校验（`?token=<值>` 不匹配 → 403）。不用 basic auth——Chrome 阻止跨源 iframe 内的 WWW-Authenticate 弹窗，iframe 会直接失败。个人项目，token 硬编码在前端与 nginx 两处即可（与 VITE_ key 同等保密级别）。
- **宿主机依赖**：Node ≥ 20（dsh 要求；ECS 宿主机若无则装 Node 22 LTS）；dsh 经 `npx -y @deepseek-ai/dsh web` 拉起（npm 缓存后启动 ~15s）。
- **凭据**：`/root/.dsh/glm_key`（600 权限）+ systemd `EnvironmentFile=/root/.dsh/glm_key.env`（内容 `GLM_API_KEY=<key>`，600 权限）。
- **nginx 配置**：独立 server 块文件（`/etc/nginx/conf.d/dsh.conf` 容器内路径按现有布局），WebSocket location（`/api/events.mux`、`/api/events.host`）配 `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`；其余 `proxy_pass http://<宿主机可达IP>:3081`。配置同时落进仓库（防镜像重建丢失，与现有薄 patch 链路一致）。

## 6. 前端集成设计

context-lab 前端增加 dsh 入口，作为「智能体载体」的第 4 个载体（iframe 型）：

- 入口与现有 3 个智能体（原生 assistant / invest / claude-sdk）并列，类型标 iframe；
- 选中后主体区渲染全屏 iframe，`src=http://47.97.66.45:3080/?token=<TOKEN>`；
- 开发环境（localhost:5173）同样指向线上地址（iframe 跨源加载无碍，dsh 不设 frame 限制）；
- 退路（已授权自动切换）：iframe onload 探测失败（加载不出内容）时，展示外链按钮「在新窗口打开 dsh」。

具体组件挂载点实现时按 `src/components` 现有结构定，TDD：组件测试断言 iframe src 与退路渲染。

## 7. 验收标准（线上）

1. 浏览器打开线上 context-lab → dsh 入口 → iframe 内 dsh UI 完整加载；
2. iframe 内新建会话发消息 → GLM-4.7 回复（默认模型即 GLM，无需手动切换）；
3. WebSocket 下行正常（流式回复/会话列表实时更新）；
4. 无 token 直接访问 `http://47.97.66.45:3080` → 403；
5. 更新 `项目执行跟踪矩阵.md`。

## 8. 非目标

- dsh 不进 agent registry、不与 context-lab MySQL 会话互通；
- 不做多用户/权限体系；
- 不做 dsh 版本锁定策略（跟随 npm latest，出问题再锁）。
