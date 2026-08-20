# Tushare 数据查询参考(MCP 接口清单 + Skill 菜谱)

> 本文档为个人查询参考,分两部分:
> - **Part 1**:`tushareMcp` MCP 的全量接口清单(按分类,260+ 接口)
> - **Part 2**:`tushare-data` skill 的研究菜谱(9 大工作流 + 核心规则)
>
> **怎么用**:
> - 查一条明确数据 → 看 Part 1,找对应接口
> - 开放式研究("这只股票最近怎么样""哪个板块最强")→ 看 Part 2,按菜谱走,菜谱会引用 Part 1 的接口
>
> 生成时间:2026-06-25 / MCP 来自会话注册工具,Skill 来自 `~/.claude/skills/tushare-data/SKILL.md` v1.1.12

---

## MCP 与 Skill 的关系(一句话)

**MCP 是数据通道(原子接口),Skill 是研究方法论(流程编排)**。Skill 在执行时会调用 MCP 取数 —— 两者是分层关系,不是替代。

| 维度 | tushareMcp (MCP) | tushare-data (Skill) |
|------|------------------|---------------------|
| 本质 | 260+ 个原子查询接口 | 研究流程(获取→清洗→对比→筛选→导出→分析) |
| 粒度 | 单个数据点 / 单张表 | 完整研究任务 |
| 前提 | 你知道调哪个接口、传哪个 ts_code/trade_date | 自然语言说需求,Skill 决定调哪些接口 |
| 返回 | 原始字段表格 | 清洗过的对比、结论、导出文件 |
| 典型场景 | "茅台今天收盘""000001.SZ 近 10 天日线" | "这只股票最近怎么样""哪个板块最强" |

**MCP 调用形式**:工具名为 `mcp__tushareMcp__<接口名>`,例如 `daily` → `mcp__tushareMcp__daily`。通用参数:`ts_code`(股票代码,如 `600519.SH`)、`trade_date`/`start_date`+`end_date`(`YYYYMMDD`)、`fields`(指定返回字段)。

---

# Part 1 — MCP 接口清单(按分类)

