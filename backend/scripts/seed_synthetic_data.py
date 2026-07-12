"""合成数据底座:无 tushare 也能让 ML 候选池/回测端到端跑通。幂等(delete + insert)。
run: cd backend && python scripts/seed_synthetic_data.py
或:  docker exec -it <backend容器名> python scripts/seed_synthetic_data.py

IC 数值无现实意义(纯随机数据),只证明 ML 链路通。
"""
from __future__ import annotations
import sys
from datetime import datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))          # scripts/
sys.path.insert(0, str(HERE.parent))   # backend/ → config/database/models

import models  # noqa: E402


def _trade_dates(start: str, end: str) -> list[str]:
    """工作日序列(跳周末;不跳节假日,合成数据够用)。"""
    s = datetime.strptime(start, "%Y%m%d")
    e = datetime.strptime(end, "%Y%m%d")
    out, d = [], s
    while d <= e:
        if d.weekday() < 5:
            out.append(d.strftime("%Y%m%d"))
        d += timedelta(days=1)
    return out


def seed_all(db, n_codes: int = 30, years: int = 3,
             index_code: str = "000300.SH", start: str = "20200101",
             seed: int = 42) -> dict:
    """造 n_codes 只股票 × years 年合成数据,灌进三张表。幂等:先 delete 再 insert。

    返回 {index_constituent, stock_daily, fundamental_pit} 行数。
    """
    import random
    from sqlalchemy.orm import Session
    assert isinstance(db, Session)
    rng = random.Random(seed)
    end = (datetime.strptime(start, "%Y%m%d") + timedelta(days=365 * years)).strftime("%Y%m%d")
    dates = _trade_dates(start, end)
    codes = [f"{600000 + i:06d}.SH" for i in range(n_codes)]
    counts = {"index_constituent": 0, "stock_daily": 0, "fundamental_pit": 0}

    # 1) index_constituent:单一快照 trade_date=start,等权
    db.query(models.IndexConstituentModel).delete()
    w = round(1.0 / n_codes, 4)
    for c in codes:
        db.add(models.IndexConstituentModel(index_code=index_code, trade_date=start, code=c, weight=w))
    counts["index_constituent"] = n_codes

    # 2) stock_daily:每股 random-walk close + adj_factor=1 + 随机 pe_ttm/total_mv
    db.query(models.StockDailyModel).delete()
    for c in codes:
        price = rng.uniform(5, 50)
        shares = rng.randint(1, 50)  # 亿股(固定,让 total_mv 随 price 走)
        for dt in dates:
            price = max(1.0, price * (1 + rng.gauss(0, 0.02)))
            db.add(models.StockDailyModel(
                code=c, trade_date=dt,
                close=round(price, 2),
                adj_factor=1.0,
                pe_ttm=round(rng.uniform(5, 60), 2),
                total_mv=round(price * shares, 2),
            ))
    counts["stock_daily"] = n_codes * len(dates)

    # 3) fundamental_pit:每股每年一份"年报",end_date=YYYY1231,ann_date=次年0331(严格 PIT)
    db.query(models.FundamentalPitModel).delete()
    sy, ey = int(start[:4]), int(end[:4])
    for c in codes:
        for y in range(sy, ey + 1):
            db.add(models.FundamentalPitModel(
                code=c, end_date=f"{y}1231", ann_date=f"{y + 1}0331",
                roe=round(rng.uniform(2, 25), 2),
                grossprofit_margin=round(rng.uniform(10, 60), 2),
                debt_to_assets=round(rng.uniform(20, 70), 2),
            ))
    counts["fundamental_pit"] = n_codes * (ey - sy + 1)

    db.commit()
    return counts


if __name__ == "__main__":
    from database import SessionLocal
    db = SessionLocal()
    try:
        c = seed_all(db)
        print(f"[done] seed_synthetic: {c}")
    finally:
        db.close()
