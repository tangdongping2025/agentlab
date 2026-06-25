# 龙虾·原生版·投资助手(invest)P0 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:executing-plans 或 subagent-driven-development 逐 Task 实现。Step 用 `- [ ]` 跟踪。

**Goal:** P0 落地封闭域投资助手 agent(`invest`,继承 BaseAgent),自建 tushare 内置工具直连 Tushare Pro 官方 API,能查 A 股行情/财务/估值/资金流/公告/宏观数据。上线即可日常使用。

**Architecture:** 新增 tushare 内置工具(单工具 + api_name,httpx 直连官方 API,output_file 落 CSV)+ invest agent 类(照 research_agent,max_loops=15)+ 两个通用增强(base_agent max_loops 可覆盖 / file_read SKILL_DIRS fallback)+ skill 搬到 backend/skills + 四处 SUPPORTED 白名单加 invest。Docker 单镜像零改动拓扑。

**Tech Stack:** Python FastAPI backend, pytest, httpx(mock 测试,不真调 Tushare 避免烧积分 + 写线上), React(前端零改动)。

**Spec:** `docs/superpowers/specs/2026-06-25-invest-agent-p0-design.md`

**两个已定细节:**
1. output_file **鼓励不强制**:工具支持参数,提示词教 LLM 大表用它;不强制(强制体验差)
2. system_prompt 四硬约束:**plan 给基底文案,TDD 阶段边写边调**

---

### Task 1: base_agent `max_loops` 可覆盖(通用增强)

**Files:**
- Modify: `backend/runtime/base_agent.py`
- Modify: `backend/tests/test_base_agent.py`

- [ ] **Step 1: 写失败测试**

在 `backend/tests/test_base_agent.py` 增加:

```python
def test_base_agent_default_max_loops():
    from runtime.base_agent import BaseAgent
    from runtime.agent import AgentMetadata

    class T(BaseAgent):
        metadata = AgentMetadata(id="t", name="T", description="", workspace={"type": "chat"})
        tool_names = []

    assert T.max_loops == 5


def test_base_agent_max_loops_overridable():
    from runtime.base_agent import BaseAgent
    from runtime.agent import AgentMetadata

    class T(BaseAgent):
        max_loops = 15
        metadata = AgentMetadata(id="t", name="T", description="", workspace={"type": "chat"})
        tool_names = []

    assert T.max_loops == 15
```

- [ ] **Step 2: 运行失败测试**

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py::test_base_agent_default_max_loops backend/tests/test_base_agent.py::test_base_agent_max_loops_overridable -q
```

Expected: FAIL,`max_loops` 属性不存在。

- [ ] **Step 3: 最小实现**

`backend/runtime/base_agent.py` line 21-23 类属性区,`system_prompt` 后加:

```python
    metadata: AgentMetadata
    tool_names: list[str] = []
    system_prompt: str = ""
    max_loops: int = 5  # 工具循环上限,子类可覆盖
```

line 159 循环改:

```python
            for _ in range(self.max_loops):  # 最多 N 轮 tool use(子类可覆盖)
```

- [ ] **Step 4: 运行测试**

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_base_agent.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/base_agent.py backend/tests/test_base_agent.py
git commit -m "feat(agent): max_loops 可覆盖(默认5,子类可调高)"
```

---

### Task 2: file_read SKILL_DIRS fallback(通用增强)

**Files:**
- Modify: `backend/runtime/tools/file_read.py`
- Create: `backend/tests/test_file_read_skill_dirs.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_file_read_skill_dirs.py`:

```python
import pytest
from runtime.tools import file_read


def test_resolve_falls_back_to_skill_dirs(monkeypatch, tmp_path):
    """路径不在 ROOT 内但在 SKILL_DIRS 内时,回退解析成功。"""
    skill_dir = tmp_path / "skills" / "demo"
    skill_dir.mkdir(parents=True)
    ref = skill_dir / "接口.md"
    ref.write_text("# 接口文档", encoding="utf-8")

    monkeypatch.setattr(file_read, "_root", lambda: (tmp_path / "workspace").resolve())
    monkeypatch.setattr(file_read, "SKILL_DIRS", [skill_dir.parent])

    resolved = file_read._resolve("demo/接口.md")
    assert resolved == ref.resolve()


def test_resolve_still_blocks_jailbreak(monkeypatch, tmp_path):
    """ROOT 和 SKILL_DIRS 之外的路径仍被拦截。"""
    monkeypatch.setattr(file_read, "_root", lambda: (tmp_path / "workspace").resolve())
    monkeypatch.setattr(file_read, "SKILL_DIRS", [tmp_path / "skills"])
    with pytest.raises(PermissionError):
        file_read._resolve("../../etc/passwd")
```

