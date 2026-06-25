# 龙虾·原生版·投资助手(id=invest)P0 — 规格设计

> 需求编号:待《项目执行跟踪矩阵.md》分配(推测 RQ-031)。
> 范围:P0 核心 MVP(能查数据,立即可用)。P1(自选股 pin_stock + 提示词精调)见文末路线,另立 spec。

## 需求概述

在 context-lab 载体平台新增一个**封闭域投资理财助手 agent**(`invest`),继承 `BaseAgent`(原生版,TTFT 0s)。通过自建的 tushare 内置工具直连 Tushare Pro 官方 HTTP API,回答 A 股行情/财务/估值/资金流/公告/宏观等数据问题。**只答投资理财相关**,无关请求礼貌拒绝并引导回投资。**现有 Docker 单镜像部署不破坏,增量融入。**

区别于 `research`(开放域全能行动型),`invest` 是封闭域专家:工具集聚焦金融数据,系统提示硬约束回答范围。

## 现状

- 载体平台 RQ-1~7 完成:BaseAgent runtime + API/SSE + 前端主界面 + 工具系统 + research/assistant/claude-sdk 三 agent
- 工具注册:`register_tool(instance)` + `tools/__init__.py` 里 `from . import xxx` 触发 `_register_default()`(参考 `anysearch.py` 四件套:name/description/input_schema/execute(**params))
- skill 系统:`SKILL_DIRS=[backend/skills, 项目/.claude/skills]`(绝对路径,skill 扫描不受 ROOT 限),`MAX_SKILL_CHARS=12000`,`discover_skills` 只读 SKILL.md(references 不进系统提示),`build_skill_prompt_for_agent` 拼进系统提示
- 系统提示拼接顺序(`base_agent.py:158`):global_prompt + self.system_prompt + skill_prompt + habit_prompt
- 前端零改动:`AgentLibrary` 从 `store.agents` 自动拉,后端注册即显示
- 部署:单镜像(supervisord 管 nginx+uvicorn),`-v <宿主>:/workspace` 挂载持久,Watchtower 自动升级,Dockerfile 运行阶段只 `COPY backend/`

## 关键决策(brainstorming 确认,2026-06-25)

| 决策点 | 选择 | 依据 |
|--------|------|------|
| agent 实现 | 继承 `BaseAgent`(原生版,TTFT 0s) | 不引 SDK 冷启动;research 已验证 BaseAgent 可行 |
| 封闭域 | 只答投资理财,无关礼貌拒绝(边界:打招呼/确认可简短;影响市场的宏观政策/天气可答) | 用户明确约束;区别 research 开放域 |
| tushare 接入方式 | **新建内置工具 `backend/runtime/tools/tushare.py`,直连 Tushare Pro 官方 HTTP API(POST api.tushare.pro),不走 MCP** | context-lab 后端 MCP 系统只硬编码 amap;tushareMcp 是 Claude Code CLI 挂的,后端拿不到;直连官方 API ~50 行,比走 MCP 协议(initialize/tools/list/tools/call)简单 |
| tushare 工具形态 | **单工具 + `{api_name, params, fields, output_file}`**,纯 httpx,必须支持 output_file 落 CSV | 避免几百接口各一工具塞爆 context;大表必须落文件,返回摘要(行数/字段/前几行) |
| skill 位置 | `backend/skills/tushare-data/`(不是项目根 `.claude/skills/`) | Dockerfile 只 `COPY backend/`,放 backend/skills 自然进镜像且 `SKILL_DIRS` 已含 |
| 工作目录 | **全局 ROOT 共享**(prod=`/workspace`,dev=`D:\我的个人区间\Projects`,`config.py` 自动检测);invest 约定用 `invest/` 子目录放自己的文件 | 核实:ROOT 全局非 per-agent(`file_read._root()` 读全局,`task.cwd` 只影响 skill_prompt);不独占工作目录,靠子目录约定隔离 |
| MAX_SKILL_CHARS | 保持 12000(不调高) | 实测 SKILL.md=9173 字符 < 12000,不截断;之前误判源于 read 时 too-large-to-include 保护机制 |
| token 注入 | `TUSHARE_TOKEN` 运行时 `-e` 注入 + 本地 `backend/.env` | 跟 `ANYSEARCH_API_KEY` 同级;mask 纪律:判空用 `[ -n "$TUSHARE_TOKEN" ]`,禁 `${TUSHARE_TOKEN:-}` |
| 工具循环上限 | `base_agent` 加可覆盖 `max_loops`(默认 5),invest 设 15 | 投资多步研究(代码→行情→财报→估值→资金流→对比)需 6-8 轮;默认仍 5 不影响其他 agent |
| references 可读 | P0 解决:`file_read._resolve()` 加 SKILL_DIRS fallback | agent 用 Read 透明读 `tushare-data/references/`;SKILL_DIRS 是绝对路径,fallback 安全 |
| 完成节奏 | **分 2 次,P0 先行** | P0 先验证 tushare 工具形态(未实战),P1 再加自选股;P0 上线即满足日常使用 |

