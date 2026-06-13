from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_database, create_tables
from routers import sessions, migrate

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
