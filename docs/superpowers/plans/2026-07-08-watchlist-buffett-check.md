# 巴菲特视角体检 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。Steps use checkbox (`- [ ]`).

**Goal:** StockDetailPanel 加第 7 子 tab「🩺 巴菲特」,展示 buffett_check.py 规则体检结果

**Architecture:** 后端 buffett_check.py 复用 analyze_stock 数据 + 规则评分 + 文案库 → stock-detail 端点加 buffett 字段 → 前端渲染

**Tech Stack:** Python(FastAPI/tushare) / React+TS+Vitest

## Global Constraints

- 不依赖 LLM,纯规则编码 + 预写文案库
- 复用 analyze_stock 数据,不重新拉 tushare
- Q7 管理诚信固定灰灯(数据盲区),Q4 定价权标"深度需 AI"
- 行业模板覆盖 6 个(水电/白酒/软件/银行/保险/消费品),未匹配走通用
- NaN/None 清晰处理(复用 _clean)
- 复用 stock-detail 10min 缓存

---

### Task 1: backend/scripts/buffett_check.py + 单测

**Files:**
- Create: `backend/scripts/buffett_check.py`
- Test: `backend/tests/test_buffett_check.py`

**Interfaces:**
- Consumes: `analyze.analyze_stock(ts_code) -> dict`
- Produces: `buffett_check(analysis: dict) -> dict`(结构见 spec 第 3 节)

- [ ] Step 1: 写失败测试(test_buffett_check.py)
  - test_buffett_check_returns_full_structure:mock analysis,验证返回含 conclusion/eight_questions(8个)/moat/financials/valuation/risks/summary
  - test_eight_questions_lights:验证 ROE/cash_ratio/pe_pct 不同值触发不同灯
  - test_industry_template_match:验证 industry="水力发电"匹配水电模板

- [ ] Step 2: 跑测试确认 FAIL

- [ ] Step 3: 实现 buffett_check.py
  - 文案库(COPY_EXPLAIN dicts):ROE/毛利率/净利率/现金含量/负债率/股息率/PE分位 各 4 档
  - INDUSTRY_TEMPLATES:水电/白酒/软件/银行/保险/消费品/通用
  - `_match_industry(name) -> key`
  - `_light_roe/`等阈值判定函数
  - `_eight_questions(a, ind) -> list[8]`
  - `_moat_signal(gross_margin) -> dict`
  - `_financials(a) -> list`
  - `_valuation(a) -> dict`
  - `_risks(ind) -> list`
  - `_summary(verdict, ind) -> str`
  - `buffett_check(analysis) -> dict` 主函数组装

- [ ] Step 4: 跑测试确认 PASS

- [ ] Step 5: commit

### Task 2: stock-detail 端点集成 buffett 字段

**Files:**
- Modify: `backend/routers/watchlist.py`(import buffett_check,data 加 buffett)
- Modify: `backend/tests/test_stock_detail.py`(mock buffett_check,验证 buffett 字段)

- [ ] Step 1: 测试加 mock + 断言 buffett 字段
- [ ] Step 2: 端点集成(monkeypatch 目标 buffett_check)
- [ ] Step 3: 跑测试 PASS
- [ ] Step 4: commit

### Task 3: 前端 StockDetailPanel 第 7 tab + BuffettView

**Files:**
- Modify: `src/components/agentRuntime/StockDetailPanel.tsx`(SUB_TABS 加「🩺 巴菲特」+ 渲染分支)
- Modify: `src/components/agentRuntime/StockDetailPanel.test.tsx`(补巴菲特 tab 测试)
- Modify: `src/services/dbApi.ts`(StockDetail 加 buffett?: BuffettCheck)

- [ ] Step 1: dbApi 类型加 BuffettCheck
- [ ] Step 2: 前端测试(切到巴菲特 tab 看到 verdict + 8 问)
- [ ] Step 3: 实现 BuffettView 组件 + SUB_TABS 加项
- [ ] Step 4: 测试 PASS + typecheck
- [ ] Step 5: commit

### Task 4: ECS 部署 + 端到端

- [ ] Step 1: 构建 + 打包
- [ ] Step 2: 部署(backend patch + dist patch)
- [ ] Step 3: curl 验证 buffett 字段
- [ ] Step 4: commit 跟踪矩阵 + push
