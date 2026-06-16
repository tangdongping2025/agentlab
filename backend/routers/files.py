import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import settings

router = APIRouter(prefix="/api/db/files", tags=["files"])


@router.get("")
def list_files(dir: str):
    root = Path(settings.root_dir).resolve()
    try:
        target = Path(dir).resolve()
        target.relative_to(root)  # 不在 root 下 → ValueError
    except (ValueError, OSError):
        raise HTTPException(status_code=403, detail="dir must be under root_dir")
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
