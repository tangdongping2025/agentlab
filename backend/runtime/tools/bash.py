from __future__ import annotations
import asyncio

from .registry import register_tool
from .file_read import _root

_MAX_OUTPUT = 100_000  # 100KB 截断
_DEFAULT_TIMEOUT = 30


class BashTool:
    name = "Bash"
    description = "执行 shell 命令(在工作目录内)。返回 stdout+stderr 合并。默认超时 30s,超时杀进程。"
    input_schema = {
        "type": "object",
        "properties": {
            "command": {"type": "string", "description": "shell 命令"},
            "timeout": {"type": "number", "description": f"超时秒数(默认 {_DEFAULT_TIMEOUT})"},
        },
        "required": ["command"],
    }

    async def execute(self, **params) -> str:
        command = params.get("command") or ""
        timeout = int(params.get("timeout") or _DEFAULT_TIMEOUT)
        if not command.strip():
            return "命令不能为空"
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(_root()),
            )
        except Exception as e:
            return f"启动失败: {e}"
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return f"命令超时({timeout}s),已终止"
        out = (stdout or b"").decode(errors="replace") + (stderr or b"").decode(errors="replace")
        if len(out) > _MAX_OUTPUT:
            out = out[:_MAX_OUTPUT] + f"\n...(输出已截断,共 {len(out)} 字符)"
        return out.strip() or "(无输出)"


register_tool(BashTool())
