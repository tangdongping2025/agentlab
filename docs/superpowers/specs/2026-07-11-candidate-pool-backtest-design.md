# 候选池 pillar E·回测引擎 + Recharts 图表 · 设计

> 2026-07-11 | 设计文档 | 多策略投研平台 pillar E(spec 2)
> 前置:pillar A+B(候选池 screener,`docs/superpowers/specs/2026-07-11-invest-candidate-pool-design.md`)已完成合入 main。

## 概述

invest agent 加「回测」tab:把选中的 rank-composite 策略按月(或季)walk-forward 跑过历史(2020+),产出**净值曲线 / 水下回撤 / 关键指标**,Recharts 交互式图表(Tooltip 悬停看每点值)。**不落库**,按需算。

复用 A+B 的数据底座(`stock_daily`/`fundamental_pit`/`index_constituent`)与纯打分函数 `rank_composite_score`。这是平台第 5 个 pillar;pillar C(ML 策略)/D(组合优化加权)接入后,本回测引擎天然支持(Strategy 抽象),但 v1 只回测 rank-composite。

### 关键决策(brainstorming 已确认)

| 维度 | 决策 |
|---|---|
| 再平衡频率 | **可切换,默认月频**(UI 选 monthly/quarterly) |
| 持久化 | **不落库**(按需算,load-once 后单次秒级) |
| 加权 | **等权**(min_var/risk_parity = pillar D,不做) |
| 摩擦 | 单边费率 0.1%(`cost_single=0.001`,同 python-learning),UI 可关 |
| 基准 | **CSI300 等权**(同面板算,不另抓指数行情;基准不计成本) |
| 指标 | 年化/基准年化/超额/Sharpe/最大回撤/Calmar/胜率 |
| 区间 | 默认 2020-01 ~ 最新交易日,UI 可调 |
| 数据策略 | **load-once**:一次性读窗口面板,pandas 内存切片(非每调仓日重查) |

## 架构(后端算,前端渲)

数据在 MySQL,前端做不了。关键:`compute_candidates` 每次重查整 universe(N+1 × ~300),回测要调 ~72 次 ≈ 65k 查询,太慢。所以引擎 **load-once**:

1. 一次性把窗口内 `stock_daily`(close/adj_factor/pe_ttm/total_mv)+ `fundamental_pit`(roe/ann_date/end_date)+ `index_constituent`(code/trade_date)读进 pandas DataFrame(按 code 分组)。
2. 调仓日序列 = `stock_daily.trade_date` 按 cadence(month/quarter)分桶取每桶最大交易日,落在 [start, end] 内。
3. 每个调仓日 `rb`:**PIT**(只用 ≤rb 的数据)切片 → 复用 `screener.rank_composite_score(rows, params)` → top_n → 等权组合。
4. 组合持有至下一调仓日,用 `adj_close = close × adj_factor` 算区间收益 → 累计净值。
5. 基准 = 同 universe 等权 CSI300,同法累计净值(不计成本)。
6. `compute_metrics(strategy_eq, benchmark_eq, dates)` 算指标。

## 数据流

```
[在线/秒级] 用户在「回测」tab 选策略(preset/自定义)+ cadence + 区间 → 【回测】
 → POST /api/db/candidates/backtest {strategy:"rank_composite", params, cadence, start, end, cost?}
   → 空数据底座 → 409
   → backtest.run_backtest(db, ...):
      load 面板 → 算调仓日序列 → 逐 rb(PIT) rank_composite_score → 等权组合净值 vs 基准净值 → metrics
   → 返回 {equity, drawdown, metrics, as_of, params, caveats}  (不落库)
 → 前端 Recharts:净值 LineChart(<Tooltip> 悬停看每点 date+策略+基准)/ 水下回撤 AreaChart / 指标 tile 行
```

## 组件

### ① 回测引擎 `backend/scripts/backtest.py`

```python
def run_backtest(db, strategy_name="rank_composite", params: dict,
                 start_date="20200101", end_date: str | None = None,
                 cadence="monthly", cost_single=0.001) -> dict:
    """load-once walk-forward。复用 screener.rank_composite_score。返回 {equity, drawdown, metrics, caveats}。"""
    # 1. load 面板(per code: adj_close 序列、pe_ttm 序列、roe PIT 序列、name/industry)
    # 2. 调仓日序列(cadence 分桶,落在 [start,end])
    # 3. 逐 rb(PIT):universe=最新 index_constituent ≤rb;三因子 as-of rb;rows→rank_composite_score→top_n 等权
    # 4. 持有至下一 rb,adj_close 算组合收益;扣成本 cost_single×turnover
    # 5. 基准 = universe 等权,同法(不计成本)
    # 6. compute_metrics
    ...

def compute_metrics(strategy_eq: list[float], benchmark_eq: list[float],
                    dates: list[str], rf: float = 0.02) -> dict:
    """纯函数。年化/基准年化/超额/Sharpe/最大回撤/Calmar/胜率(策略区间收益>0 占比)。"""
    ...
```

