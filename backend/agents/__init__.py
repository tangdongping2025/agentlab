"""agents 实现层(L3)。导入此包触发各 agent 注册。"""
from runtime import claude_sdk_agent  # noqa: F401  RQ-7:第二种 agent 范式
from . import assistant_agent  # noqa: F401
from . import research_agent  # noqa: F401
from . import invest_agent  # noqa: F401  龙虾·原生版·投资助手(封闭域)