- [ ] **Step 2: 运行失败测试**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_file_read_skill_dirs.py -q
```

Expected: FAIL,`SKILL_DIRS` 不存在 / fallback 未实现。

- [ ] **Step 3: 最小实现**

`backend/runtime/tools/file_read.py` 改:

```python
from skill_settings import SKILL_DIRS  # 顶部 import


def _resolve(rel: str) -> Path:
    """把相对/绝对路径解析到 ROOT 内;ROOT 内找不到时回退 SKILL_DIRS(读 skill references)。禁止 .. 越狱。"""
    root = _root()
    p = Path(rel)
    target = (root / p).resolve() if not p.is_absolute() else p.resolve()
    # ROOT 内且存在 → 直接用
    try:
        if target.exists():
            target.relative_to(root)
            return target
    except ValueError:
        pass
    # 回退 SKILL_DIRS(只读固定白名单路径,不开放任意路径)
    for skill_dir in SKILL_DIRS:
        candidate = (skill_dir / rel).resolve()
        try:
            candidate.relative_to(skill_dir.resolve())
        except ValueError:
            continue
        if candidate.exists():
            return candidate
    # ROOT 内但不存在(保留原越狱检查语义给报错路径)
    try:
        target.relative_to(root)
    except ValueError:
        raise PermissionError(f"路径越界,必须在工作目录或 skill 目录内: {rel}")
    return target
```

- [ ] **Step 4: 运行测试**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_file_read_skill_dirs.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/tools/file_read.py backend/tests/test_file_read_skill_dirs.py
git commit -m "feat(tools): Read 支持读 SKILL_DIRS 内 references"
```

---

### Task 3: tushare 内置工具

**Files:**
- Create: `backend/runtime/tools/tushare.py`
- Modify: `backend/runtime/tools/__init__.py`
- Create: `backend/tests/test_tushare_tool.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_tushare_tool.py`:

```python
import json
import pytest


class FakeResponse:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status_code = status

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception(f"HTTP {self.status_code}")


class FakeClient:
    def __init__(self, payload, status=200):
        self._payload = payload
        self._status = status
        self.calls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return None

    async def post(self, url, json=None, headers=None, timeout=None):
        self.calls.append({"url": url, "json": json})
        return FakeResponse(self._payload, self._status)


@pytest.mark.asyncio
async def test_tushare_normal_query(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    fake = FakeClient({"code": 0, "msg": "", "data": {
        "fields": ["ts_code", "close"],
        "items": [["600519.SH", 1680.0]],
    }})
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: fake)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={"ts_code": "600519.SH"})
    data = json.loads(result)
    assert data["fields"] == ["ts_code", "close"]
    assert data["items"] == [["600519.SH", 1680.0]]
    # body 含 token + api_name
    assert fake.calls[0]["json"]["api_name"] == "daily"
    assert fake.calls[0]["json"]["token"] == "fake-token"


@pytest.mark.asyncio
async def test_tushare_error_code_returns_human_message(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: FakeClient(
        {"code": 40001, "msg": "积分不足", "data": None}))
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="some_api", params={})
    assert "积分不足" in result
    assert "some_api" in result


@pytest.mark.asyncio
async def test_tushare_missing_token(monkeypatch):
    from runtime.tools import tushare
    monkeypatch.delenv("TUSHARE_TOKEN", raising=False)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={})
    assert "TUSHARE_TOKEN" in result


@pytest.mark.asyncio
async def test_tushare_output_file_writes_csv(monkeypatch, tmp_path):
    from runtime.tools import tushare
    monkeypatch.setenv("TUSHARE_TOKEN", "fake-token")
    monkeypatch.setattr("httpx.AsyncClient", lambda *a, **k: FakeClient(
        {"code": 0, "msg": "", "data": {
            "fields": ["ts_code", "close"],
            "items": [["600519.SH", 1680.0], ["000001.SZ", 12.3]],
        }}))
    monkeypatch.setattr(tushare, "_resolve", lambda rel: (tmp_path / rel))
    monkeypatch.setattr(tushare, "_root", lambda: tmp_path)
    tool = tushare.TushareTool()
    result = await tool.execute(api_name="daily", params={}, output_file="out.csv")
    csv_text = (tmp_path / "out.csv").read_text(encoding="utf-8")
    assert "ts_code,close" in csv_text
    assert "600519.SH" in csv_text
    assert "2 行" in result  # 摘要含行数
```

