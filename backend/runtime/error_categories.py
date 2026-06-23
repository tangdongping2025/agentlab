from __future__ import annotations

SERVICE_UNAVAILABLE = "service_unavailable"
NETWORK = "network"
BAD_REQUEST = "bad_request"
INTERNAL = "internal"

# 串含这些关键字 → 代理/上游拒绝或账号池(service_unavailable)
_SERVICE_KEYWORDS = (
    "502", "503", "504",
    "no available accounts", "upstream access", "forbidden", "api_error",
)

# 串含这些关键字 → 网络
_NETWORK_KEYWORDS = ("timeout", "connection", "dns", "unreachable", "reset")


def classify(cause) -> str:
    """把异常对象 / HTTP 状态码(int) / 字符串映射到 4 类 category 之一。"""
    # 1) HTTP 状态码
    if isinstance(cause, int):
        if 500 <= cause < 600:
            return SERVICE_UNAVAILABLE
        if 400 <= cause < 500:
            return BAD_REQUEST
        return INTERNAL
    # 2) 异常对象:先按类型名判网络,再看消息关键字
    if isinstance(cause, BaseException):
        exc_name = type(cause).__name__.lower()
        if any(k in exc_name for k in ("timeout", "connect", "connection")):
            return NETWORK
        msg = str(cause).lower()
    elif isinstance(cause, str):
        msg = cause.lower()
    else:
        return INTERNAL
    if any(k in msg for k in _SERVICE_KEYWORDS):
        return SERVICE_UNAVAILABLE
    if any(k in msg for k in _NETWORK_KEYWORDS):
        return NETWORK
    return INTERNAL
