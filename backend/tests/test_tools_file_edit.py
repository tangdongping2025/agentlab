import asyncio
import pytest


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("ROOT_DIR", str(tmp_path))
    return tmp_path


def test_replace_unique(root):
    (root / "a.txt").write_text("foo bar baz", encoding="utf-8")
    from runtime.tools.file_edit import EditTool
    out = asyncio.run(EditTool().execute(file_path="a.txt", old_string="bar", new_string="BAR"))
    assert "已替换 1 处" in out
    assert (root / "a.txt").read_text(encoding="utf-8") == "foo BAR baz"


def test_replace_all(root):
    (root / "a.txt").write_text("a a a", encoding="utf-8")
    from runtime.tools.file_edit import EditTool
    out = asyncio.run(EditTool().execute(file_path="a.txt", old_string="a", new_string="b", replace_all=True))
    assert "已替换 3 处" in out
    assert (root / "a.txt").read_text(encoding="utf-8") == "b b b"


def test_not_unique_error(root):
    (root / "a.txt").write_text("x x x", encoding="utf-8")
    from runtime.tools.file_edit import EditTool
    out = asyncio.run(EditTool().execute(file_path="a.txt", old_string="x", new_string="y"))
    assert "不唯一" in out
    assert (root / "a.txt").read_text(encoding="utf-8") == "x x x"  # 未改动


def test_not_found(root):
    (root / "a.txt").write_text("hello", encoding="utf-8")
    from runtime.tools.file_edit import EditTool
    out = asyncio.run(EditTool().execute(file_path="a.txt", old_string="zzz", new_string="y"))
    assert "未找到" in out


def test_file_not_exist(root):
    from runtime.tools.file_edit import EditTool
    out = asyncio.run(EditTool().execute(file_path="no.txt", old_string="a", new_string="b"))
    assert "不存在" in out


def test_delete_via_empty_new(root):
    (root / "a.txt").write_text("foo DEL bar", encoding="utf-8")
    from runtime.tools.file_edit import EditTool
    asyncio.run(EditTool().execute(file_path="a.txt", old_string="DEL ", new_string=""))
    assert (root / "a.txt").read_text(encoding="utf-8") == "foo bar"