- [ ] **Step 2: 运行失败测试**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_tushare_tool.py -q
```

Expected: FAIL,模块不存在。

- [ ] **Step 3: 最小实现**

创建 `backend/runtime/tools/tushare.py`:

```python
from __future__ import annotations

import csv
import io
import os

import httpx

from .file_read import _resolve, _root  # 复用 ROOT 校验(防越狱)
from .registry import register_tool

TUSHARE_ENDPOINT = "https://api.tushare.pro"


class TushareTool:
    """查询 Tushare Pro 金融数据。单工具 + api_name,大表用 output_file 落 CSV。"""

    name = "tushare"
    description = (
        "查询 Tushare Pro 金融数据(A股行情/财务/估值/资金流/公告/宏观)。"
        "api_name=接口名(如 daily/fina_indicator/income/stock_basic/cn_cpi),"
        "params=接口参数(如 {ts_code:'600519.SH', start_date:'20260101', end_date:'20260625'}),"
        "fields=返回字段逗号分隔(可选),"
        "output_file=落盘路径相对工作目录(可选,大表建议指定,工具落 CSV 后返回摘要)。"
        "完整接口列表见 skill tushare-data 的 references。"
    )
    input_schema = {
        "type": "object",
        "properties": {
            "api_name": {"type": "string", "description": "Tushare 接口名,如 daily/stock_basic/fina_indicator"},
            "params": {"type": "object", "description": "接口参数"},
            "fields": {"type": "string", "description": "返回字段,逗号分隔(可选)"},
            "output_file": {"type": "string", "description": "落盘路径(相对工作目录,可选)。大表建议指定"},
        },
        "required": ["api_name"],
    }

    async def execute(self, **params) -> str:
        api_name = params.get("api_name")
        if not api_name:
            return "必须提供 api_name 参数"
        token = os.environ.get("TUSHARE_TOKEN", "").strip()
        if not token:
            return "未配置 TUSHARE_TOKEN 环境变量,无法查询 Tushare(请在后端启动时注入)"

        body = {
            "api_name": api_name,
            "token": token,
            "params": params.get("params") or {},
            "fields": params.get("fields") or "",
        }
        payload = None
        last_err = None
        for attempt in range(2):  # 网络错误重试 1 次
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    resp = await client.post(TUSHARE_ENDPOINT, json=body)
                payload = resp.json()
                break
            except Exception as e:
                last_err = e
        if payload is None:
            return f"Tushare 请求失败(重试后仍报错): {type(last_err).__name__}: {last_err}"

        code = payload.get("code")
        if code != 0:
            msg = payload.get("msg") or "未知错误"
            return f"Tushare 接口 {api_name} 返回错误(code={code}): {msg}(可能积分不足/接口不存在/参数有误)"

        data = payload.get("data") or {}
        fields = data.get("fields") or []
        items = data.get("items") or []

        output_file = params.get("output_file")
        if output_file:
            try:
                path = _resolve(output_file)
            except PermissionError as e:
                return str(e)
            path.parent.mkdir(parents=True, exist_ok=True)
            buf = io.StringIO()
            writer = csv.writer(buf)
            writer.writerow(fields)
            writer.writerows(items)
            path.write_text(buf.getvalue(), encoding="utf-8")
            preview_rows = items[:3]
            preview = "\n".join(",".join(str(c) for c in row) for row in preview_rows)
            return (f"已落盘 {output_file}:{len(items)} 行,字段 {len(fields)} 个:{','.join(fields)}\n"
                    f"前 {len(preview_rows)} 行预览:\n{preview}")

        # 小结果直接返回 JSON(供 LLM 读)
        return json.dumps({"fields": fields, "items": items}, ensure_ascii=False)


