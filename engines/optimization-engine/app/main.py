import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.health import router as health_router
from app.core.config import get_settings
from app.worker.consumer import RabbitMqOptimizationConsumer

settings = get_settings()


def resolve_log_level(log_level: str) -> int:
    return getattr(logging, log_level.upper(), logging.INFO)


logging.basicConfig(level=resolve_log_level(settings.log_level))
optimization_consumer = RabbitMqOptimizationConsumer(settings=settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    consumer_thread = optimization_consumer.start_in_background()

    try:
        yield
    finally:
        optimization_consumer.stop()
        consumer_thread.join(timeout=5)


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Optimization engine scaffold for LemnixPRO.",
    lifespan=lifespan,
)

app.include_router(health_router)
