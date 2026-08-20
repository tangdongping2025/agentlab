import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


def _detect_root_dir() -> str:
    """检测工作目录根路径：Docker 容器内用 /workspace，Windows 用默认路径"""
    # 检测是否在 Docker 容器内（存在 /.dockerenv 或 cgroup 包含 docker）
    try:
        if Path("/.dockerenv").exists():
            return "/workspace"
        cgroup_path = Path("/proc/1/cgroup")
        if cgroup_path.exists():
            if "docker" in cgroup_path.read_text(errors="ignore"):
                return "/workspace"
    except Exception:
        pass  # Windows 下文件不存在，继续
    # Windows 默认路径
    return r"D:\我的个人区间\Projects"


class Settings(BaseSettings):
    mysql_host: str = "localhost"
    mysql_port: int = 3306
    mysql_user: str = "root"
    mysql_password: str = ""
    mysql_database: str = "context_lab"

    # LLM provider 配置(RQ-1)
    llm_api_key: str = ""
    llm_base_url: str = "https://ark.cn-beijing.volces.com/api/coding"
    llm_model: str = "claude-3-5-sonnet-20240620"
    model_config_master_key: str = ""

    # 投资助手 tushare token(RQ-085,读 backend/.env 的 TUSHARE_TOKEN)
    tushare_token: str = ""

    # dsh(DeepSeek Harness) iframe 载入地址(读 backend/.env 的 DSH_IFRAME_URL)
    # 默认本机部署:用户本机跑 dsh web(127.0.0.1:3081),iframe 指向访问者本机
    dsh_iframe_url: str = "http://localhost:3081"

    # 工作目录根约束(claude-sdk agent 工作目录必须在其下)
    # Docker 容器内自动检测为 /workspace，Windows 使用默认路径
    root_dir: str = ""  # 稍后在 __init__ 中初始化

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", protected_namespaces=())

    @property
    def database_url(self) -> str:
        return (
            f"mysql+pymysql://{self.mysql_user}:{self.mysql_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )


settings = Settings()
# 自动检测 root_dir（如果环境变量未设置）
if not settings.root_dir:
    settings.root_dir = _detect_root_dir()