import json  # noqa: E402  小结果返回用


def _register_default():
    register_tool(TushareTool())


_register_default()
```

`backend/runtime/tools/__init__.py` 加一行:

```python
from . import tushare  # noqa: F401  Tushare 金融数据工具
```

- [ ] **Step 4: 运行测试**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_tushare_tool.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/runtime/tools/tushare.py backend/runtime/tools/__init__.py backend/tests/test_tushare_tool.py
git commit -m "feat(tools): tushare 内置工具直连官方 API"
```

---

### Task 4: invest agent + 四处 SUPPORTED 白名单

**Files:**
- Create: `backend/agents/invest_agent.py`
- Modify: `backend/skill_settings.py` / `global_prompt_settings.py` / `habit_prompt_settings.py` / `agent_model_settings.py`
- Create: `backend/tests/test_invest_agent.py`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_invest_agent.py`:

```python
def test_invest_agent_registered():
    from runtime.registry import get_agent
    agent_cls = get_agent("invest")
    assert agent_cls is not None
    assert agent_cls.metadata.name == "龙虾·原生版·投资助手"
    assert agent_cls.max_loops == 15
    assert "tushare" in agent_cls.tool_names
    assert agent_cls.metadata.workspace["tabs"] == ["对话", "文件", "Skill"]


def test_invest_in_supported_whitelists():
    import skill_settings, global_prompt_settings, habit_prompt_settings, agent_model_settings
    assert "invest" in skill_settings.SUPPORTED_SKILL_AGENT_IDS
    assert "invest" in global_prompt_settings.SUPPORTED_GLOBAL_PROMPT_AGENT_IDS
    assert "invest" in habit_prompt_settings.SUPPORTED_HABIT_PROMPT_AGENT_IDS
    assert "invest" in agent_model_settings.SUPPORTED_MODEL_CONFIG_AGENT_IDS


def test_invest_not_in_mcp_or_memory_or_task():
    import mcp_settings, memory_preview, task_system_settings
    assert "invest" not in mcp_settings.SUPPORTED_MCP_AGENT_IDS
    assert "invest" not in memory_preview.SUPPORTED_MEMORY_PREVIEW_AGENT_IDS
    assert "invest" not in task_system_settings.SUPPORTED_TASK_SYSTEM_AGENT_IDS
```

- [ ] **Step 2: 运行失败测试**

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_invest_agent.py -q
```

Expected: FAIL,`invest` 未注册 / 不在白名单。

- [ ] **Step 3: 最小实现**

创建 `backend/agents/invest_agent.py`(照 research_agent.py 结构):

```python
from runtime.agent import AgentMetadata
from runtime.base_agent import BaseAgent
from runtime.registry import register_agent


@register_agent
class InvestAgent(BaseAgent):
    """龙虾·原生版·投资助手:封闭域,直连 Tushare Pro。只答投资理财。"""

    max_loops = 15  # 投资多步研究(代码→行情→财报→估值→资金流→对比)需 6-8 轮

    metadata = AgentMetadata(
        id="invest",
        name="龙虾·原生版·投资助手",
        description="原生自研 runtime,直连 Tushare Pro。只答投资理财:A股行情/财务/估值/资金流/公告/宏观。响应快,封闭域专家。",
        workspace={"type": "tabs", "tabs": ["对话", "文件", "Skill"]},
    )
    tool_names = ["tushare", "Read", "Glob", "Grep"]
    system_prompt = (
        "你是龙虾·原生版·投资助手,一个封闭域的投资理财专家智能体。你直连 Tushare Pro 金融数据库。\n\n"
        "【域限定·硬约束】\n"
        "1. 只回答投资理财相关问题(A股行情/财务/估值/资金流/公告/宏观/基金/理财)。"
        "无关请求(写代码/闲聊/其他领域专业问题)礼貌拒绝并引导回投资话题。\n"
        "   - 边界:打招呼/确认可简短回应;影响市场的宏观政策/利率/天气可答。\n\n"
        "【数据使用规范·硬约束】\n"
        "2. 时效标注:所有数据明确标注日期(截至 YYYY-MM-DD 或区间),绝不混淆时间。\n"
        "3. 结论溯源:每个数字结论标注来源接口名 + 时间窗,如「茅台 2026Q1 营收(fina_indicator,截至 2026-04-30)」。\n"
        "4. 事实/推断分层:客观数据事实与主观推断建议分层表述,推断前加「推断:」。\n"
        "5. 失败降级:接口不可用/积分不足/空结果时,用人话说明限制,不硬编不伪造数据。\n\n"
        "【工具使用】\n"
        "- tushare 工具查数据(api_name 见 skill tushare-data);大表(日线/财报表)用 output_file 落 CSV,再用 Read 分页读。\n"
        "- 不知道接口名时,用 Read 读 tushare-data/references/数据接口.md 查。\n"
        "- 多标的对比优先批量(ts_code 逗号传多个),单轮可并行多工具调用。\n"
        "- 调工具前先用一句话说明思路。\n\n"
        "回答用 Markdown,结论先行,关键数字加粗,表格呈现对比。"
    )
```

