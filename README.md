
# Tridyland Voice Agent (Realtime GPT) — Template

Plantilla mínima con **FastAPI (backend)** + **Next.js (frontend)** para probar GPT-4o Realtime.

## Requisitos
- Docker + docker-compose
- Una API key de OpenAI con acceso a Realtime (4o-mini-realtime o 4o-realtime).

## Variables
Crea `backend/.env` basándote en `.env.example`:
```env
OPENAI_API_KEY=sk-xxx
REALTIME_MODEL=gpt-4o-mini-realtime-preview
REALTIME_ENDPOINT=https://api.openai.com/v1/realtime
ALLOWED_ORIGINS=["http://localhost:3000"]
```
Crea `frontend/.env.local`:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

## Correr
```bash
docker-compose up --build
```
- Frontend: http://localhost:3000
- Backend:  http://localhost:8000/health

## Importante sobre el token efímero
El endpoint `/realtime/token` es **placeholder**. Debes implementar el flujo oficial de **tokens efímeros** / **proxy** para no exponer tu API key en el front. Mantén la lógica en el backend.

## Endpoints de acciones (demo)
- `POST /actions/registrar-venta` {sku, qty, when?, idempotency_key?}
- `POST /actions/registrar-produccion` {sku, qty, when?, idempotency_key?}
- `POST /actions/subir-producto` {name, sku, price, category}
- `GET  /actions/consultar-stock?sku=...`

> La capa `inventory_service.py` actualmente usa una DB en memoria. Reemplázala por tu persistencia real.

## Roadmap
- Reemplazar token efímero por implementación oficial (JWT corto / exchange con OpenAI).
- Agregar definición de herramientas en el prompt y manejo de tool-calls.
- Persistencia real (Postgres) y auth por roles.