## 目标方案

### 1. tushare 内置工具(`backend/runtime/tools/tushare.py`)

照 `anysearch.py` 四件套模式:

```python
class TushareTool:
    name = "tushare"
    description = "查询 Tushare Pro 金融数据(A股行情/财务/估值/资金流/公告/宏观)。api_name=接口名(如 daily/fina_indicator/income),params=接口参数,fields=返回字段(可选),output_file=落盘路径(可选,大表必须用)"
    input_schema = {
        "type": "object",
        "properties": {
            "api_name": {"type": "string", "description": "Tushare 接口名,如 daily/stock_basic/fina_indicator"},
            "params": {"type": "object", "description": "接口参数,如 {ts_code:'600519.SH', start_date:'20260101', end_date:'20260625'}"},
            "fields": {"type": "string", "description": "返回字段,逗号分隔(可选)"},
            "output_file": {"type": "string", "description": "落盘路径(相对工作目录,可选)。大表必须指定,工具落 CSV 后返回摘要"}
        },
        "required": ["api_name"]
    }
    async def execute(self, **params) -> str:
        # POST https://api.tushare.pro  body={api_name, token, params, fields}
        # 有 output_file → 落 CSV 到 ROOT 内,返回 "已落盘 X 行,Y 字段,前3行:..."
        # 无 output_file → 直接返回 text(小结果)
```

- 纯 httpx(已有依赖,不引新包)
- token 从 `os.environ.get("TUSHARE_TOKEN", "")`
- `output_file` 路径经 `file_read.py` 同款 ROOT 校验(复用 `_resolve` 思路,防越狱)
- 错误分层:Tushare 返回的非空 `code`(如积分不足/接口不存在)→ 人话提示 + 原始 msg;网络错误 → 重试 1 次

### 2. invest agent(`backend/agents/invest_agent.py`)

```python
@register_agent
class InvestAgent(BaseAgent):
    max_loops = 15  # 覆盖 base_agent 默认 5,投资多步研究够用
    metadata = AgentMetadata(
        id="invest",
        name="龙虾·原生版·投资助手",
        description="原生自研 runtime,直连 Tushare Pro。只答投资理财:A股行情/财务/估值/资金流/公告/宏观。",
        workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill"]},
    )
    tool_names = ["tushare", "Read", "Glob", "Grep"]
    system_prompt = "<域限定 + 数据使用规范,见关键设计点 4>"
```

- workspace tabs:`["对话", "文件", "Skill"]`(原生版不支持 MCP/记忆;P1 加"自选股")
- tool_names:`tushare`(查数据)+ `Read/Glob/Grep`(读工作目录里的导出 CSV + 读 skill references,见关键设计点 3)。不加 Edit(不写代码)、Bash(导出走 output_file)、anysearch/WebSearch(tushare 覆盖)

