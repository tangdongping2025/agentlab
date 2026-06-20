from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_list_files_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.txt").write_text("x")
    (tmp_path / "sub").mkdir()
    resp = client.get("/api/db/files", params={"dir": str(tmp_path)})
    assert resp.status_code == 200
    names = [f["name"] for f in resp.json()]
    assert "a.txt" in names
    assert "sub" in names


def test_list_files_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/db/files", params={"dir": r"C:\Windows"})
    assert resp.status_code == 403


def test_list_files_dirs_first(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "z.txt").write_text("x")
    (tmp_path / "a_dir").mkdir()
    resp = client.get("/api/db/files", params={"dir": str(tmp_path)})
    items = resp.json()
    # 目录优先
    assert items[0]["is_dir"] is True
    assert items[0]["name"] == "a_dir"


def test_read_file_text_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.py").write_text("print('hi')", encoding="utf-8")
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "a.py")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "a.py"
    assert body["content"] == "print('hi')"


def test_read_file_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/db/files/read", params={"path": r"C:\Windows\win.ini"})
    assert resp.status_code == 403


def test_read_file_non_text_rejected(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.docx").write_bytes(b"PK\x03\x04")
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "a.docx")})
    assert resp.status_code == 400


def test_read_file_too_large_rejected(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "big.txt").write_bytes(b"x" * (1024 * 1024 + 1))
    resp = client.get("/api/db/files/read", params={"path": str(tmp_path / "big.txt")})
    assert resp.status_code == 400


def test_download_file_within_root(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    (tmp_path / "a.docx").write_bytes(b"PK\x03\x04DOCX")
    resp = client.get("/api/db/files/download", params={"path": str(tmp_path / "a.docx")})
    assert resp.status_code == 200
    assert "a.docx" in resp.headers.get("content-disposition", "")


def test_download_file_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings
    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    resp = client.get("/api/db/files/download", params={"path": r"C:\Windows\win.ini"})
    assert resp.status_code == 403


def test_export_docx_writes_markdown_and_returns_download_url(tmp_path, monkeypatch):
    from config import settings
    from urllib.parse import quote

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    cwd = tmp_path / "project"
    cwd.mkdir()

    def fake_run(cmd, check, capture_output, text):
        assert cmd == [
            "pandoc",
            str(cwd / "exports" / "assistant-card-20260620-094500.md"),
            "-o",
            str(cwd / "exports" / "assistant-card-20260620-094500.docx"),
        ]
        assert check is False
        assert capture_output is True
        assert text is True
        (cwd / "exports" / "assistant-card-20260620-094500.docx").write_bytes(b"PK\x03\x04DOCX")

        class Result:
            returncode = 0
            stderr = ""

        return Result()

    monkeypatch.setattr("routers.files.datetime", type("FixedDatetime", (), {
        "now": staticmethod(lambda: type("FixedNow", (), {"strftime": lambda self, fmt: "20260620-094500"})())
    }), raising=False)
    monkeypatch.setattr("routers.files.shutil.which", lambda name: "/usr/bin/pandoc")
    monkeypatch.setattr("routers.files.subprocess.run", fake_run)

    markdown = "| 维度 | 说明 |\n|---|---|\n| A | B |"
    resp = client.post("/api/db/files/export-docx", json={
        "cwd": str(cwd),
        "markdown": markdown,
    })

    assert resp.status_code == 200
    body = resp.json()
    md_path = cwd / "exports" / "assistant-card-20260620-094500.md"
    docx_path = cwd / "exports" / "assistant-card-20260620-094500.docx"
    assert body["mdPath"] == str(md_path)
    assert body["docxPath"] == str(docx_path)
    assert body["downloadUrl"] == f"/api/db/files/download?path={quote(str(docx_path))}"
    assert md_path.read_text(encoding="utf-8") == markdown


def test_export_docx_outside_root_forbidden(tmp_path, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))

    resp = client.post("/api/db/files/export-docx", json={
        "cwd": r"C:\Windows",
        "markdown": "# Hello",
    })

    assert resp.status_code == 403


def test_export_docx_missing_pandoc_returns_exact_error(tmp_path, monkeypatch):
    from config import settings

    monkeypatch.setattr(settings, "root_dir", str(tmp_path))
    cwd = tmp_path / "project"
    cwd.mkdir()
    monkeypatch.setattr("routers.files.shutil.which", lambda name: None)

    resp = client.post("/api/db/files/export-docx", json={
        "cwd": str(cwd),
        "markdown": "# Hello",
    })

    assert resp.status_code == 500
    assert resp.json()["detail"] == "服务器未安装 pandoc"
