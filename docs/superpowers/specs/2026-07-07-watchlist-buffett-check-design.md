# RQ-091 自选股巴菲特视角体检(py 规则版)

> 2026-07-07 | 设计文档 | 关联 RQ-090 股票详情页 / buffett skill

## 概述

在 StockDetailPanel 的"安全"子 tab 边上加第 7 个子 tab「🩺 巴菲特视角」,展示该股的巴菲特式体检结果。体检由后端 `buffett_check.py` 用 tushare 数据 + 规则编码 + 预写文案库产出,**不依赖 LLM**(秒出)。需要 AI 的维度(管理诚信/定价权深度/护城河类型定性)本期标盲区,后续做。

## 数据流

```
用户点股票 → StockDetailPanel 切「巴菲特视角」tab
 → 前端从 stock-detail 端点返回的 JSON 里取 buffett 字段(已随端点一起返回,不二次请求)
 → 渲染体检结果(8 问红绿灯 + 护城河信号 + 财务翻译 + 估值 + 风险 + 总评)

后端:stock-detail 端点
 → analyze_stock(已有,采数据)
 → score(已有,5 维度评分)
 → buffett_check(新,规则体检) ← 本期新增
 → 组装 JSON(现有字段 + 新 buffett 字段)→ 返回
```

## 后端变更

### 1. 新文件 `backend/scripts/buffett_check.py`

复用 `analyze_stock` 的产出(basic/panel/growth/profit/value/trend/safety),**不重新拉数据**。

```python
def buffett_check(analysis: dict) -> dict:
    """巴菲特式规则体检。返回结构化结果 + 通俗文案。"""
```

### 2. 体检评分阈值 + 文案库

**8 问自动判定**(基于数据 + 行业模板):

| 问 | 数据信号 | 判定逻辑 |
|----|---------|---------|
| Q1 看得懂吗 | basic.industry | 行业模板:水电/白酒/消费=绿(简单);软件/科技=黄(复杂);未知=灰 |
| Q2 10 年后在不在 | list_date 年数 + 行业 | 上市>10 年 + 非颠覆行业=绿;<10 年=黄 |
| Q3 护城河 | 毛利率水平 | >60%=绿(可能有);40-60%=黄;<40%=红(大宗商品嫌疑) |
| Q4 能涨价吗 | 毛利率稳定性 | 稳定/上升=绿;下降=黄 | 数据有限,标"深度需 AI" |
| Q5 利润真假 | cash_ratio | >0.9=绿;0.7-0.9=黄;<0.7=红 |
| Q6 负债安全 | debt_ratio + 行业修正 | 通用 <50%=绿;重资产行业(水电/地产)放宽到 70% |
| Q7 管理诚信 | 无数据 | **固定灰灯**"需人工看公告/审计意见" |
| Q8 价格划算 | pe_pct + 股息率 | pe_pct<30% + 股息>2.5%=绿;30-60%=黄;>60%=红 |

**财务指标文案库**(每指标 4 档,带 {占位符} 插值):

```python
ROE_EXPLAIN = {
    "green_top":  "每 100 块本金赚 {val} 块,顶级生意水平 🟢",
    "green":      "每 100 块本金赚 {val} 块,过巴菲特 15% 及格线 🟢",
    "yellow":     "每 100 块本金赚 {val} 块,中规中矩 🟡",
    "red":        "每 100 块本金只赚 {val} 块,回报偏低 🔴",
}
# 同理:CASH_RATIO / GROSS_MARGIN / NET_MARGIN / DEBT_RATIO / PE_PCT / DIVIDEND_YIELD
```

**行业模板**(内置 6 个,根据 basic.industry 关键词匹配):

```python
INDUSTRY_TEMPLATES = {
    "水电": {"q1_simple": True, "debt_relax": True, "risk_top3": ["来水风险","电价管制","成长见顶"]},
    "白酒": {"q1_simple": True, "debt_relax": False, "risk_top3": ["需求周期","政策(消费税)","竞争"]},
    "软件": {"q1_simple": False, "debt_relax": False, "risk_top3": ["技术迭代","客户集中","应收账款"]},
    "银行": {...}, "保险": {...}, "消费品": {...},
}
# 未匹配 → 通用模板,risk 标"需结合行业判断"
```

