import os
import re
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from config import settings

router = APIRouter(prefix="/api/db/files", tags=["files"])

_TEXT_EXTS = {
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".json",
    ".yml", ".yaml", ".xml", ".html", ".css", ".csv", ".log", ".sh",
    ".ini", ".conf", ".toml", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".sql",
}
_MAX_READ_BYTES = 1024 * 1024  # 1MB
_MARKDOWN_IMAGE_RE = re.compile(r"!\[[^\]]*\]\([^)]*\)|<img\b", re.IGNORECASE)


class ExportDocxRequest(BaseModel):
    cwd: str
    markdown: str


class ExportDocxResponse(BaseModel):
    mdPath: str
    docxPath: str
    downloadUrl: str


@router.get("/root")
def get_root():
    return {"root_dir": settings.root_dir}


def _check_under_root(target_str: str) -> Path:
    root = Path(settings.root_dir).resolve()
    try:
        target = Path(target_str).resolve()
        target.relative_to(root)  # 不在 root 下 → ValueError
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="path must be under root_dir")
    return target


@router.get("")
def list_files(dir: str):
    target = _check_under_root(dir)
    if not target.is_dir():
        raise HTTPException(status_code=400, detail="not a directory")
    items = []
    for entry in os.scandir(target):
        st = entry.stat()
        items.append({
            "name": entry.name,
            "mtime": int(st.st_mtime),
            "size": st.st_size,
            "is_dir": entry.is_dir(),
        })
    items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return items


@router.get("/read")
def read_file(path: str):
    target = _check_under_root(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="not a file")
    if target.suffix.lower() not in _TEXT_EXTS:
        raise HTTPException(status_code=400, detail="file type not supported for preview")
    size = target.stat().st_size
    if size > _MAX_READ_BYTES:
        raise HTTPException(status_code=400, detail="file too large (>1MB)")
    content = target.read_text(encoding="utf-8", errors="replace")
    return {"name": target.name, "size": size, "content": content}


@router.get("/download")
def download_file(path: str):
    target = _check_under_root(path)
    if not target.is_file():
        raise HTTPException(status_code=400, detail="not a file")
    return FileResponse(str(target), filename=target.name)


@router.post("/export-docx", response_model=ExportDocxResponse)
def export_docx(payload: ExportDocxRequest):
    cwd = _check_under_root(payload.cwd)
    if not cwd.is_dir():
        raise HTTPException(status_code=400, detail="cwd must be a directory")

    if len(payload.markdown.encode("utf-8")) > _MAX_READ_BYTES:
        raise HTTPException(status_code=400, detail="markdown too large (>1MB)")
    if _MARKDOWN_IMAGE_RE.search(payload.markdown):
        raise HTTPException(status_code=400, detail="markdown images are not supported")

    if shutil.which("pandoc") is None:
        raise HTTPException(status_code=500, detail="服务器未安装 pandoc")

    export_dir = cwd / "exports"
    if export_dir.is_symlink():
        raise HTTPException(status_code=403, detail="path must be under root_dir")
    export_dir.mkdir(exist_ok=True)
    if export_dir.is_symlink():
        raise HTTPException(status_code=403, detail="path must be under root_dir")
    export_dir = _check_under_root(str(export_dir))

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    md_path = export_dir / f"assistant-card-{stamp}.md"
    docx_path = export_dir / f"assistant-card-{stamp}.docx"
    _check_under_root(str(md_path))
    _check_under_root(str(docx_path))
    md_path.write_text(payload.markdown, encoding="utf-8")

    try:
        result = subprocess.run(
            ["pandoc", str(md_path), "-o", str(docx_path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="Word 导出失败")
    if result.returncode != 0:
        raise HTTPException(status_code=500, detail="Word 导出失败")
    _check_under_root(str(md_path))
    docx_path = _check_under_root(str(docx_path))
    if not docx_path.is_file():
        raise HTTPException(status_code=500, detail="Word 导出失败")

    return ExportDocxResponse(
        mdPath=str(md_path),
        docxPath=str(docx_path),
        downloadUrl=f"/api/db/files/download?path={quote(str(docx_path))}",
    )