### 3. SUPPORTED_*_AGENT_IDS 加 `"invest"`

四处:`skill_settings` / `global_prompt_settings` / `habit_prompt_settings` / `agent_model_settings`。**不加** `memory_preview`/`task_system`(只支持 claude-sdk,原生版不支持)。`mcp_settings` 可选(invest 不用 MCP,实际不加)。

### 4. skill 搬迁

把 `~/.claude/skills/tushare-data/` 整体搬到 `backend/skills/tushare-data/`(SKILL.md + references/)。SKILL.md 里"参考 references/数据接口.md"这句**保留**(agent 现在能读 references,见关键设计点 3)。

### 5. 部署

- `docs/deploy-mysql.md`:env 表 + docker run 命令加 `-e TUSHARE_TOKEN=xxx`(判空 `[ -n "$TUSHARE_TOKEN" ]`)
- `backend/.env`(本地):加 `TUSHARE_TOKEN=xxx`
- Dockerfile 不用改(backend/skills 自然进镜像)

## P0 范围

**做**:
1. `backend/runtime/tools/tushare.py` + `tools/__init__.py` 注册
2. `backend/agents/invest_agent.py`(含 `max_loops = 15`)
3. `base_agent.py` 加 `max_loops: int = 5` 类属性 + 循环改 `range(self.max_loops)`
4. `file_read.py` `_resolve()` 加 SKILL_DIRS fallback
5. 四处 SUPPORTED_*_AGENT_IDS 加 `"invest"`
6. skill 搬到 `backend/skills/tushare-data/`(references 保留)
7. 部署 env 文档 + 本地 .env
8. 测试:tushare 工具 mock httpx(不真调,避免写线上 + 烧积分);file_read fallback 单测;max_loops 单测

**不做(推 P1)**:
- pin_stock 自选股工具 + watchlist.json + "自选股" tab
- 提示词四硬约束的精调(基于 P0 实际使用反馈)
- 端到端深度验证(P0 跑通冒烟即可)

## 关键设计点

### 1. tushare 工具:单工具 + api_name(不做每接口一工具)

Tushare 有几百个接口。若每个接口做一个工具塞进 LLM context,会爆炸。**单工具 + api_name 参数**让 LLM 按需指定接口,context 只占一个工具定义。SKILL.md 的"Recommended minimal interface set"(~30 个常用接口)教 LLM 常用 api_name。

### 2. 大表必须落 CSV(output_file)

Tushare 返回的日线/财报表可能上千行,直接进 context 会爆。工具强制/鼓励大表用 `output_file` 落盘,只返回摘要(行数/字段/前几行)。agent 用 Read 工具按需读 CSV 分页查看。

### 3. ✅ references 可读(P0 解决:file_read 加 SKILL_DIRS fallback)

核实:`SKILL_DIRS`(`skill_settings.py:15-18`)是**绝对路径**(`backend/skills`、`项目/.claude/skills`),skill 扫描不受 ROOT 限制。但 `file_read._resolve()` 强制 ROOT 内,agent 用 Read 读不到 references。

**P0 方案(用户定:P0 解决)**:`file_read.py` 的 `_resolve()` 加 SKILL_DIRS fallback——路径在 ROOT 内找不到时,回退到 SKILL_DIRS 下查找。agent 用 Read 读 `tushare-data/references/数据接口.md`,工具透明解析到 `backend/skills/tushare-data/references/数据接口.md`。
- 改动局部:`_resolve()` 加 fallback 循环,ROOT 内正常读取不变
- 通用增强:所有 agent 都能读 skill references(其他 skill 无 references,无害)
- 风险可控:fallback 只读 SKILL_DIRS(固定两个绝对路径),不开放任意路径
- SKILL.md 里"参考 references/数据接口.md"这句**保留**(agent 现在能读了),最小接口集仍作快速参考

### 4. 封闭域系统提示(四硬约束基底)

