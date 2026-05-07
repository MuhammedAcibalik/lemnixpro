from functools import lru_cache
from os import environ, getenv
from pathlib import Path

from pydantic import BaseModel


def _merge_env_from_file_without_override(env_path: Path) -> None:
    """Loads KEY=value pairs from `.env`; does not overwrite existing OS env vars."""
    if not env_path.is_file():
        return

    try:
        raw = env_path.read_text(encoding="utf-8")
    except OSError:
        return

    for line in raw.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue

        if "=" not in trimmed:
            continue

        eq = trimmed.index("=")
        key = trimmed[:eq].strip()
        value = trimmed[eq + 1 :].strip()
        if (
            (value.startswith('"') and value.endswith('"'))
            or (value.startswith("'") and value.endswith("'"))
        ) and len(value) >= 2:
            value = value[1:-1]

        if key and key not in environ:
            environ[key] = value


ENGINE_ROOT_DIR = Path(__file__).resolve().parents[2]
_merge_env_from_file_without_override(ENGINE_ROOT_DIR / ".env")


class Settings(BaseModel):
    app_name: str = getenv("APP_NAME", "optimization-engine")
    app_env: str = getenv("APP_ENV", "development")
    host: str = getenv("HOST", "0.0.0.0")
    port: int = int(getenv("PORT", "8000"))
    log_level: str = getenv("LOG_LEVEL", "info")
    rabbitmq_url: str = getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672")
    # Blocking consumer runs the full solver inside the message callback, so the I/O
    # loop cannot service heartbeats until work finishes. Use a large value (or 0 to
    # disable) so long CP-SAT runs do not idle out the TCP connection before publish.
    rabbitmq_heartbeat_sec: int = int(getenv("RABBITMQ_HEARTBEAT_SEC", "3600"))
    optimization_request_queue: str = getenv(
        "OPTIMIZATION_REQUEST_QUEUE", "optimization.requests"
    )
    optimization_exchange: str = getenv(
        "OPTIMIZATION_EXCHANGE", "optimization.exchange"
    )
    optimization_requested_routing_key: str = getenv(
        "OPTIMIZATION_REQUESTED_ROUTING_KEY", "optimization.requested"
    )
    optimization_completed_routing_key: str = getenv(
        "OPTIMIZATION_COMPLETED_ROUTING_KEY", "optimization.completed"
    )
    optimization_started_routing_key: str = getenv(
        "OPTIMIZATION_STARTED_ROUTING_KEY", "optimization.started"
    )
    optimization_failed_routing_key: str = getenv(
        "OPTIMIZATION_FAILED_ROUTING_KEY", "optimization.failed"
    )
    rabbitmq_dead_letter_exchange: str = getenv(
        "RABBITMQ_DEAD_LETTER_EXCHANGE", "optimization.dlx"
    )
    rabbitmq_retry_exchange: str = getenv(
        "RABBITMQ_RETRY_EXCHANGE", "optimization.retry.exchange"
    )
    optimization_request_retry_queue: str = getenv(
        "OPTIMIZATION_REQUEST_RETRY_QUEUE", "optimization.requests.retry"
    )
    rabbitmq_retry_delay_ms: int = int(getenv("RABBITMQ_RETRY_DELAY_MS", "30000"))
    optimization_request_dead_letter_queue: str = getenv(
        "OPTIMIZATION_REQUEST_DEAD_LETTER_QUEUE", "optimization.requests.dlq"
    )
    optimization_request_poison_routing_key: str = getenv(
        "OPTIMIZATION_REQUEST_POISON_ROUTING_KEY", "optimization.requested.poison"
    )
    result_service_base_url: str = getenv(
        "RESULT_SERVICE_BASE_URL", "http://localhost:3007"
    )
    optimization_orchestrator_base_url: str = getenv(
        "OPTIMIZATION_ORCHESTRATOR_BASE_URL", "http://localhost:3006"
    )
    internal_service_auth_secret: str = getenv(
        "INTERNAL_SERVICE_AUTH_SECRET", "lemnixpro-local-internal"
    )
    internal_request_timeout_sec: float = float(
        getenv("INTERNAL_REQUEST_TIMEOUT_SEC", "5")
    )
    optimization_request_timeout_sec: int = int(
        getenv("OPTIMIZATION_REQUEST_TIMEOUT_SEC", "60")
    )
    optimization_stale_queue_timeout_sec: int = int(
        getenv("OPTIMIZATION_STALE_QUEUE_TIMEOUT_SEC", "900")
    )
    optimization_worker_concurrency: int = int(
        getenv("OPTIMIZATION_WORKER_CONCURRENCY", "1")
    )
    optimization_progress_interval_sec: int = int(
        getenv("OPTIMIZATION_PROGRESS_INTERVAL_SEC", "10")
    )
    inline_payload_byte_limit: int = int(
        getenv("OPTIMIZATION_INLINE_PAYLOAD_BYTE_LIMIT", "204800")
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
