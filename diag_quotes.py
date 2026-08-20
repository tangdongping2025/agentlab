import sys
sys.path.insert(0, "/app/backend")
from config import settings
print("token_set:", bool(settings.tushare_token.strip()))
print("token_len:", len(settings.tushare_token.strip()))
try:
    from routers.watchlist import _tushare_post, _latest_trade_date
    td = _latest_trade_date()
    print("trade_date:", td)
    items = _tushare_post("daily_basic", {"trade_date": td})
    print("daily_basic_count:", len(items))
    if items:
        print("first_keys:", list(items[0].keys())[:8])
        m = next((i for i in items if i.get("ts_code") == "600519.SH"), None)
        print("600519:", m)
except Exception as e:
    print("ERR:", type(e).__name__, str(e)[:400])
