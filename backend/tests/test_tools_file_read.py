import asyncio
import pytest


@pytest.fixture
def root(tmp_path, monkeypatch):
    """把 ROOT_DIR 指向临时目录,隔离测试。"""
    monkeypatch.setenv("ROOT_DIR", str(tmp_path))
    return tmp_path


def test_read_basic(root):
    (root / "a.txt").write_text("hello\nworld", encoding="utf-8")
    from runtime.tools.file_read import ReadTool
    out = asyncio.run(ReadTool().execute(file_path="a.txt"))
    assert "hello" in out and "world" in out


def test_read_not_exist(root):
    from runtime.tools.file_read import ReadTool
    out = asyncio.run(ReadTool().execute(file_path="no.txt"))
    assert "不存在" in out


def test_read_path_traversal_rejected(root):
    (root / "a.txt").write_text("ok", encoding="utf-8")
    (root.parent / "_secret.txt").write_text("secret", encoding="utf-8")
    from runtime.tools.file_read import ReadTool
    out = asyncio.run(ReadTool().execute(file_path="../_secret.txt"))
    assert "越界" in out


def test_read_offset_limit(root):
    (root / "a.txt").write_text("L1\nL2\nL3\nL4", encoding="utf-8")
    from runtime.tools.file_read import ReadTool
    out = asyncio.run(ReadTool().execute(file_path="a.txt", offset=1, limit=2))
    assert "L2" in out and "L3" in out and "L4" not in out


def test_glob(root):
    (root / "x.py").write_text("1", encoding="utf-8")
    (root / "y.txt").write_text("2", encoding="utf-8")
    from runtime.tools.file_read import GlobTool
    out = asyncio.run(GlobTool().execute(pattern="*.py"))
    assert "x.py" in out and "y.txt" not in out


def test_grep(root):
    (root / "x.py").write_text("def foo():\n  return 1\nbar = 2", encoding="utf-8")
    from runtime.tools.file_read import GrepTool
    out = asyncio.run(GrepTool().execute(pattern="foo|bar", include="*.py"))
    assert "foo" in out and "bar" in out


def test_grep_no_match(root):
    (root / "x.py").write_text("abc", encoding="utf-8")
    from runtime.tools.file_read import GrepTool
    out = asyncio.run(GrepTool().execute(pattern="zzz", include="*.py"))
    assert "无匹配" in out
