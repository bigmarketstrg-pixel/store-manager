from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.models import Product, StockHistory
from app.auth import get_current_user
from datetime import date

router = APIRouter(prefix="/api/products", tags=["products"])

class ProductCreate(BaseModel):
    name: str
    business: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    product_code: Optional[str] = None
    cost_price: int = 0
    sale_price: int = 0
    stock: int = 0
    note: Optional[str] = None
    memo: Optional[str] = None

class ProductOut(BaseModel):
    id: int
    name: str
    business: str
    category: Optional[str]
    subcategory: Optional[str]
    brand: Optional[str]
    product_code: Optional[str]
    cost_price: int
    sale_price: int
    stock: int
    note: Optional[str]
    memo: Optional[str]
    class Config:
        from_attributes = True

@router.get("", response_model=list[ProductOut])
def list_products(
    q: Optional[str] = Query(None),
    business: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    query = db.query(Product)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    if business:
        query = query.filter(Product.business == business)
    if category:
        query = query.filter(Product.category == category)
    return query.order_by(Product.name).all()

@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")
    return p

@router.post("", response_model=ProductOut)
def create_product(body: ProductCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = Product(**body.dict())
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

@router.patch("/{product_id}", response_model=ProductOut)
def update_product(product_id: int, body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")
    for k, v in body.items():
        if hasattr(p, k):
            setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p

@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")
    db.delete(p)
    db.commit()
    return {"ok": True}

# ── 입고 처리 ──────────────────────────────────────────
class InboundCreate(BaseModel):
    product_id: int
    quantity: int
    cost_price: int = 0
    record_date: date
    memo: Optional[str] = None
    transaction_no: Optional[str] = None

@router.post("/inbound")
def inbound(body: InboundCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    p = db.query(Product).filter(Product.id == body.product_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="상품을 찾을 수 없습니다.")
    p.stock += body.quantity
    if body.cost_price:
        p.cost_price = body.cost_price
    history = StockHistory(
        transaction_no=body.transaction_no or f"IN{body.record_date.strftime('%Y%m%d')}{p.id}",
        record_date=body.record_date,
        product_id=p.id,
        product_name=p.name,
        business=p.business,
        category=p.category,
        subcategory=p.subcategory,
        brand=p.brand,
        io_type="입고",
        quantity=body.quantity,
        cost_price=body.cost_price,
        memo=body.memo,
        created_by=user.id
    )
    db.add(history)
    db.commit()
    return {"ok": True, "new_stock": p.stock}

# ── 입출기록 조회 ──────────────────────────────────────
@router.get("/history/all")
def stock_history(
    business: Optional[str] = None,
    start: Optional[date] = None,
    end: Optional[date] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(StockHistory)
    if business:
        q = q.filter(StockHistory.business == business)
    if start:
        q = q.filter(StockHistory.record_date >= start)
    if end:
        q = q.filter(StockHistory.record_date <= end)
    return q.order_by(StockHistory.record_date.desc()).all()
