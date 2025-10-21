from datetime import datetime
import enum
from uuid import uuid4

from sqlalchemy import Column, DateTime, Enum as SQLAlchemyEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from app.db import Base

class TipoMovimientoInventario(enum.Enum):
    creacion    = "creacion"
    produccion  = "produccion"
    venta       = "venta"
    ajuste      = "ajuste"
    donacion    = "donacion"
    devolucion  = "devolucion"

class HistorialInventario(Base):
    __tablename__ = "historial_inventario"

    id          = Column(String, primary_key=True, default=lambda: str(uuid4()))
    producto_id = Column(ForeignKey("productos.id"), nullable=False)
    tipo        = Column(SQLAlchemyEnum(TipoMovimientoInventario), nullable=False)
    cantidad    = Column(Integer, nullable=False)
    fecha       = Column(DateTime, default=datetime.utcnow)
    notas       = Column(Text, nullable=True)

    producto    = relationship("Product", back_populates="historial")