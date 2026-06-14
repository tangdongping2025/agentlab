"""agents 实现层(L3)。导入此包触发各 agent 注册。"""
from . import echo_agent  # noqa: F401  触发 @register_agent
from . import assistant_agent  # noqa: F401
from . import research_agent  # noqa: F401
from . import principle_explorer_agent  # noqa: F401
