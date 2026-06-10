from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.models import Product, StockHistory
from app.auth import get_current_user
from datetime import date
import os
import sqlite3
import tempfile

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

class ImportResult(BaseModel):
    total: int
    created: int
    updated: int
    skipped: int

@router.get("", response_model=list[ProductOut])
def list_products(
    q: Optional[str] = Query(None),
    business: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    cost_min: Optional[int] = Query(None),
    cost_max: Optional[int] = Query(None),
    sale_min: Optional[int] = Query(None),
    sale_max: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    query = db.query(Product)
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))
    if business:
        query = query.filter(Product.business == business)
    if category:
        query = query.filter(Product.category.ilike(f"%{category}%"))
    if subcategory:
        query = query.filter(Product.subcategory.ilike(f"%{subcategory}%"))
    if brand:
        query = query.filter(Product.brand.ilike(f"%{brand}%"))
    if cost_min is not None:
        query = query.filter(Product.cost_price >= cost_min)
    if cost_max is not None:
        query = query.filter(Product.cost_price <= cost_max)
    if sale_min is not None:
        query = query.filter(Product.sale_price >= sale_min)
    if sale_max is not None:
        query = query.filter(Product.sale_price <= sale_max)
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

def to_int(value) -> int:
    if value in (None, ""):
        return 0
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return 0

def clean_text(value, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text or fallback

def clean_business(value) -> str:
    text = clean_text(value, "이 외")
    return text if text in {"다담", "훌라", "오아시스", "이 외"} else "이 외"

@router.post("/import-db", response_model=ImportResult)
async def import_products_from_db(
    file: UploadFile = File(...),
    update_existing: bool = Form(True),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    if not file.filename.lower().endswith((".db", ".sqlite", ".sqlite3")):
        raise HTTPException(status_code=400, detail="SQLite DB 파일만 업로드할 수 있습니다.")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            tmp.write(await file.read())
            tmp_path = tmp.name

        source = sqlite3.connect(tmp_path)
        source.row_factory = sqlite3.Row
        try:
            has_inventory = source.execute(
                "select 1 from sqlite_master where type='table' and name='inventory'"
            ).fetchone()
            if not has_inventory:
                raise HTTPException(status_code=400, detail="inventory 테이블을 찾을 수 없습니다.")

            rows = source.execute("select * from inventory").fetchall()
        finally:
            source.close()

        total = len(rows)
        created = updated = skipped = 0

        for row in rows:
            data = dict(row)
            name = clean_text(data.get("상품명"))
            if not name:
                skipped += 1
                continue

            business = clean_business(data.get("사업자"))
            payload = {
                "name": name,
                "business": business,
                "category": clean_text(data.get("대분류"), None),
                "subcategory": clean_text(data.get("중분류"), None),
                "brand": clean_text(data.get("브랜드"), None),
                "cost_price": to_int(data.get("단가")),
                "sale_price": to_int(data.get("판매가")),
                "stock": to_int(data.get("수량")),
            }

            existing = db.query(Product).filter(
                Product.name == name,
                Product.business == business
            ).first()

            if existing:
                if update_existing:
                    for key, value in payload.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    skipped += 1
            else:
                db.add(Product(**payload))
                created += 1

        db.commit()
        return ImportResult(total=total, created=created, updated=updated, skipped=skipped)
    except HTTPException:
        db.rollback()
        raise
    except sqlite3.DatabaseError:
        db.rollback()
        raise HTTPException(status_code=400, detail="DB 파일을 읽을 수 없습니다.")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)

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
