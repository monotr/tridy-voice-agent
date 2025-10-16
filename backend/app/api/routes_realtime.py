
from fastapi import APIRouter, HTTPException
from app.core.settings import settings
import httpx

router = APIRouter()

@router.post("/token")
async def create_ephemeral_token():
    """
    Genera un token efímero real pidiendo a OpenAI un token de sesión Realtime.
    El front usa este token para abrir la sesión vía WebRTC o WebSocket.
    """
    url = f"{settings.REALTIME_ENDPOINT}/sessions"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {"model": settings.REALTIME_MODEL}

    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.post(url, headers=headers, json=payload)

    if r.status_code != 200:
        raise HTTPException(r.status_code, r.text)

    data = r.json()
    return {
        "model": data.get("model"),
        "endpoint": data.get("url", settings.REALTIME_ENDPOINT),
        "ephemeral_token": data.get("client_secret", {}).get("value"),
    }
