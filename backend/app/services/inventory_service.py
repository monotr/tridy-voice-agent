
from datetime import datetime
from typing import Optional

# NOTE: Replace with real DB calls. This is a stub for demo.
FAKE_DB = {
    "stock": {}  # sku -> qty
}

def _add_stock(sku: str, delta: float):
    FAKE_DB["stock"][sku] = FAKE_DB["stock"].get(sku, 0) + delta

async def registrar_venta(sku: str, qty: float, when: Optional[str] = None, idempotency_key: Optional[str] = None):
    if qty <= 0:
        raise ValueError("qty must be > 0")
    _add_stock(sku, -qty)
    return {"ok": True, "action": "SALE", "sku": sku, "qty": qty, "ts": when or datetime.now().isoformat()}

async def registrar_produccion(sku: str, qty: float, when: Optional[str] = None, idempotency_key: Optional[str] = None):
    if qty <= 0:
        raise ValueError("qty must be > 0")
    _add_stock(sku, qty)
    return {"ok": True, "action": "PRODUCTION", "sku": sku, "qty": qty, "ts": when or datetime.now().isoformat()}

async def subir_producto(name: str, sku: str, price: float = 0.0, category: str = "general"):
    # In real world: insert into products table
    return {"ok": True, "product": {"name": name, "sku": sku, "price": price, "category": category}}

async def consultar_stock(sku: str):
    return {"ok": True, "sku": sku, "qty": FAKE_DB["stock"].get(sku, 0)}
