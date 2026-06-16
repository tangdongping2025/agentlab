import os
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from config import settings

router = APIRouter(prefix="/api/db/files", tags=["files"])

_TEXT_EXTS = {
    ".md", ".txt", ".py", ".js", ".ts", ".jsx", ".tsx", ".json",
    ".yml", ".yaml", ".xml", ".html", ".css", ".csv", ".log", ".sh",
    ".ini", ".conf", ".toml", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".sql",
}
_MAX_READ_BYTES = 1024 * 1024  # 1MB


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
