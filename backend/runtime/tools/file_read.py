from __future__ import annotations
import os
import re
from pathlib import Path

from config import settings
from skill_settings import SKILL_DIRS
from .registry import register_tool

_MAX_READ = 1024 * 1024  # 1MB 截断


def _root() -> Path:
    """工作目录根(优先 ROOT_DIR 环境变量,回退 settings.root_dir)。"""
    return Path(os.environ.get("ROOT_DIR") or settings.root_dir).resolve()


def _resolve(rel: str) -> Path:
    """解析路径到 ROOT 内;ROOT 内找不到时回退 SKILL_DIRS(读 skill references)。禁止 .. 越狱。"""
    root = _root()
    p = Path(rel)
    target = (root / p).resolve() if not p.is_absolute() else p.resolve()
    in_root = True
    try:
        target.relative_to(root)
    except ValueError:
        in_root = False
    # ROOT 内且存在 → 直接用
    if in_root and target.exists():
        return target
    # 回退 SKILL_DIRS(读 skill references;只读固定白名单路径,不开放任意路径)
    for skill_dir in SKILL_DIRS:
        candidate = (skill_dir / rel).resolve()
        try:
            candidate.relative_to(skill_dir.resolve())
        except ValueError:
            continue
        if candidate.exists():
            return candidate
    # ROOT 内不存在的路径 → 返回让调用方报"文件不存在"(保留原行为);ROOT 外 → 越狱
    if in_root:
        return target
    raise PermissionError(f"路径越界,必须在工作目录或 skill 目录内: {rel}")


class ReadTool:
    name = "Read"
    description = "读取文件内容。file_path 相对工作目录。可选 offset(起始行)/limit(行数)分页。"
    input_schema = {
        "type": "object",
        "properties": {
            "file_path": {"type": "string", "description": "文件路径(相对工作目录)"},
            "offset": {"type": "number", "description": "起始行(0-based,默认 0)"},
            "limit": {"type": "number", "description": "读取行数"},
        },
        "required": ["file_path"],
    }

    async def execute(self, **params) -> str:
        rel = params.get("file_path") or ""
        try:
            p = _resolve(rel)
        except PermissionError as e:
            return str(e)
        if not p.exists():
            return f"文件不存在: {rel}"
        if not p.is_file():
            return f"不是文件: {rel}"
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"读取失败: {e}"
        lines = text.splitlines()
        offset = int(params.get("offset") or 0)
        limit = params.get("limit")
        if offset or limit is not None:
            end = offset + int(limit) if limit is not None else len(lines)
            lines = lines[offset:end]
        out = "\n".join(f"{offset + i + 1:6}\t{ln}" for i, ln in enumerate(lines))
        if len(out) > _MAX_READ:
            out = out[:_MAX_READ] + f"\n...(已截断,文件共 {len(text)} 字符)"
        return out or "(空文件)"


class GlobTool:
    name = "Glob"
    description = "按 glob 模式匹配文件路径(如 '**/*.py')。返回相对工作目录的路径列表。"
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "glob 模式"},
            "path": {"type": "string", "description": "搜索起始目录(相对工作目录,默认根)"},
        },
        "required": ["pattern"],
    }

    async def execute(self, **params) -> str:
        pattern = params.get("pattern") or ""
        try:
            base = _resolve(params.get("path") or ".")
        except PermissionError as e:
            return str(e)
        matches = sorted(
            p.relative_to(_root()).as_posix()
            for p in base.glob(pattern)
            if p.is_file()
        )
        return "\n".join(matches) if matches else f"无匹配: {pattern}"


class GrepTool:
    name = "Grep"
    description = "正则搜索文件内容。返回 文件:行号: 内容。include 文件名过滤(如 '*.py')。"
    input_schema = {
        "type": "object",
        "properties": {
            "pattern": {"type": "string", "description": "正则模式"},
            "path": {"type": "string", "description": "搜索目录(相对工作目录,默认根)"},
            "include": {"type": "string", "description": "文件名 glob 过滤,如 '*.py'"},
        },
        "required": ["pattern"],
    }

    async def execute(self, **params) -> str:
        pattern = params.get("pattern") or ""
        try:
            regex = re.compile(pattern)
        except re.error as e:
            return f"正则错误: {e}"
        try:
            base = _resolve(params.get("path") or ".")
        except PermissionError as e:
            return str(e)
        if not base.is_dir():
            return f"不是目录: {params.get('path')}"
        include = params.get("include") or "*"
        hits: list[str] = []
        for f in base.rglob(include):
            if not f.is_file():
                continue
            try:
                for i, ln in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                    if regex.search(ln):
                        rel = f.relative_to(_root()).as_posix()
                        hits.append(f"{rel}:{i}: {ln[:200]}")
            except Exception:
                continue
            if len(hits) > 200:
                hits.append("...(结果过多,已截断)")
                break
        return "\n".join(hits) if hits else f"无匹配: {pattern}"


register_tool(ReadTool())
register_tool(GlobTool())
register_tool(GrepTool())