> 接口名即 MCP 工具名后缀。详细入参/出参可查 [Tushare 接口文档](https://tushare.pro/document/2)。

## A. 沪深股票

### A1. 基础数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `stock_basic` | 股票列表 | 代码/名称/上市日期/行业等基础信息 |
| `stock_company` | 上市公司基本信息 | 董事长/总经理/注册资本/员工数/主营等 |
| `bak_basic` | 股票历史列表(备用) | 2016 年起的备用基础列表,含 PE/PB/市值 |
| `stock_hsgt` | 沪深港通股票列表 | 沪深港通标的出入清单 |
| `hs_const` | 沪深股通成分股 | 沪股通/深股通成分 |
| `stock_st` / `st` | ST 股票列表 / ST 风险警示板 | 历史每日 ST 列表 / 风险警示板 |
| `bse_mapping` | 北交所新旧代码对照 | 北交所代码变更映射 |
| `new_share` | IPO 新股上市 | 新股上市列表 |
| `namechange` | 股票曾用名 | 历史名称变更记录 |
| `trade_cal` | 交易日历 | 各大交易所交易日历 |
| `stk_managers` | 上市公司管理层 | 高管列表及简历 |
| `stk_rewards` | 管理层薪酬和持股 | 高管薪酬持股 |
| `stk_premarket` | 每日股本(盘前) | 当日总股本/流通股本/涨跌停价 |

### A2. 行情数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `daily` | 历史日线 | 日 OHLCV(未复权) |
| `weekly` / `monthly` | 周线 / 月线行情 | 周/月 OHLCV |
| `stk_weekly_monthly` | 周月线(每日更新) | 每日更新的周/月线 |
| `stk_week_month_adj` | 周月线复权行情(每日更新) | 复权版 |
| `daily_basic` | 每日指标 | PE/PB/PS/股息率/市值/换手率等 |
| `adj_factor` | 复权因子 | 单股全历史或单日全市场 |
| `stk_mins` | 历史分钟 | 1/5/15/30/60min |
| `rt_k` | 实时日线 | 实时日 K,支持通配符批量 |
| `rt_min` / `rt_min_daily` | 实时分钟 / 当日累计分钟 | 盘中实时分钟数据 |
| `stk_limit` | 每日涨跌停价格 | 全市场每日涨停/跌停价 |
| `bak_daily` | 备用行情 | 2017 年中起,含特定指标 |
| `suspend` / `suspend_d` | 停复牌信息 | 历史停复牌 / 每日停复牌 |
| `hsgt_top10` | 沪深股通十大成交股 | 北向前十大 |
| `ggt_top10` | 港股通十大成交股 | 南向前十大 |
| `ggt_daily` / `ggt_monthly` | 港股通每日/每月成交统计 | 2014 年起 |
| `stk_auction` | 开盘竞价成交(当日) | 9:25-29 当日集合竞价 |
| `stk_auction_o` / `stk_auction_c` | 开盘 / 收盘集合竞价数据 | 9:30 / 15:00 竞价(盘后) |

### A3. 财务数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `income` | 利润表 | 营收/净利润/EBIT 等 |
| `balancesheet` | 资产负债表 | 资产/负债/股东权益 |
| `cashflow` | 现金流量表 | 经营/投资/筹资现金流 |
| `fina_indicator` | 财务指标数据 | ROE/毛利率/净利率/周转率等(每次≤100 条) |
| `fina_audit` | 财务审计意见 | 审计意见/费用/机构 |
| `fina_mainbz` | 主营业务构成 | 按产品/地区/行业 |
| `forecast` | 业绩预告 | 预增/预减/扭亏等 |
| `express` | 业绩快报 | 快报数据 |
| `dividend` | 分红送股数据 | 历史分红送股 |
| `disclosure_date` | 财报披露日期表 | 披露计划日期 |

### A4. 资金流向数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `moneyflow` | 个股资金流向 | 大/中/小单净流入(2010 年起) |
| `moneyflow_dc` | 个股资金流向(东财) | 东财口径,2023-09-11 起 |
| `moneyflow_ths` | 个股资金流向(同花顺) | 同花顺口径 |
| `moneyflow_hsgt` | 沪深港通资金流向 | 北向/南向每日资金流 |
| `moneyflow_ind_dc` / `moneyflow_ind_ths` | 板块/行业资金流向 | 东财 / 同花顺 |
| `moneyflow_cnt_ths` | 板块资金流向(同花顺概念) | 概念板块 |
| `moneyflow_mkt_dc` | 大盘资金流向(东财) | 全市场资金流 |

### A5. 两融及转融通

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `margin` | 融资融券交易汇总 | 每日汇总 |
| `margin_detail` | 融资融券交易明细 | 个股明细 |
| `margin_secs` | 融资融券标的(盘前) | 沪深京标的(含 ETF) |
| `margin_target` | 融资融券标的(下线) | 全市场标的 |
| `slb_len` | 转融资交易汇总 | 转融通融资 |
| `slb_sec` / `slb_sec_detail` | 转融券交易汇总/明细(停) | 转融券 |
| `slb_len_mm` | 做市借券交易汇总(停) | 做市借券 |

### A6. 参考数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `repurchase` | 股票回购 | 上市公司回购数据 |
| `pledge_stat` / `pledge_detail` | 股权质押统计/明细 | 质押比例/明细 |
| `share_float` | 限售股解禁 | 解禁计划 |
| `block_trade` | 大宗交易 | 大宗交易明细 |
| `stk_holdernumber` | 股东人数 | 股东户数(不定期) |
| `stk_holdertrade` | 股东增减持 | 重要股东增减持 |
| `top10_holders` | 前十大股东 |十大股东 |
| `top10_floatholders` | 前十大流通股东 | 十大流通股东 |
| `stk_account` / `stk_account_old` | 股票开户数据(停/旧) | 开户数统计 |

### A7. 特色数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `cyq_chips` | 每日筹码分布 | 各价位占比(2018 年起) |
| `cyq_perf` | 每日筹码及胜率 | 平均成本/胜率 |
| `hk_hold` | 患深股通持股明细 | 港交所披露 |
| `ccass_hold` / `ccass_hold_detail` | 中央结算系统持股统计/明细 | 全历史 |
| `broker_recommend` | 券商月度金股 | 月度金股 |
| `stk_surv` | 机构调研数据 | 调研记录 |
| `report_rc` | 券商盈利预测数据 | 卖方研报盈利预测 |
| `stk_ah_comparison` | AH 股比价 | A/H 溢价 |
| `stk_factor` | 股票技术面因子(基础版) | MACD/KDJ/RSI/BOLL 等 |
| `stk_factor_pro` | 股票技术面因子(专业版) | 前/后复权多版本 |
| `stk_nineturn` | 神奇九转指标 | TD 序列反转点(2023-01-01 起) |
| `stk_shock` / `stk_high_shock` / `stk_alert` | 异常波动 / 严重异常波动 / 重点提示证券 | 交易所提示 |
| `stock_mx` | 动能因子(小佩数据) | 动量评级 |
| `stock_vx` | 估值因子(小佩数据) | 估值评级 |

### A8. 打板专题 / 板块概念

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `limit_list` | 每日涨跌停统计 | 含封板时间/打开次数 |
| `limit_list_d` | 涨跌停和炸板数据 | 涨停/跌停/炸板(2020 年起) |
| `limit_list_ths` | 同花顺涨跌停榜单 | 涨停/连板/炸板/跌停池 |
| `limit_step` | 涨停连板天梯 | 连板晋级 |
| `limit_cpt_list` | 涨停最强板块统计 | 强势板块轮动 |
| `kpl_list` | 榜单数据(开盘啦) | 涨停/炸板/跌停 |
| `kpl_concept` / `kpl_concept_cons` | 题材及成分(开盘啦) | 概念题材 |
| `dc_index` / `dc_member` / `dc_daily` | 东财概念板块/成分/行情 | 概念/行业/地域 |
| `dc_concept` / `dc_concept_cons` | 东财题材库及成分 | 题材 |
| `dc_hot` | 东方财富 App 热榜 | A 股/ETF/港美股 |
| `ths_index` / `ths_member` / `ths_daily` | 同花顺板块/成分/行情 | 概念/行业/特色指数 |
| `ths_hot` | 同花顺 App 热榜 | 热股/概念/ETF |
| `tdx_index` / `tdx_member` / `tdx_daily` | 通达信板块/成分/行情 | 概念/行业/风格/地域 |
| `cls_index` / `cls_member` / `cls_market_shock` / `cls_stock_shock` | 财联社板块/成分/异动 | 板块及个股异动 |
| `hm_list` / `hm_detail` | 游资名录 / 游资每日明细 | 游资交易(2022-08 起) |
| `jygs_stock_shock` | 韭研公社个股异动 | 异动数据 |
| `top_list` / `top_inst` | 龙虎榜每日/机构统计单 | 龙虎榜 |
| `concept` / `concept_detail` | 概念股分类/明细(ts 源) | ts 概念分类 |

## B. 指数专题

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `index_basic` | 指数基本信息 | 各类指数基础信息 |
| `index_daily` | 指数日线行情 | 单次≤8000 行 |
| `index_weekly` / `index_monthly` | 指数周/月线 | |
| `index_member` / `index_member_all` | 申万行业成分 / 申万成分(分级) | 含三级分类 |
| `index_weight` | 指数成分和权重 | 月度数据 |
| `index_classify` | 申万行业分类 | 2014/2021 版 |
| `index_dailybasic` | 大盘指数每日指标 | 上证综指/深证成指等 PE/PB/市值 |
| `index_global` | 国际主要指数 | 海外指数日线 |
| `sw_daily` | 申万行业指数日行情 | 默认 2021 版 |
| `ci_daily` / `ci_index_member` | 中信行业指数日行情 / 中信行业成分 | |
| `daily_info` / `sz_daily_info` | 沪深/深圳市场每日交易统计 | 板块明细 |
| `idx_mins` | 指数历史分钟 | 1-60min |
| `idx_factor_pro` | 指数技术面因子(专业版) | 大盘/申万/中信 |
| `idx_anns` | 指数公告 | 中证/国证/恒生/华证 |
| `mkt_idx_bmk` | ETF 业绩比较基准 | 基准列表 |
| `rt_idx_k` / `rt_idx_min` | 指数实时日线/分钟 | 实时 |
| `rt_sw_k` | 申万实时行情 | 申万行业最新截面 |

## C. ETF 专题

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `etf_basic` | ETF 基本信息 | 含 QDII |
| `etf_index` | ETF 基准指数 | 基准指数列表 |
| `etf_share_size` | ETF 份额规模 | 每日份额/规模/净值/收盘价 |
| `fund_daily` | ETF 日线行情 | 10 年+ 历史 |
| `fund_adj` | ETF 复权因子 | 复权计算用 |
| `rt_etf_k` | ETF 实时日线 | 通配符批量 |
| `rt_etf_sz_iopv` | 深交所 ETF 实时快照 | 净值/申赎(仅深市) |

## D. 公募基金

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `fund_basic` | 基金列表 | 场内+场外 |
| `fund_nav` | 基金净值 | 单位/累计净值 |
| `fund_div` | 基金分红 | 分红记录 |
| `fund_share` | 基金规模 | 份额数据 |
| `fund_portfolio` | 基金持仓 | 季度更新 |
| `fund_manager` | 基金经理 | 简历 |
| `fund_company` | 基金管理人 | 管理人列表 |
| `fund_factor_pro` | 基金技术面因子(专业版) | 场内基金 |
| `fund_sales_vol` | 销售机构公募基金销售保有规模 | 2021Q1 起,季度 |

## E. 债券专题

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `cb_basic` | 可转债基础信息 | |
| `cb_daily` | 可转债行情 | 含转股价值/溢价率 |
| `cb_issue` | 可转债发行 | |
| `cb_rate` | 可转债票面利率 | |
| `cb_call` | 可转债赎回信息 | 到期/强制赎回 |
| `cb_share` | 可转债转股结果 | |
| `cb_price_chg` | 可转债转股价变动 | |
| `cb_rating` | 可转债债券评级 | 评级历史 |
| `cb_factor_pro` | 可转债技术面因子(专业版) | |
| `top10_cb_holders` | 可转债十大持有人 | |
| `bond_blk` / `bond_blk_detail` | 债券大宗交易 / 明细 | |
| `repo_daily` | 债券回购日行情 | |
| `bc_otcqt` / `bc_bestotcqt` | 柜台债券报价 / 最优报价 | |
| `yc_cb` | 国债收益率曲线 | 即期/到期 |
| `eco_cal` | 全球财经事件 | 财经日历 |

## F. 期权数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `opt_basic` | 期权合约信息 | |
| `opt_daily` | 期权日线行情 | |
| `opt_mins` | 期权分钟行情 | 1-60min |

## G. 期货数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `fut_basic` | 合约信息 | 合约列表 |
| `fut_daily` | 日线行情 | |
| `fut_holding` | 每日持仓排名 | 成交持仓排名 |
| `fut_wsr` | 仓单日报 | 仓库仓单变化 |
| `fut_settle` | 每日结算参数 | 费率/保证金 |
| `fut_mapping` | 期货主力与连续合约 | 主力月合约映射 |
| `fut_weekly_detail` | 期货主要品种交易周报 | 2010-03 起 |
| `fut_weekly_monthly` | 期货周月线行情(每日更新) | |
| `ft_limit` | 期货合约涨跌停价格 | 2005 年起 |
| `ft_mins` | 历史分钟行情 | 1-60min |
| `ft_tick` | TICK 数据 | 期权期货 tick |
| `rt_fut_min` | 实时分钟行情 | 1-60min |

## H. 港股数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `hk_basic` | 港股基础信息 | |
| `hk_daily` | 港股日线行情 | 未复权 |
| `hk_daily_adj` | 港股复权行情 | 含市值/换手 |
| `hk_adjfactor` | 港股复权因子 | |
| `hk_mins` | 港股分钟行情 | 1-60min |
| `hk_tradecal` | 港股交易日历 | |
| `hk_income` / `hk_balancesheet` / `hk_cashflow` | 港股利润表/资产负债表/现金流量表 | |
| `hk_fina_indicator` | 港股财务指标 | 每次≤200 条 |
| `rt_hk_k` / `rt_hk_tick` | 港股实时日线 / 实时行情 | |

## I. 美股数据

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `us_basic` | 美股基础信息 | |
| `us_daily` | 美股日线行情(未复权) | 含市值/PE/PB |
| `us_daily_adj` | 美股复权行情 | |
| `us_adjfactor` | 美股复权因子 | |
| `us_tradecal` | 美股交易日历 | |
| `us_income` / `us_balancesheet` / `us_cashflow` | 美股利润表/资产负债表/现金流量表 | 主要美股+中概股 |
| `us_fina_indicator` | 美股财务指标 | 每次≤200 条 |

## J. 宏观经济 — 国内

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `cn_cpi` | 居民消费价格指数(CPI) | 全国/城/乡 |
| `cn_ppi` | 工业生产者出厂价格指数(PPI) | |
| `cn_gdp` | 国内生产总值(GDP) | |
| `cn_pmi` | 采购经理指数(PMI) | 制造业+非制造业 |
| `cn_m` | 货币供应量(月) | M0/M1/M2 |
| `cn_schedule` | 中国经济数据发布日程 | |
| `sf_month` | 社融增量(月度) | |
| `shibor` | Shibor 利率 | |
| `shibor_lpr` | LPR 贷款基础利率 | |
| `shibor_quote` | Shibor 报价数据 | 各银行报价 |
| `libor` / `hibor` | Libor / Hibor 利率 | |
| `gz_index` / `wz_index` | 广州 / 温州民间借贷利率 | |

## K. 宏观经济 — 国际/美国利率

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `us_tbr` | 美国短期国债利率 | |
| `us_tltr` | 美国国债长期利率 | |
| `us_trltr` | 国债实际长期利率平均值 | |
| `us_trycr` | 国债实际收益率曲线利率 | |
| `us_tycr` | 国债收益率曲线利率 | m1-y30 全曲线 |

## L. 外汇 / 现货

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `fx_obasic` | 外汇基础信息(海外) | FXCM |
| `fx_daily` | 外汇日线行情 | |
| `sge_basic` | 上海黄金基础信息 | |
| `sge_daily` | 上海黄金现货日行情 | |

## M. 大模型语料 / 新闻

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `news` | 新闻快讯(短讯) | 6 年+ 历史 |
| `major_news` | 新闻通讯(长篇) | 8 年+ 历史 |
| `cctv_news` | 新闻联播文字稿 | 2017 年起 |
| `anns_d` | 上市公司公告 | 含 pdf URL |
| `research_report` | 券商研究报告 | 个股/行业,2017-01-01 起 |
| `npr` | 国家政策库 | 法规/条例/通知 |
| `irm_qa_sh` / `irm_qa_sz` | 上证 e 互动 / 深证易互动问答 | 董秘问答文本 |

## N. 行业经济(TMT)

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `bo_daily` / `bo_weekly` / `bo_monthly` | 电影日/周/月度票房 | |
| `bo_cinema` | 影院日度票房 | |
| `film_record` | 电影剧本备案 | |
| `teleplay_record` | 电视剧备案公示 | 2009 年起 |
| `tmt_twincome` / `tmt_twincomedetail` | 台湾电子产业月营收 / 明细 | |

## O. 其他工具

| 接口 | 中文名 | 说明 |
|------|--------|------|
| `p_list` / `p_get` / `p_save` / `p_delete` | 自选股组合 增删改查 | 组合管理 |
| `ncov_global` / `ncov_num` | 全球 / 国内新冠疫情数据 | 另类数据 |

---

# Part 2 — Skill 菜谱(tushare-data)

> Skill 的核心:**不要从接口想起,要从任务模板想起**。先识别任务类型 → 选模板 → 模板决定调哪些接口。

## 2.1 九大工作流模板(菜谱本体)

### 模板 1. 单标的行情分析
**触发**:"看下 XX 最近怎么样""这票最近强不强""今年以来表现如何"
**流程**:解析标的 → 定时间范围 → 取行情+基础指标(daily/daily_basic)→ 总结区间涨跌/活跃度/高低点/波动 → 一句结论+关键数字

### 模板 2. 多标的横向对比
**触发**:"XX 和 YY 谁更强""把这几家公司对比一下"
**流程**:锁定对象 → 统一时间口径 → 选 3-5 个关键指标 → 输出对比表 → "谁在哪方面更强"总结

### 模板 3. 财务质量快照
**触发**:"看下 XX 财报""最近几个季度利润趋势""财务质量怎么样"
**流程**:拉最近 8 季度+最近年度(income/fina_indicator)→ 区分营收/利润/毛利率/ROE/现金流 → 标改善/恶化/波动点 → 说明累计/单季/同比口径

### 模板 4. 估值分析 / 筛选
**触发**:"现在估值高不高""谁更便宜""筛低估值高股息"
**流程**:明确标的池 → 拉 daily_basic 估值 → 必要时联动财务质量 → 输出排序/极值/口径说明

### 模板 5. 资金流追踪
**触发**:"最近资金在买什么""北向最近流向哪里""主力流入最多的是谁"
**流程**:明确资金口径(北向/主力/龙虎榜/板块)→ 定时间窗 → 拉净流入/活跃成交/持续性 → 和价格表现联动解释 → 避免把单日噪声说成趋势

### 模板 6. 板块 / 题材轮动分析
**触发**:"最近哪个板块最强""机器人最近强在哪""某概念有哪些成分股"
**流程**:确定分类口径 → 拉板块区间表现(sw_daily/ths_index/dc_index)→ 联动成分股/资金流/涨停梯队 → 输出强势板块排行+代表标的

### 模板 7. 公告 / 新闻 / 事件梳理
**触发**:"最近有什么公告""有没有什么催化""新闻面怎么样"
**流程**:明确对象和时间窗 → 拉公告/新闻/研报/政策(anns_d/news/research_report/npr)→ 去噪提炼 3-5 条主线 → 区分事实/公告/媒体解读 → 必要时结合股价异动做弱因果

### 模板 8. 数据导出与研究准备
**触发**:"拉一份 CSV""做回测数据表""导出某段行情/财务"
**流程**:明确范围/频率/字段 → 分段策略取数 → 清洗去重统一类型 → 输出 CSV/parquet → 给文件路径+元信息

### 模板 9. 综合研究简报
**触发**:"给我快速研究一下 XX""做个投资者视角简报""先给个全景判断"
**流程**:一句话结论 → 行情表现 → 财务趋势 → 估值水平 → 资金流情况 → 公告/新闻催化 → 风险点 → 值得深挖的问题

## 2.2 核心规则(菜谱的火候)

### 时间默认值(用户没说时的合理口径)
- "最近走势" → 近 20 个交易日
- "这段时间 / 最近一段时间" → 近 3 个月
- "财报 / 业绩" → 最近 8 季度 + 最近年度
- "资金流最近如何" → 近 5-20 个交易日
- "宏观最近如何" → 最近 6-12 期

### 板块口径默认值
- 行业 → 优先申万 / 中信(稳定口径)
- 概念 → 优先同花顺 / 东财(主题口径)
- 结论依赖口径差异时必须说明用了哪种

### 实体解析
- 代码统一为 `600519.SH` / `000001.SZ` 格式
- 默认按 A 股理解,除非明确提港股/美股/基金/债券/期货
- 指数/ETF/个股分开判断,不混用接口
- 重名多解时列候选做最小澄清

### 数据拉取纪律
- **文档先行**:写代码前先确认接口名/必填参数/返回字段/积分限制,别凭记忆硬写字段
- **分段拉取**:日线按年/季度切片,财报按年报期切片,分钟按月/周切片,多标的分批
- **重试**:仅对瞬时错误(网络/超时/429)有限重试;参数错/权限不足不盲重试
- **分段合并后**:去重 + 按主键排序 + 记录失败分段(部分成功不能说"成功完成")

### 输出契约(除非用户只要原始表)
1. 一句话结论
2. 数据范围与口径
3. 关键指标 / 关键表格
4. 异常点 / 风险点 / 解释限制
5. 如有本地输出,给文件路径

**交付形态**:小结果 = Markdown 摘要+简表;中等 = CSV;大规模/回测 = Parquet;可复用流程 = 附 Python 脚本

### 空结果处理(空表 ≠ 失败)
要区分:非交易日 / 区间无数据 / 标的未上市 / 参数错误 / 权限不足。不要一律说"接口坏了"。

## 2.3 推荐最小接口集(80% 常用任务)

```
基础:  stock_basic, trade_cal
行情:  daily, daily_basic, weekly, monthly
财务:  income, fina_indicator, balancesheet, cashflow, forecast, express
资金:  moneyflow, moneyflow_hsgt, hsgt_top10, top_list
指数:  index_basic, index_daily, index_classify, sw_daily
板块:  ths_index, ths_member
打板:  limit_list_d, limit_step
语料:  news, major_news, research_report, anns_d
宏观:  cn_cpi, cn_pmi, us_tycr
```

## 2.4 何时用 Skill vs 直接 MCP

| 场景 | 选择 |
|------|------|
| 查一条明确数据(茅台今天收盘) | 直接 MCP |
| 拉一张原始表(000001.SZ 近 10 天日线) | 直接 MCP |
| 开放式研究(这票最近怎么样) | Skill(走模板 1) |
| 多表对比分析(几家公司谁更强) | Skill(走模板 2) |
| 综合简报(快速研究 XX) | Skill(走模板 9) |
| 数据导出(拉 CSV 做回测) | Skill(走模板 8,带清洗+元信息) |

---

## 参考链接

- Tushare 接口文档:https://tushare.pro/document/2
- Skill 源文件:`C:\Users\Administrator\.claude\skills\tushare-data\SKILL.md`
- 接口分类源:`C:\Users\Administrator\.claude\skills\tushare-data\references\数据接口.md`
