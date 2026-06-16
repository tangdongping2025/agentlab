"""Windows 启动入口。

uvicorn 默认在 Windows 用 SelectorEventLoop(不支持 asyncio subprocess),
而 claude_agent_sdk 经 subprocess 启动 claude CLI → NotImplementedError →
CLIConnectionError。--reload 的 worker 子进程在 import main 之前就已建好
Selector loop,所以在 main.py 设 policy 无效。

此入口先设 ProactorEventLoop policy,再以单进程(reload=False)启动 uvicorn,
确保 loop 支持 subprocess。代价:开发改动后需手动重启(无热重载)。
"""
import sys

if sys.platform == "win32":
    import asyncio
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000)
