from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db import Base

# Tabla intermedia para la relación muchos-a-muchos entre productos y etiquetas
producto_etiquetas = Table(
    "producto_etiquetas",
    Base.metadata,
    Column("producto_id", Integer, ForeignKey("productos.id")),
    Column("etiqueta_id", Integer, ForeignKey("etiquetas.id"))
)


class ProductoTipo(Base):
    __tablename__ = "producto_tipos"

    id = Column(Integer, primary_key=True)
    nombre = Column(String, unique=True, nullable=False)
    descripcion = Column(String)

    productos = relationship("Product", back_populates="tipo")


class Etiqueta(Base):
    __tablename__ = "etiquetas"

    id = Column(Integer, primary_key=True)
    nombre = Column(String, unique=True, nullable=False)

    productos = relationship(
        "Product",
        secondary=producto_etiquetas,
        back_populates="etiquetas"
    )


class Product(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    tipo_id = Column(Integer, ForeignKey("producto_tipos.id"))

    descripcion = Column(String)
    cantidad = Column(Integer, default=0)
    stock_alerta = Column(Integer, default=0)  # Notificar si baja de este valor
    precio_unitario = Column(Float, default=0.0)
    tiempo_impresion = Column(Float, default=0.0)  # En minutos
    costo_produccion = Column(Float, default=0.0)
    gramos = Column(Integer, default=0)  # gramos usados por pieza
    foto_url = Column(String)
    notas = Column(String)

    fecha_creacion = Column(DateTime, default=func.now())

    tipo = relationship("ProductoTipo", back_populates="productos")
    etiquetas = relationship(
        "Etiqueta",
        secondary=producto_etiquetas,
        back_populates="productos"
    )

    historial = relationship("HistorialInventario", back_populates="producto")