四处白名单各加 `"invest"`(在现有集合内补):

- `backend/skill_settings.py:20`:`SUPPORTED_SKILL_AGENT_IDS = {"assistant", "research", "claude-sdk", "invest"}`
- `backend/global_prompt_settings.py:13`:`SUPPORTED_GLOBAL_PROMPT_AGENT_IDS = {"assistant", "research", "claude-sdk", "invest"}`
- `backend/habit_prompt_settings.py:8`:`SUPPORTED_HABIT_PROMPT_AGENT_IDS = {"assistant", "research", "claude-sdk", "invest"}`
- `backend/agent_model_settings.py:16`:`SUPPORTED_MODEL_CONFIG_AGENT_IDS = {"assistant", "research", "claude-sdk", "invest"}`

- [ ] **Step 4: 运行测试**

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/test_invest_agent.py -q
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/agents/invest_agent.py backend/skill_settings.py backend/global_prompt_settings.py backend/habit_prompt_settings.py backend/agent_model_settings.py backend/tests/test_invest_agent.py
git commit -m "feat(agent): 龙虾·原生版·投资助手(invest)+ 白名单"
```

---

### Task 5: skill 搬迁到 backend/skills

**Files:**
- Move: `~/.claude/skills/tushare-data/` → `backend/skills/tushare-data/`

- [ ] **Step 1: 写失败测试**

创建 `backend/tests/test_tushare_skill_discover.py`:

```python
def test_tushare_skill_discoverable():
    from skill_settings import discover_skills
    skills = discover_skills()
    ids = [s.get("id") for s in skills]
    assert "tushare-data" in ids
```

- [ ] **Step 2: 运行失败测试**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_tushare_skill_discover.py -q
```

Expected: FAIL,`tushare-data` 未在 backend/skills。

- [ ] **Step 3: 搬迁 skill**

```bash
mkdir -p backend/skills
cp -r ~/.claude/skills/tushare-data backend/skills/tushare-data
```

验证目录结构:`backend/skills/tushare-data/SKILL.md` + `backend/skills/tushare-data/references/数据接口.md` 存在。

- [ ] **Step 4: 运行测试 + 验证 references 可读**

```bash
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_tushare_skill_discover.py backend/tests/test_file_read_skill_dirs.py -q
```

Expected: PASS(discover 扫到 + file_read fallback 能读 references)。

- [ ] **Step 5: Commit**

```bash
git add backend/skills/tushare-data backend/tests/test_tushare_skill_discover.py
git commit -m "feat(skill): tushare-data 搬到 backend/skills(进镜像+references 可读)"
```

---

### Task 6: 部署 env(TUSHARE_TOKEN)

**Files:**
- Modify: `docs/deploy-mysql.md`
- Modify: `backend/.env`(本地,不 commit)

- [ ] **Step 1: 改部署文档**

`docs/deploy-mysql.md` 的 env 表 + docker run 命令加 `TUSHARE_TOKEN`。**mask 纪律**:判空用 `[ -n "$TUSHARE_TOKEN" ]`,禁 `${TUSHARE_TOKEN:-}`(非空展开泄漏明文)。

