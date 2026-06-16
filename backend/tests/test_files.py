from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_files_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.txt").write_text("x")
    (tmp_path / "sub").mkdir()
    resp = client.get("/api/files", params={"dir": str(tmp_path)})
    assert resp.status_code == 200
    names = [f["name"] for f in resp.json()]
    assert "a.txt" in names
    assert "sub" in names


def test_list_files_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/files", params={"dir": r"C:\Windows"})
    assert resp.status_code == 403


def test_list_files_dirs_first(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "z.txt").write_text("x")
    (tmp_path / "a_dir").mkdir()
    resp = client.get("/api/files", params={"dir": str(tmp_path)})
    items = resp.json()
    # 目录优先
    assert items[0]["is_dir"] is True
    assert items[0]["name"] == "a_dir"
