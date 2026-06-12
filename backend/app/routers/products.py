from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.models.models import Product, StockHistory
from app.auth import get_current_user, require_admin
from datetime import date, datetime
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
    deleted: int = 0

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
    replace_all: bool = Form(False),
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
        created = updated = skipped = deleted = 0

        if replace_all:
            try:
                deleted = db.query(Product).delete(synchronize_session=False)
                db.flush()
            except IntegrityError:
                db.rollback()
                raise HTTPException(
                    status_code=400,
                    detail="판매/입출고 기록이 연결된 상품이 있어 전체 교체를 할 수 없습니다. 기존 유지 가져오기를 사용하거나 기록 정리가 필요합니다."
                )

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
        return ImportResult(total=total, created=created, updated=updated, skipped=skipped, deleted=deleted)
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
def delete_product(product_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
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

class BulkInboundItem(BaseModel):
    category: Optional[str] = None
    subcategory: Optional[str] = None
    brand: Optional[str] = None
    product_name: str
    quantity: int
    cost_price: int = 0
    sale_price: int = 0
    amount: Optional[int] = None

class BulkInboundCreate(BaseModel):
    record_date: date
    supplier_name: str
    business: str = "다담"
    total_amount: int = 0
    memo: Optional[str] = None
    transaction_no: Optional[str] = None
    items: list[BulkInboundItem]

class BulkOutboundItem(BaseModel):
    product_id: int
    quantity: int

class BulkOutboundCreate(BaseModel):
    record_date: date
    reason: str
    memo: Optional[str] = None
    transaction_no: Optional[str] = None
    items: list[BulkOutboundItem]

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

@router.post("/inbound-bulk")
def inbound_bulk(body: BulkInboundCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="입고할 품목을 입력해주세요.")

    transaction_no = body.transaction_no or f"IN{datetime.now().strftime('%Y%m%d%H%M%S')}"
    created_count = 0
    updated_count = 0
    total_quantity = 0

    for item in body.items:
        name = clean_text(item.product_name)
        if not name or item.quantity <= 0:
            continue

        business = clean_business(body.business)
        query = db.query(Product).filter(Product.name == name, Product.business == business)
        brand = clean_text(item.brand, None)
        if brand:
            query = query.filter(Product.brand == brand)
        product = query.order_by(Product.id.asc()).first()

        if not product:
            product = Product(
                name=name,
                business=business,
                category=clean_text(item.category, None),
                subcategory=clean_text(item.subcategory, None),
                brand=brand,
                cost_price=item.cost_price or 0,
                sale_price=item.sale_price or 0,
                stock=0,
            )
            db.add(product)
            db.flush()
            created_count += 1
        else:
            updated_count += 1

        product.stock += item.quantity
        if item.category:
            product.category = item.category
        if item.subcategory:
            product.subcategory = item.subcategory
        if brand:
            product.brand = brand
        if item.cost_price:
            product.cost_price = item.cost_price
        if item.sale_price:
            product.sale_price = item.sale_price

        amount = item.amount if item.amount is not None else (item.quantity * (item.cost_price or 0))
        memo_parts = [f"상호명: {body.supplier_name}", f"금액: {amount}", f"총액: {body.total_amount}"]
        if body.memo:
            memo_parts.append(body.memo)

        history = StockHistory(
            transaction_no=transaction_no,
            record_date=body.record_date,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            io_type="입고",
            quantity=item.quantity,
            cost_price=item.cost_price,
            memo=" / ".join(memo_parts),
            created_by=user.id
        )
        db.add(history)
        total_quantity += item.quantity

    if total_quantity == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="입고할 수량이 있는 품목을 입력해주세요.")

    db.commit()
    return {
        "ok": True,
        "transaction_no": transaction_no,
        "created": created_count,
        "updated": updated_count,
        "quantity": total_quantity,
    }

@router.post("/outbound-bulk")
def outbound_bulk(body: BulkOutboundCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not body.items:
        raise HTTPException(status_code=400, detail="출고할 품목을 입력해주세요.")

    reason = clean_text(body.reason)
    if not reason:
        raise HTTPException(status_code=400, detail="출고 사유를 입력해주세요.")

    transaction_no = body.transaction_no or f"OUT{datetime.now().strftime('%Y%m%d%H%M%S')}"
    total_quantity = 0

    for item in body.items:
        if item.quantity <= 0:
            continue

        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"상품 ID {item.product_id}를 찾을 수 없습니다.")
        if product.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"{product.name} 재고 부족 (현재: {product.stock}개)")

        product.stock -= item.quantity
        memo_parts = [f"출고사유: {reason}"]
        if body.memo:
            memo_parts.append(body.memo)

        history = StockHistory(
            transaction_no=transaction_no,
            record_date=body.record_date,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            io_type="출고",
            quantity=item.quantity,
            cost_price=product.cost_price,
            memo=" / ".join(memo_parts),
            created_by=user.id
        )
        db.add(history)
        total_quantity += item.quantity

    if total_quantity == 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="출고할 수량이 있는 품목을 입력해주세요.")

    db.commit()
    return {"ok": True, "transaction_no": transaction_no, "quantity": total_quantity}

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

@router.patch("/history/{history_id}")
def update_stock_history(history_id: int, body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    history = db.query(StockHistory).filter(StockHistory.id == history_id).first()
    if not history:
        raise HTTPException(status_code=404, detail="입출기록을 찾을 수 없습니다.")

    old_io_type = history.io_type
    old_quantity = history.quantity or 0
    next_io_type = body.get("io_type", old_io_type)
    next_quantity = int(body.get("quantity", old_quantity) or 0)
    if next_quantity < 0:
        raise HTTPException(status_code=400, detail="수량은 0보다 작을 수 없습니다.")
    if next_io_type not in ("입고", "출고"):
        raise HTTPException(status_code=400, detail="구분은 입고 또는 출고만 가능합니다.")

    product = db.query(Product).filter(Product.id == history.product_id).first() if history.product_id else None
    if product and (old_io_type != next_io_type or old_quantity != next_quantity):
        if old_io_type == "입고":
            product.stock -= old_quantity
        elif old_io_type == "출고":
            product.stock += old_quantity

        if next_io_type == "입고":
            product.stock += next_quantity
        else:
            if product.stock < next_quantity:
                db.rollback()
                raise HTTPException(status_code=400, detail=f"{product.name} 재고 부족 (현재: {product.stock}개)")
            product.stock -= next_quantity
        if product.stock < 0:
            db.rollback()
            raise HTTPException(status_code=400, detail=f"{product.name} 재고가 부족해 수정할 수 없습니다.")

    allowed = {
        "transaction_no", "record_date", "product_name", "business", "category",
        "subcategory", "brand", "io_type", "quantity", "cost_price", "memo"
    }
    for key, value in body.items():
        if key in allowed:
            if key == "record_date" and isinstance(value, str):
                value = date.fromisoformat(value)
            setattr(history, key, value)

    db.commit()
    db.refresh(history)
    return history
