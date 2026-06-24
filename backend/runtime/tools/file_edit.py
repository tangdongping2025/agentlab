from __future__ import annotations

from .registry import register_tool
from .file_read import _resolve


class EditTool:
    name = "Edit"
    description = (
        "编辑文件:用 new_string 替换 old_string。old_string 必须精确匹配;默认必须唯一"
        "(多处则报错提示),replace_all=true 替换全部。new_string 为空即删除。"
    )
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "文件路径(相对工作目录)"},
            "old_string": {"type": "string", "description": "要替换的原文(精确匹配)"},
            "new_string": {"type": "string", "description": "替换为的新文本(可为空=删除)"},
            "replace_all": {"type": "boolean", "description": "替换全部匹配(默认 false)"},
        },
        "required": ["file_path", "old_string", "new_string"],
    }

    async def execute(self, **params) -> str:
        rel = params.get("file_path") or ""
        old = params.get("old_string")
        new = params.get("new_string", "")
        replace_all = bool(params.get("replace_all"))
        try:
            p = _resolve(rel)
        except PermissionError as e:
            return str(e)
        if not p.exists() or not p.is_file():
            return f"文件不存在: {rel}"
        if not old:
            return "old_string 不能为空"
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"读取失败: {e}"
        count = text.count(old)
        if count == 0:
            return "未找到 old_string(文件中不存在该文本)"
        if count > 1 and not replace_all:
            return f"old_string 不唯一(匹配 {count} 处),请提供更长上下文使其唯一,或设 replace_all=true"
        new_text = text.replace(old, new) if replace_all else text.replace(old, new, 1)
        try:
            p.write_text(new_text, encoding="utf-8")
        except Exception as e:
            return f"写入失败: {e}"
        return f"已替换 {count if replace_all else 1} 处"


register_tool(EditTool())
