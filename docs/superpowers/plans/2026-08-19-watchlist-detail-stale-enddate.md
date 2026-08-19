# 修复计划:end_date 硬编码 → 动态当天

- Task 1:`backend/tests/test_analyze_end_date.py` 先写失败测试——monkeypatch `analyze.build_daily_panel` 捕获 end_date,断言 `analyze_stock('X', pro=FakePro())` 默认传当天;修复前收到 '20260707' 必失败。
- Task 2:`analyze.py` 修默认值(`end_date=None` + 函数内动态当天,加 `import datetime`);新测试通过 + 相关测试无回归。
- Task 3:更新跟踪矩阵;docker cp analyze.py 上 ECS + `supervisorctl restart uvicorn`,curl 详情 API 验证 `as_of_date` = 最新交易日。
