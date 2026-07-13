# 2026-07-13 回测结果持久化 + AI 分析点评

## 目标
每次回测自动记录历史(策略/参数/指标/净值摘要),AI 按需对单次结果做全面诊断(评级 + Markdown + 改进建议)。

## 决策(用户确认)
- **自动存历史**(每次回测自动落库,不调 LLM)+ **AI 点评按需**(单独按钮触发,省 token,调参时不浪费)
- **全面诊断**(多维度,非一句话)

## 数据模型(新表 backtest_history)
`BacktestHistoryModel`:
- `id` PK / `created_at`
- `strategy`, `strategy_label`, `params`(JSON)
- `start_date`, `end_date`, `cadence`, `weighting`
- `metrics`(JSON:ann_return/bench_ann_return/excess/sharpe/max_drawdown/calmar/win_rate/icir/ic_win_rate)
- `equity_first`, `equity_last`, `benchmark_last`, `points_count`(净值摘要,不存全量 equity/drawdown 省空间)
- `ic_count`
- `ai_verdict`(String:靠谱/谨慎/不靠谱,null 初始)
- `ai_comment`(Text:Markdown,null 初始)
- `ai_analyzed_at`(DateTime,null)

## 端点(candidates router,prefix /api/db)
- `POST /candidates/backtest`:回测 + **自动 INSERT history** → 返回原 BacktestResult + `backtest_id`
- `POST /candidates/backtest/{id}/analyze`:LLM 全面诊断 → UPDATE `ai_verdict`/`ai_comment`/`ai_analyzed_at` → `{verdict, comment, analyzed_at}`
- `GET /candidates/backtest/history`:[{id, created_at, strategy, strategy_label, metrics 摘要, ai_verdict}]
- `GET /candidates/backtest/{id}`:{全部字段 + ai_comment}
- `DELETE /candidates/backtest/{id}`

## LLM 全面诊断 prompt
- **system**:你是量化回测分析助手。多维度诊断:① 绝对收益与年化 ② 风险(最大回撤/波动/Sharpe/Calmar)③ 超额 vs 沪深300 ④ 胜率 ⑤ 回撤恢复 ⑥ 参数合理性(window/top_n/权重)⑦ 幸存者偏差/过拟合/前视风险提醒 ⑧ 改进建议。诚实,数据局限要标注。输出第一行 `VERDICT: 靠谱|谨慎|不靠谱`,后续 Markdown(结论先行,关键数字加粗,分维度)。
- **user**:策略/params/区间/cadence/weighting + metrics(年化/超额/Sharpe/回撤/胜率/ICIR)+ 净值摘要(起点1.0→末点/基准末点/期数)。
- 复用 `_call_llm`(Anthropic SDK + deepseek,max_tokens 1500)。

## 前端(BacktestPanel)
- 回测结果含 `backtest_id`,显示 **「🔍 AI 点评」按钮** → POST analyze → **点评卡片**(verdict badge 绿/黄/红 + Markdown 用 react-markdown 渲染)
- **历史抽屉**:GET history → 列表(时间/策略/年化/超额/verdict badge),点击 GET {id} 看详情 + 点评,可 DELETE

## 验证
- 回测 → backtest_history 自动存一行(ai_verdict/comment null)
- analyze → LLM 返回 verdict + Markdown,UPDATE 该行
- 前端:点评卡片渲染 + 历史列表查看/删除
- test_backtest:run_backtest 返回含 backtest_id;analyze 端点 mock LLM 测试

## 不做(YAGNI)
- 不存全量 equity/drawdown(摘要够,详情重跑即可;省 DB 空间)
- 不自动点评(按需按钮)
- 不做回测间对比(本次只单次诊断 + 历史)
