# K线图叠加沪深300基准对比

## 背景

现有 `KlineChart`(个股详情页「📈 K线」tab)显示个股收盘价折线 + MA5/10/20,Y 轴为绝对价格。用户希望叠加沪深300 做对比,直观判断个股跑赢/跑输大盘。

核心难点:个股价格(如茅台 ~1200 元)与沪深300 指数(~4800 点)量级差几倍,直接画在同一绝对价格轴上会一条贴顶一条贴底,看不出对比形状。

## 目标

在 K线 tab 增加**可开关的「沪深300 归一化对比」**:

- **开启**:个股 close/MA 与沪深300 都归一到区间首日 = 100,共用百分比轴,看相对强弱(上方 = 跑赢大盘)。
- **关闭**:保留现有绝对价格 + MA 图(零改动)。

## 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 对比方式 | 归一化叠加(非双轴/副图) | 双轴刻度独立易误读;副图多占空间。归一化是业界(雪球/东财)叠加指数的标准做法 |
| 数据来源 | `IndexDailyModel` 本地优先 + tushare `index_daily` 兜底 | 本地表回测已在抓沪深300;tushare 实测可用。与现有 kline「本地优先+tushare兜底」对称 |
| 归一化/对齐位置 | **后端** | 计算逻辑可单测;复用 `_build_kline_points` 风格;避免前端处理停牌缺口 |
| 归一化基准 | 区间首日(= limit 内最早一日,与个股 points 首日对齐) | 看「这段时间相对大盘」,最简,YAGNI |
| 开关默认 | **关** | 不破坏现状,用户主动叠加 |
| 沪深300 MA | 不画(只一条归一化线) | YAGNI,够用 |

## 方案:后端合并(方案A)

`/kline` 端点内顺带取沪深300 并归一化对齐,响应加 `benchmark` 字段。一次请求,复用 600s 缓存。前端只管渲染。

### 数据结构(后端响应)

```jsonc
{
  "ts_code": "600519.SH",
  "freq": "daily",
  "source": "local",
  "points": [{"date":"20260401","close":1210,"ma5":...,"ma10":...,"ma20":...}, ...],
  "benchmark": {
    "name": "沪深300",
    "code": "000300.SH",
    "points": [{"date":"20260401","value":100.0}, {"date":"20260402","value":101.2}, ...]
  }
}
```

- `benchmark.points` 与 `points` **同序、同 date 序列**(后端以个股 date 为基准对齐)。
- `benchmark.points[].value` **已归一化**(首日 = 100),前端无需再算。
- benchmark 取不到时 → `"benchmark": null`,不影响个股数据。

### 后端改动(`backend/routers/watchlist.py`)

1. **新增 `_build_benchmark_points(freq, limit, ref_dates)`**:
   - 取 `000300.SH`:`IndexDailyModel` 本地优先(`db.query(IndexDailyModel)...`)→ tushare `_tushare_post("index_daily", {"ts_code":"000300.SH"})` 兜底。
   - 按 freq 聚合:指数无 `adj_factor`,close 直接用;聚合规则复用 `_build_kline_points` 的 `W`/`M` 逻辑(daily 不聚合)。
   - **按 `ref_dates`(个股 points 的 date 序列)对齐**:个股停牌日(个股无 point)不出现在 ref_dates,故 benchmark 也只在个股有数据的日期上取值;若个股某日有值但 benchmark 缺(沪深300 也停?罕见),该日 value=null。
   - 归一化:`value = close / close_base * 100`,其中 `close_base` = benchmark 在 ref_dates 中**第一个有值日**的 close(通常即 ref_dates[0];若该日 benchmark 缺值则顺延到下一个有值日)。
   - 返回 `[{date, value}]`,长度与 ref_dates 一致。

2. **`get_kline` 端点整合**:
   - 现有逻辑算完个股 `points` 后,提取 `ref_dates = [p["date"] for p in points]`,调 `_build_benchmark_points`。
   - `try/except`:benchmark 失败 → `benchmark = None`(不影响个股,不抛 500)。
   - 响应加 `benchmark` 字段。
   - 缓存:`_BENCHMARK_CACHE[(freq, limit)]` 存的是**沪深300 按 freq 聚合后的 raw close 时间序列**(全局,与个股无关,TTL 600s),避免每个 ts_code 都重查沪深300。`_build_benchmark_points` 取出 raw 序列后,再按个股 `ref_dates` 对齐 + 归一化(这步依赖个股,不进缓存)。

### 前端改动

1. **`src/services/dbApi.ts`**:`KlineResult` 加 `benchmark?: {name; code; points: {date; value}[]} | null`。

2. **`src/components/agentRuntime/KlineChart.tsx`**:
   - 加 `showBenchmark` state(默认 `false`)。开关 UI 放在 freq 切换旁。
   - **开**:`points` 归一化(close/ma5/ma10/ma20 各 ÷ `points[0].close` × 100),与 `benchmark.points` 按 date 合并为单个 recharts data(`{date, closeN, ma5N, ..., bench}`),Y 轴切百分比轴 + Tooltip 显示「相对涨跌 %」。
   - **关**:现状(绝对价 + MA)。
   - benchmark = null → 开关置灰 + 提示「沪深300数据暂不可用」,个股图正常。
   - 沪深300 线配色:**实现阶段过 dataviz skill 校验第 5 色**(现有 close/ma5/ma10/ma20 四色已 CVD 校验),用虚线或异色与个股 MA 区分。

### 错误降级

| 场景 | 行为 |
|------|------|
| 本地无沪深300 + tushare 失败 | `benchmark=null`,前端开关置灰,个股图正常 |
| 沪深300 部分日期缺失(停牌) | 该日 value=null,`connectNulls` 连线 |
| 个股本身无数据 | 现状不变(`points=[]` 提示),benchmark 也不渲染 |

## 测试(TDD)

**后端**(`backend/tests/`,扩展现有 kline 测试或新增 `test_kline_benchmark.py`):
- `_build_benchmark_points`:freq 聚合(daily/weekly/monthly)正确
- 按 ref_dates 对齐(个股停牌日不在结果)
- 归一化首日 = 100
- tushare 兜底路径(mock)
- 端点返回 `benchmark` 字段;benchmark 失败时为 null 且个股正常

**前端**(`KlineChart.test.tsx`):
- 开关关闭:渲染绝对价(现状)
- 开关开启 + benchmark 存在:渲染归一化百分比轴 + 沪深300 线
- benchmark = null:开关置灰

## 不做(YAGNI)

- 沪深300 的 MA 线
- 双 Y 轴 / 超额副图模式
- 归一化基准可配置(只首日,不做"一年前/固定日")
- 新建指数数据抓取任务(复用回测已抓的 IndexDailyModel)
- 基准指数可切换(只沪深300,不做上证50/创业板指等可选)
