from dotenv import load_dotenv
load_dotenv()  # 加载 .env 到 os.environ(须在 import agents 触发工具注册前,否则 anysearch 读不到 ANYSEARCH_API_KEY)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import agents  # 触发 agent 注册
from database import init_database, create_tables
from routers import sessions, migrate
from routers.agents import router as agents_router

app = FastAPI(title="Context Lab DB API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_database()
    create_tables()


@app.get("/api/db/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(sessions.router)
app.include_router(migrate.router)
app.include_router(agents_router)
