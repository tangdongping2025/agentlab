from pathlib import Path


def test_agent_sse_nginx_location_has_timeout_and_buffering_off():
    conf = Path(__file__).resolve().parents[2] / "nginx.conf"
    text = conf.read_text(encoding="utf-8")
    start = text.index("location /api/agents")
    block = text[start:text.index("}", start)]

    assert "proxy_buffering off;" in block
    assert "proxy_read_timeout 600s;" in block
    assert "proxy_send_timeout 600s;" in block
