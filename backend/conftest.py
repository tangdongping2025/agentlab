import os

# 所有测试连测试库，避免污染正式库
os.environ["MYSQL_DATABASE"] = "context_lab_test"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

import database
from database import engine, SessionLocal, Base, _server_url
import models  # noqa: F401
from main import app


@pytest.fixture(scope="session", autouse=True)
def _setup_db():
    # 先用不含 database 名的连接串创建测试库
    server_engine = create_engine(_server_url())
    with server_engine.connect() as conn:
        conn.execute(text("CREATE DATABASE IF NOT EXISTS `context_lab_test` CHARACTER SET utf8mb4"))
        conn.commit()
    server_engine.dispose()
    # 用测试库建表
    database.settings.mysql_database = "context_lab_test"
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def db():
    connection = SessionLocal()
    yield connection
    connection.rollback()
    connection.query(models.MessageModel).delete()
    connection.query(models.SessionModel).delete()
    connection.commit()
    connection.close()


@pytest.fixture()
def client():
    return TestClient(app)
