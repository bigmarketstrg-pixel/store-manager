from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum

# ── 사업자 구분 ──────────────────────────────────────
class BusinessType(str, enum.Enum):
    daddam = "다담"
    hula = "훌라"
    oasis = "오아시스"
    other = "이 외"

# ── 사용자 ───────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    name = Column(String(50), nullable=False)
    role = Column(String(20), default="staff")  # admin / staff
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, server_default=func.now())

# ── 상품(재고) ────────────────────────────────────────
class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    business = Column(String(20), nullable=False)       # 사업자 구분
    category = Column(String(100))                       # 대분류
    subcategory = Column(String(100))                    # 중분류
    brand = Column(String(100))                          # 브랜드
    product_code = Column(String(100))                   # 상품코드
    cost_price = Column(Integer, default=0)              # 단가
    sale_price = Column(Integer, default=0)              # 판매가
    stock = Column(Integer, default=0)                   # 재고수량
    note = Column(String(200))                           # 비고
    memo = Column(Text)                                  # 메모
    updated_at = Column(DateTime, onupdate=func.now())

# ── 판매 ─────────────────────────────────────────────
class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True, index=True)
    transaction_no = Column(String(20), nullable=False, index=True)  # 거래번호
    sale_date = Column(Date, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"))
    product_name = Column(String(200))
    business = Column(String(20))
    category = Column(String(100))
    subcategory = Column(String(100))
    brand = Column(String(100))
    cost_price = Column(Integer, default=0)
    sale_price = Column(Integer, nullable=False)
    quantity = Column(Integer, nullable=False)
    total = Column(Integer, nullable=False)
    channel = Column(String(50))       # 판매경로 (매장/쿠팡/네이버 등)
    payment = Column(String(50))       # 결제방식 (현금/카드 등)
    memo = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product")
    user = relationship("User")

# ── 입출기록 ──────────────────────────────────────────
class StockHistory(Base):
    __tablename__ = "stock_history"
    id = Column(Integer, primary_key=True, index=True)
    transaction_no = Column(String(20), index=True)
    record_date = Column(Date, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"))
    product_name = Column(String(200))
    business = Column(String(20))
    category = Column(String(100))
    subcategory = Column(String(100))
    brand = Column(String(100))
    io_type = Column(String(10))   # 입고 / 출고
    quantity = Column(Integer)
    cost_price = Column(Integer, default=0)
    memo = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product")

# ── 견적서 / 납품서 ───────────────────────────────────
class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    doc_type = Column(String(20))       # 견적서 / 납품서 / 거래명세서
    doc_no = Column(String(30), unique=True)
    business = Column(String(20))       # 오아시스 / 훌라
    doc_date = Column(Date)
    recipient = Column(String(100))
    total = Column(Integer, default=0)
    memo = Column(Text)
    items_json = Column(Text)           # JSON 문자열로 품목 저장
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

# ── 택배비 ────────────────────────────────────────────
class Delivery(Base):
    __tablename__ = "deliveries"
    id = Column(Integer, primary_key=True, index=True)
    delivery_date = Column(Date, nullable=False)
    business = Column(String(20), nullable=False)
    recipient = Column(String(100))
    shipping_fee = Column(Integer, default=0)   # 배송료
    memo = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

# ── 인수인계 ──────────────────────────────────────────
class HandoverNote(Base):
    __tablename__ = "handover_notes"
    id = Column(Integer, primary_key=True, index=True)
    note_date = Column(Date, nullable=False)
    business = Column(String(20), nullable=False)
    memo = Column(String(500), nullable=False)
    is_done = Column(Integer, default=0)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