docker run 增加(mask 写法,实际值运行时填):

```bash
[ -n "$TUSHARE_TOKEN" ] && DOCKER_ARGS="$DOCKER_ARGS -e TUSHARE_TOKEN=$TUSHARE_TOKEN"
docker run ... $DOCKER_ARGS ...
```

- [ ] **Step 2: 本地 .env 加 token**

`backend/.env` 加一行(本地开发用,不 commit):

```
TUSHARE_TOKEN=<实际 token>
```

- [ ] **Step 3: Commit 文档**

```bash
git add docs/deploy-mysql.md
git commit -m "docs(deploy): 加 TUSHARE_TOKEN env 注入"
```

(`backend/.env` 在 .gitignore,不提交)

---

### Task 7: 整体回归 + 更新跟踪矩阵

**Files:**
- Modify: `项目执行跟踪矩阵.md`

- [ ] **Step 1: 后端全量回归**

```bash
MYSQL_HOST=localhost MYSQL_PORT=3306 MYSQL_USER=root MYSQL_PASSWORD=123456 MYSQL_DATABASE=context_lab_test backend/.venv/Scripts/python.exe -m pytest backend/tests/ -q
```

Expected: 新增测试全 PASS,无回归(预先存在的失败测试见 [[project_preexisting-failing-tests]],不算回归)。

- [ ] **Step 2: 前端回归(零改动应通过)**

```bash
npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 3: 冒烟验证(需用户参与)**

启动后端 + 前端,选「龙虾·原生版·投资助手」,验证:
- 问「茅台最近走势」→ agent 调 tushare daily → 返回带日期的行情
- 问无关问题(写代码)→ 礼貌拒绝引导回投资
- 大表查询 → agent 用 output_file 落 CSV → Read 读摘要
- Skill tab 显示 tushare-data

- [ ] **Step 4: 更新跟踪矩阵**

`项目执行跟踪矩阵.md` 追加:

```markdown
### 2026-06-25(龙虾·原生版·投资助手 P0)

- 新增需求:封闭域投资助手 agent,直连 Tushare Pro。
- 规格:`docs/superpowers/specs/2026-06-25-invest-agent-p0-design.md`
- 计划:`docs/superpowers/plans/2026-06-25-invest-agent-p0-plan.md`
- 执行:tushare 内置工具 + invest agent(max_loops=15)+ base_agent max_loops 可覆盖 + file_read SKILL_DIRS fallback + skill 搬 backend/skills + 四处白名单 + TUSHARE_TOKEN env。前端零改动。
- P1 待办:pin_stock 自选股(MySQL watchlist 表)+ 提示词精调 + 端到端深验。
```

- [ ] **Step 5: Commit**

```bash
git add 项目执行跟踪矩阵.md
git commit -m "docs(tracking): 补录投资助手 invest P0"
```

---

## 执行顺序与依赖

```
Task 1 (max_loops) ──┐
Task 2 (file_read) ──┼──→ Task 3 (tushare) ──→ Task 4 (invest) ──→ Task 7 (回归+矩阵)
                     │                                    ↑
                     └────────────────────→ Task 5 (skill) ┘
Task 6 (env) 独立,任何时候做
```

- Task 1/2 通用增强,先做(invest 依赖)
- Task 3 核心工具,依赖 Task 2 的 `_resolve` 复用
- Task 4 把 agent 立起来,依赖 Task 1(max_loops)+ Task 3(tushare 工具)
- Task 5 skill 搬迁,依赖 Task 2(Read 读 references)
- Task 6 env 文档,独立
- Task 7 收尾回归

## 风险

- **token 泄漏**:TUSHARE_TOKEN 在 ~/.claude.json 明文(见 mask 纪律 [[feedback_mask-secrets]]),文档/commit 绝不写真实值,判空用 `[ -n "$X" ]`
- **测试烧积分**:tushare 工具测试全 mock httpx,不真调
- **共享 MySQL**([[project_shared-mysql-db]]):测试隔离到 context_lab_test 库,env 指定 MYSQL_DATABASE=context_lab_test
- **预先失败测试**([[project_preexisting-failing-tests]]):回归时排除已知老失败,别误判
