from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

from config import settings

Base = declarative_base()


def _server_url() -> str:
    """不含 database 名的连接串，用于 CREATE DATABASE。"""
    return (
        f"mysql+pymysql://{settings.mysql_user}:{settings.mysql_password}"
        f"@{settings.mysql_host}:{settings.mysql_port}/?charset=utf8mb4"
    )


def init_database() -> None:
    """连接 MySQL 服务端，CREATE DATABASE IF NOT EXISTS。"""
    engine = create_engine(_server_url())
    with engine.connect() as conn:
        conn.execute(
            text(
                f"CREATE DATABASE IF NOT EXISTS `{settings.mysql_database}` "
                f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        )
        conn.commit()
    engine.dispose()


engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=3600)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables() -> None:
    import models  # noqa: F401  确保 ORM 模型已注册
    Base.metadata.create_all(bind=engine)
