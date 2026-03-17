from functools import lru_cache
from os import getenv

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = getenv("APP_NAME", "optimization-engine")
    app_env: str = getenv("APP_ENV", "development")
    host: str = getenv("HOST", "0.0.0.0")
    port: int = int(getenv("PORT", "8000"))
    log_level: str = getenv("LOG_LEVEL", "info")
    rabbitmq_url: str = getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")


@lru_cache
def get_settings() -> Settings:
    return Settings()
