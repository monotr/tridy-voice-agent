
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.settings import settings
from app.api.routes_realtime import router as realtime_router
from app.api.routes_inventory import router as inventory_router
from app.api.routes_health import router as health_router

app = FastAPI(title="Tridyland Voice Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.ALLOWED_ORIGINS],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(realtime_router, prefix="/realtime", tags=["realtime"])
app.include_router(inventory_router, prefix="/actions", tags=["actions"])
app.include_router(health_router, tags=["health"])