**PIT 安全**:每个 `rb` 切片只用 `trade_date ≤ rb`(行情)、`ann_date ≤ rb`(财务)、`trade_date ≤ rb`(成分)。动量 = `adj_close` 在 `≤rb` 序列上的 window 区间收益。
**幸存者偏差天花板**:`index_weight` 实测仅近 ~2 年(2024-07 起);`rb < 2024-07` 时退到最早可用快照(= 2024 成分回溯) → 2024 前存在幸存者偏差。结果 `caveats` 标注。

### ② Router `backend/routers/candidates.py` 加端点

```python
@router.post("/candidates/backtest")
def backtest(payload: dict, db: Session = Depends(get_db)):
    strategy = payload.get("strategy", "rank_composite")
    if strategy != "rank_composite":
        raise HTTPException(400, "v1 仅支持 rank_composite")
    if db.query(models.StockDailyModel).count() == 0:
        raise HTTPException(409, "数据底座为空,先跑 scripts/fetch_candidates_data.py")
    params = _resolve_params(payload.get("label"), payload.get("params"))
    from backtest import run_backtest  # scripts path 已在 router 注入
    result = run_backtest(db, strategy, params,
                          start_date=payload.get("start", "20200101"),
                          end_date=payload.get("end"),
                          cadence=payload.get("cadence", "monthly"),
                          cost_single=payload.get("cost", 0.001))
    return result   # {equity, drawdown, metrics, as_of, params, caveats}
```

### ③ 前端

- `src/services/dbApi.ts` 加 `runBacktest(payload)` + 类型(`BacktestResult: {equity:[{date,strategy,benchmark}], drawdown:[{date,value}], metrics:{...}, caveats:[string]}`)。
- `src/components/agentRuntime/BacktestPanel.tsx` —— 镜像 `CandidatePanel.tsx` 暖色风:
  - 控制栏:策略下拉(复用 4 preset + 自定义)+ cadence(month/quarter)+ 区间 + 【回测】
  - 指标 tile 行:年化/基准/超额/Sharpe/最大回撤/Calmar/胜率
  - Recharts `<LineChart>` 净值曲线(策略 vs 基准 + `<Tooltip>` + `<Brush>` 区间缩放)
  - Recharts `<AreaChart>` 水下回撤
  - caveats 红字提示(幸存者偏差等)
  - mockup 见 `.superpowers/brainstorm/.../backtest-charts.html`(上一轮已画)
- `invest_agent` tabs 加「回测」;`TabsWorkspace.tsx` 加 `{activeStatic === '回测' && <BacktestPanel />}`。

### ④ 工具 `run_backtest_tool`(可选,建议加)

`backend/runtime/tools/candidates.py` 加 `RunBacktestTool`(name=`run_backtest`):agent 回测,只返回**指标摘要 + caveats**(不返回整条 series,太大),如「多因子平衡 2020-2026 月频 年化18.5%/基准4.2%/Sharpe1.07/最大回撤-21.4%」。`invest_agent.tool_names` 追加。

## 测试(TDD,每个 Task 先写失败测试)

| 文件 | 关键用例 |
|---|---|
| `test_backtest.py` | **`compute_metrics` 纯函数**(已知序列→已知年化/Sharpe/MaxDD/Calmar/胜率);load 面板切片正确;逐调仓日复用 rank_composite_score;top_n 等权组合收益计算;**PIT**(未来 ann_date/trade_date 不可见);cadence 月/季切换(调仓日数对);cost 计入(turnover-based);survivors < top_n 退化;空底座→空结果 |
| `test_candidates_router.py` 加 | `/candidates/backtest` 空底座→409;happy(monkeypatch run_backtest)返回结构(equity/drawdown/metrics/caveats) |
| `test_candidates_tool.py` 加 | `run_backtest` 工具返回指标摘要(monkeypatch run_backtest) |
| 前端 `BacktestPanel.test.tsx` | 控件渲染;回测 click 调 runBacktest;指标 tile + caveats 显示(Recharts mock) |

## 不包含(v1 范围外)

- 组合优化加权 min_var/risk_party(pillar D)
- ML 策略回测(pillar C 策略接入后天然支持,但 v1 只回测 rank-composite)
- 参数寻优 / 网格扫描 / 多回测对比
- IC/ICIR 评估(随 pillar C)
- 回测结果落库 / 历史回测列表(按需算,不存)
- 消除幸存者偏差(数据源天花板,仅标注)

## 关联

- 前置/复用:`docs/superpowers/specs/2026-07-11-invest-candidate-pool-design.md`(A+B 数据底座 + screener.rank_composite_score + Strategy 抽象 + _resolve_params)
- 回测参考:`python-learning/notebooks/day7_three_factor.ipynb::backtest_mf3`(月频 walk-forward + PIT universe + 等权 + cost_single)
- 图表库:Recharts@2.10(已装,`<Tooltip>`/`<Brush>` 原生)
- 原型:`.superpowers/brainstorm/.../backtest-charts.html`(净值曲线 + 回撤 + 指标 tile)
