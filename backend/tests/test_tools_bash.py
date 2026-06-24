import asyncio
import pytest


@pytest.fixture
def root(tmp_path, monkeypatch):
    monkeypatch.setenv("ROOT_DIR", str(tmp_path))
    return tmp_path


def test_echo(root):
    from runtime.tools.bash import BashTool
    out = asyncio.run(BashTool().execute(command="echo hello"))
    assert "hello" in out


def test_redirect_writes_in_workspace(root):
    from runtime.tools.bash import BashTool
    asyncio.run(BashTool().execute(command="echo data > out.txt"))
    assert (root / "out.txt").exists()
    assert "data" in (root / "out.txt").read_text(encoding="utf-8")


def test_empty_command(root):
    from runtime.tools.bash import BashTool
    out = asyncio.run(BashTool().execute(command="   "))
    assert "空" in out


def test_timeout(root):
    from runtime.tools.bash import BashTool
    out = asyncio.run(BashTool().execute(command='python -c "import time;time.sleep(5)"', timeout=1))
    assert "超时" in out