system_prompt 核心:
- **域限定**:只答投资理财;无关请求(写代码/闲聊/其他领域专业问题)礼貌拒绝 + 引导回投资;打招呼/确认简短回应;影响市场的宏观政策/天气可答
- **时效标注**:数据带日期,明确"截至 YYYY-MM-DD",不混淆
- **结论溯源**:数字结论标注接口名 + 时间窗
- **事实/推断分层**:数据事实 vs 主观推断建议,分层表述
- **失败降级**:接口不可用/积分不足/空结果,说人话告知限制,不硬编不伪造

### 5. ✅ 工具循环 max_loops 可覆盖(P0 解决:base_agent 加属性)

核实:`base_agent.py:159` `for _ in range(5)` 硬编码。

**P0 方案(用户定:调高)**:`base_agent.py` 加 `max_loops: int = 5` 类属性,循环改 `for _ in range(self.max_loops)`。invest 覆盖 `max_loops = 15`。
- 通用增强:默认仍 5(research/assistant/claude-sdk 不受影响),invest 显式覆盖 15
- 投资多步研究(代码→行情→财报→估值→资金流→对比,6-8 轮)15 轮够宽松
- 提示词仍教 agent 高效用工具(批量查/单轮多工具),双保险

## 待定点(spec review 确认)

1. ~~references 处理~~ → **已定:P0 用 file_read SKILL_DIRS fallback 解决**(关键设计点 3)
2. ~~5 轮限制~~ → **已定:base_agent 加 max_loops 属性,invest 设 15**(关键设计点 5)
3. **需求编号**:跟踪矩阵分配(推测 RQ-031)
4. **tushare 工具 output_file 是否强制**:倾向"大表强制落盘,小结果可选"(待确认)
5. ~~dev 工作目录~~ → **已定:全局 ROOT 共享,invest 用 `invest/` 子目录**(关键决策表)

## P1 路线(另立 spec)

1. `pin_stock` 内置工具 + `watchlist` MySQL 表(用户定:一步到位走库,不用 JSON 文件):新表存自选股(`watchlist(id, ts_code, name, added_at, note, tags_json, created_at)`),工具在后端进程内直连 DB 做 add/remove/list,前端"自选股"tab 走 `/api/db/watchlist`。实现细节(pin_stock 直连 DB vs 走 HTTP / 表结构 / 多用户字段)P1 spec 再定
2. workspace tabs 加"自选股"
3. 提示词四硬约束精调(基于 P0 真实使用反馈)
4. 端到端深度验证(多场景:行情/财务/对比/资金流/宏观)

## 设计理念合规检查

| 原则 | 检查 |
|------|------|
| 极简 | P0 只做"能查数据"最小闭环 + 两个通用增强(max_loops 可选 / file_read fallback);pin_stock/精调/深验全推 P1 |
| 专注 | invest 职责单一:封闭域投资数据问答;不混入写代码/通用搜索 |
| 不破坏 | Docker 单镜像零改动拓扑,只加内置工具 + agent 类 + skill 目录 + 一个 env;tushare.py/invest_agent.py 是新增文件;max_loops 默认值不变,file_read fallback 只增不减 |
| 可积累 | 照 anysearch 四件套模式,加 agent = 加个类,符合载体平台"慢慢积累" |
| 教学向 | invest 是清晰可读的 BaseAgent 子类;tushare 工具单文件可读;封闭域 + 四硬约束示范"领域专家 agent"范式 |
| 对话体验优先 | P0 上线即可日常查行情/财报,有真实使用场景驱动 P1 精调(不闭门造车) |

## 沿用现有机制

- BaseAgent runtime + tool use 循环 + SSE 事件流
- 工具注册(register_tool + __init__.py import 触发)
- skill 系统(SKILL_DIRS 含 backend/skills,build_skill_prompt_for_agent 拼系统提示)
- SUPPORTED_*_AGENT_IDS 白名单控制各特性
- Docker 单镜像 + /workspace 挂载 + Watchtower
- Vite proxy(dev)+ nginx 反代(prod)