### 3. 返回 JSON 结构(挂在 stock-detail 的 buffett 字段下)

```json
{
  "buffett": {
    "conclusion": {
      "verdict": "通过初筛,值得深入研究",
      "one_liner": "典型现金奶牛型,价格合理不便宜",
      "counts": {"green": 4, "yellow": 3, "red": 0, "gray": 1}
    },
    "eight_questions": [
      {"n": 1, "dimension": "看得懂吗", "light": "green", "explain": "水电卖电,一句话讲清"},
      ...
      {"n": 7, "dimension": "管理诚信", "light": "gray", "explain": "数据看不出来,需人工看公告/审计意见"}
    ],
    "moat": {
      "signal": "毛利率 61.7%(>60%),可能有护城河",
      "type": "需 AI 定性(资源/品牌/成本/网络/切换)",
      "strength": "中-强(基于毛利水平)",
      "trend": "数据不足,需看多年趋势"
    },
    "financials": [
      {"metric": "ROE", "value": 16.0, "light": "green", "explain": "每 100 块本金赚 16.0 块,过巴菲特 15% 及格线 🟢"},
      {"metric": "毛利率", "value": 61.7, "light": "green", "explain": "..."},
      {"metric": "净利率", "value": 40.5, ...},
      {"metric": "现金含量", "value": 1.76, ...},
      {"metric": "负债率", "value": 58.3, ...},
      {"metric": "股息率", "value": 3.44, ...}
    ],
    "valuation": {
      "pe": 18.59, "pe_pct": 0.24,
      "explain": "PE 18.59,历史分位 24%(比过去 76% 时间便宜)",
      "margin_of_safety": "合理偏上,无明显折扣"
    },
    "risks": ["来水风险(枯水年)", "电价管制", "成长见顶"],
    "summary": "这是一类你买下后不用太操心的稳态生意...(模板总评)"
  }
}
```

### 4. 端点集成

`routers/watchlist.py` 的 `get_stock_detail`:
- 新增 `from buffett_check import buffett_check`
- 在组装 data 时多算 `buffett = buffett_check(analysis)`,挂到 `data["buffett"]`
- 复用现有 `_clean()`(NaN→None)+ 10 分钟缓存

## 前端变更

### StockDetailPanel.tsx

- `SUB_TABS` 从 6 个变 7 个:`['总览','成长','盈利','估值','趋势','安全','🩺 巴菲特']`
- 新增渲染分支:`sub === '🩺 巴菲特' && <BuffettView data={data.buffett} />`
- 新组件 `BuffettView`(可内联在 StockDetailPanel.tsx 或拆小文件):渲染体检 JSON
  - 结论卡(verdict + one_liner + 红绿黄灰统计)
  - 8 问表(每问:维度 + 灯 + 通俗解释)
  - 护城河信号
  - 财务翻译表(指标 + 值 + 人话)
  - 估值
  - 风险列表
  - 总评

### dbApi.ts

`StockDetail` 类型加 `buffett?: BuffettCheck` 字段(可选,端点未升级时不渲染)。

## 测试

### 后端 `test_buffett_check.py`
- mock analyze_stock 返回 fixture,验证 buffett_check 输出结构(8 问齐全/财务文案命中阈值/行业模板匹配)
- 验证 stock-detail 端点返回 JSON 含 buffett 字段

### 前端 `StockDetailPanel.test.tsx`
- 补 1 个测试:MOCK 数据含 buffett 字段 → 切到「巴菲特」tab → 看到 verdict + 8 问

## 不包含(本期不做,留后续)

- Q7 管理诚信的 AI 判断(需对话/LLM)
- Q4 定价权的深度分析(需多年毛利率趋势 + 提价事件)
- 护城河"类型"定性(品牌/成本/网络/切换/规模)——需 LLM
- 行业横向对比 / 同业排名
- 对话式"问 agent 深入聊"入口(可作下期混合方案)

## 风险/边界

- **行业模板覆盖有限**:只有 6 个行业,未匹配的走通用模板(风险标"需结合行业")。诚实标盲区,不硬编
- **Q3 护城河只是信号**:"毛利率>60% 可能有护城河"是必要不充分,文案诚实说"需 AI 定性"
- **文案生动度**:模板插值比 demo 的 LLM 即兴文案"规整",但保证通俗(每术语配人话)
