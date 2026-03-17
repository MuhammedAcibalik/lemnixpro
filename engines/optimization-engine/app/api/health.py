from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
def live() -> dict[str, object]:
    settings = get_settings()
    return {
        "service": settings.app_name,
        "status": "live",
        "checks": ["application-process"],
    }


@router.get("/ready")
def ready() -> dict[str, object]:
    settings = get_settings()
    return {
        "service": settings.app_name,
        "status": "ready",
        "checks": ["configuration-loaded"],
    }
