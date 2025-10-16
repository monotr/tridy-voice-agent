
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.services.inventory_service import registrar_venta, registrar_produccion, subir_producto, consultar_stock

router = APIRouter()

class VentaIn(BaseModel):
    sku: str
    qty: float
    when: Optional[str] = None
    idempotency_key: Optional[str] = None

class ProduccionIn(BaseModel):
    sku: str
    qty: float
    when: Optional[str] = None
    idempotency_key: Optional[str] = None

class ProductoIn(BaseModel):
    name: str
    sku: str
    price: float = 0.0
    category: str = "general"

@router.post("/registrar-venta")
async def registrar_venta_api(body: VentaIn):
    try:
        return await registrar_venta(**body.model_dump())
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/registrar-produccion")
async def registrar_produccion_api(body: ProduccionIn):
    try:
        return await registrar_produccion(**body.model_dump())
    except Exception as e:
        raise HTTPException(400, str(e))

@router.post("/subir-producto")
async def subir_producto_api(body: ProductoIn):
    try:
        return await subir_producto(**body.model_dump())
    except Exception as e:
        raise HTTPException(400, str(e))

@router.get("/consultar-stock")
async def consultar_stock_api(sku: str):
    try:
        return await consultar_stock(sku=sku)
    except Exception as e:
        raise HTTPException(400, str(e))
