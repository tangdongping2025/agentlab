# RQ-092 巴菲特盲区规则化(Q4 定价权/护城河趋势/Q7 审计意见)

> 2026-07-08 | 设计文档 | 关联 RQ-091 巴菲特体检

## 概述

把 RQ-091 巴菲特体检里的 3 个"灰盲区"升级为数据驱动:Q4 定价权(多年毛利率趋势)、护城河强度趋势(多年 ROIC)、Q7 管理诚信底线(审计意见)。拉更多 tushare 数据 + 规则判定,**仍不依赖 LLM,秒出**。真正的 AI 盲区(护城河类型定性、管理层深层诚信)留 RQ-093。

## 数据源(已验证 token ea217... 可调)

| 接口 | 字段 | 用途 |
|------|------|------|
| `fina_indicator`(已用,扩取) | `end_date, grossprofit_margin, roic` | 近 5 年年报序列 |
| `fina_audit`(新增) | `audit_result` | 最新审计意见 |

## 后端变更

### 1. `backend/scripts/analyze.py` 扩展返回

在 `analyze_stock` 返回 dict 里新增 2 个字段(不影响现有字段):

```python
# 近 5 年年报关键指标序列(给 buffett 算趋势)
annual_gpm = [行 for annual if endswith('1231')] 近5年的 grossprofit_margin
annual_roic = 同上 roic
fina_annual = [{"end_date":..., "grossprofit_margin":..., "roic":...}, ...]  近5年(升序)

# 最新审计意见
audit = pro.fina_audit(ts_code=ts_code)
audit_result = audit.iloc[0]["audit_result"] if len(audit) else None
```

返回新增:
```python
'fina_annual': fina_annual,      # list[5], 近5年年报
'audit_result': audit_result,    # str|None, 最新审计意见
```

### 2. `backend/scripts/buffett_check.py` 升级 3 处

**Q4 定价权**(原固定灰):
```python
def _light_pricing_power(fina_annual):
    if len(fina_annual) < 3:
        return ("gray", "多年毛利率数据不足,无法判断定价权趋势")
    gpms = [x["grossprofit_margin"] for x in fina_annual if x["grossprofit_margin"] is not None]
    if len(gpms) < 3:
        return ("gray", "毛利率数据不足")
    diff = gpms[-1] - gpms[0]
    sd = 标准差(gpms)
    if diff > 0 or sd < 3:
        return ("green", f"近{len(gpms)}年毛利率稳定/上升({gpms[0]:.1f}→{gpms[-1]:.1f}%),有定价权")
    if diff > -5:
        return ("yellow", f"近{len(gpms)}年毛利率缓降({gpms[0]:.1f}→{gpms[-1]:.1f}%),定价权减弱")
    return ("red", f"近{len(gpms)}年毛利率大降({gpms[0]:.1f}→{gpms[-1]:.1f}%),定价权受损")
```

**护城河 strength**(原只看当期毛利率,升级看 ROIC 趋势):
```python
def _moat_signal_v2(fina_annual, gross_margin):
    roics = [x["roic"] for x in fina_annual if x["roic"] is not None]
    if len(roics) >= 3:
        avg_roic = mean(roics)
        roic_trend = "上升" if roics[-1]>roics[0] else ("稳定" if abs(roics[-1]-roics[0])<3 else "下降")
        if avg_roic > 15 and roic_trend != "下降":
            strength = f"强(5年均 ROIC {avg_roic:.1f}%,{roic_trend})"
        elif avg_roic > 10:
            strength = f"中(5年均 ROIC {avg_roic:.1f}%,{roic_trend})"
        else:
            strength = f"弱(5年均 ROIC {avg_roic:.1f}%,{roic_trend})"
    else:
        strength = "ROIC 数据不足,看当期毛利率"
    # 毛利率信号保留
    ...
```

**Q7 管理诚信底线**(原固定灰):
```python
def _light_audit(audit_result):
    if audit_result is None:
        return ("gray", "审计意见数据缺失")
    if "标准无保留" in audit_result and "强调" not in audit_result:
        return ("green", f"审计意见:标准无保留(财务底线 OK;深层诚信如并购/关联交易仍需 AI/人工)")
    if "保留" in audit_result and "无法" not in audit_result and "否定" not in audit_result:
        # "带强调事项段的无保留" 或 "保留意见"
        return ("yellow", f"审计意见:{audit_result}(有警示信号,需关注)")
    return ("red", f"审计意见:{audit_result}(严重红旗,财务真实性存疑)")
```

### 3. 端点

无变化(buffett_check 仍由 stock-detail 端点调,buffett 字段结构不变,只是 eight_questions[3]/[6] 和 moat.strength 内容更充实)。

## 前端变更

无(BuffettView 已能渲染任意 light/explain 文本)。只是盲区行的内容从"数据看不出来"变成真实判断。

## 测试

### `test_buffett_check.py` 补充
- `test_pricing_power_trend`:fina_annual 毛利率上升→green / 大降→red / 不足→gray
- `test_audit_opinion_mapping`:标准无保留→green / 保留→yellow / 无法表示→red / None→gray
- `test_moat_strength_roic_trend`:ROIC 5年均>15 不降→强 / <10→弱

### `test_stock_detail.py`
- _fake_analysis 补 fina_annual + audit_result,断言 buffett.eight_questions[3]/[6] 不再固定灰

## 不包含(留 RQ-093)

- 护城河"类型"定性(品牌/成本/网络/切换/规模)——需 AI
- 管理层深层诚信(并购/关联交易/信披违规)——需 AI 读公告/新闻
- 详情页"AI 深挖"按钮 / 对话式深挖(待 RQ-093 单独定方案)

## 风险

- **fina_audit 接口积分**:已验证 token 可调(茅台返回 3 条),但批量自选股可能受频控。若失败,audit_result=None→灰灯降级,不阻塞
- **ROIC 季报值不可比**:只取年报(endswith 1231),buffett_check 过滤
- **analyze.py 改动**:从 python-learning 搬来的副本,改它会让两边 diverge——但 backend/scripts/ 已是 context-lab 独立副本,本就该适配,可接受
