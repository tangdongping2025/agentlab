import pytest

from runtime.tools import file_read


def test_resolve_falls_back_to_skill_dirs(monkeypatch, tmp_path):
    """路径不在 ROOT 内但在 SKILL_DIRS 内时,回退解析成功。"""
    skill_dir = tmp_path / "skills" / "demo"
    skill_dir.mkdir(parents=True)
    ref = skill_dir / "接口.md"
    ref.write_text("# 接口文档", encoding="utf-8")

    (tmp_path / "workspace").mkdir()  # ROOT 存在但无此文件
    monkeypatch.setattr(file_read, "_root", lambda: (tmp_path / "workspace").resolve())
    monkeypatch.setattr(file_read, "SKILL_DIRS", [skill_dir.parent])

    resolved = file_read._resolve("demo/接口.md")
    assert resolved == ref.resolve()


def test_resolve_still_blocks_jailbreak(monkeypatch, tmp_path):
    """ROOT 和 SKILL_DIRS 之外的路径仍被拦截。"""
    (tmp_path / "workspace").mkdir()
    monkeypatch.setattr(file_read, "_root", lambda: (tmp_path / "workspace").resolve())
    monkeypatch.setattr(file_read, "SKILL_DIRS", [tmp_path / "skills"])
    with pytest.raises(PermissionError):
        file_read._resolve("../../etc/passwd")


def test_resolve_root_internal_unchanged(monkeypatch, tmp_path):
    """ROOT 内正常文件解析行为不变。"""
    ws = tmp_path / "workspace"
    ws.mkdir()
    f = ws / "a.txt"
    f.write_text("hi", encoding="utf-8")
    monkeypatch.setattr(file_read, "_root", lambda: ws.resolve())
    monkeypatch.setattr(file_read, "SKILL_DIRS", [tmp_path / "skills"])
    assert file_read._resolve("a.txt") == f.resolve()
