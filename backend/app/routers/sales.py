from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.models.models import Sale, Product, StockHistory
from app.auth import get_current_user
from datetime import date, datetime

router = APIRouter(prefix="/api/sales", tags=["sales"])

class SaleItem(BaseModel):
    product_id: int
    sale_price: int
    quantity: int
    channel: str
    payment: str
    memo: Optional[str] = None

class SaleCreate(BaseModel):
    sale_date: date
    items: List[SaleItem]

class SaleOut(BaseModel):
    id: int
    transaction_no: str
    sale_date: date
    product_name: str
    business: Optional[str]
    category: Optional[str]
    subcategory: Optional[str]
    brand: Optional[str]
    cost_price: int
    sale_price: int
    quantity: int
    total: int
    channel: Optional[str]
    payment: Optional[str]
    memo: Optional[str]
    class Config:
        from_attributes = True

def generate_transaction_no(db: Session) -> str:
    last = db.query(Sale).order_by(Sale.id.desc()).first()
    if not last:
        return "T000001"
    num = int(last.transaction_no[1:]) + 1
    return f"T{num:06d}"

@router.post("")
def create_sale(body: SaleCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    transaction_no = generate_transaction_no(db)
    created = []
    for item in body.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"상품 ID {item.product_id}를 찾을 수 없습니다.")
        if product.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"{product.name} 재고 부족 (현재: {product.stock}개)")

        total = item.sale_price * item.quantity
        sale = Sale(
            transaction_no=transaction_no,
            sale_date=body.sale_date,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            cost_price=product.cost_price,
            sale_price=item.sale_price,
            quantity=item.quantity,
            total=total,
            channel=item.channel,
            payment=item.payment,
            memo=item.memo,
            created_by=user.id
        )
        db.add(sale)

        # 재고 차감
        product.stock -= item.quantity

        # 입출기록
        history = StockHistory(
            transaction_no=transaction_no,
            record_date=body.sale_date,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            io_type="출고",
            quantity=item.quantity,
            cost_price=product.cost_price,
            memo=item.memo,
            created_by=user.id
        )
        db.add(history)
        created.append(sale)

    db.commit()
    return {"ok": True, "transaction_no": transaction_no, "count": len(created)}

@router.get("", response_model=list[SaleOut])
def list_sales(
    start: Optional[date] = None,
    end: Optional[date] = None,
    business: Optional[str] = None,
    product_name: Optional[str] = None,
    channel: Optional[str] = None,
    payment: Optional[str] = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(Sale)
    if start:
        q = q.filter(Sale.sale_date >= start)
    if end:
        q = q.filter(Sale.sale_date <= end)
    if business:
        q = q.filter(Sale.business == business)
    if product_name:
        q = q.filter(Sale.product_name.ilike(f"%{product_name}%"))
    if channel:
        q = q.filter(Sale.channel == channel)
    if payment:
        q = q.filter(Sale.payment == payment)
    return q.order_by(Sale.sale_date.desc(), Sale.id.desc()).limit(limit).all()

@router.delete("/{sale_id}")
def delete_sale(sale_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="판매 기록을 찾을 수 없습니다.")
    # 재고 복구
    product = db.query(Product).filter(Product.id == sale.product_id).first()
    if product:
        product.stock += sale.quantity
    # 입출기록 삭제
    db.query(StockHistory).filter(StockHistory.transaction_no == sale.transaction_no).delete()
    db.delete(sale)
    db.commit()
    return {"ok": True}

# ── 매출 집계 ──────────────────────────────────────────
@router.get("/summary")
def sales_summary(
    group_by: str = Query("day"),  # day / month / business / category / subcategory / brand / product / channel / payment
    start: Optional[date] = None,
    end: Optional[date] = None,
    business: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(Sale)
    if start:
        q = q.filter(Sale.sale_date >= start)
    if end:
        q = q.filter(Sale.sale_date <= end)
    if business:
        q = q.filter(Sale.business == business)

    sales = q.all()
    result = {}

    for sale in sales:
        if group_by == "day":
            key = str(sale.sale_date)
        elif group_by == "month":
            key = str(sale.sale_date)[:7]
        elif group_by == "business":
            key = sale.business or "기타"
        elif group_by == "category":
            key = sale.category or "미분류"
        elif group_by == "subcategory":
            key = sale.subcategory or "미분류"
        elif group_by == "brand":
            key = sale.brand or "미분류"
        elif group_by == "product":
            key = sale.product_name
        elif group_by == "channel":
            key = sale.channel or "기타"
        elif group_by == "payment":
            key = sale.payment or "기타"
        else:
            key = str(sale.sale_date)

        cost_total = (sale.cost_price or 0) * (sale.quantity or 0)
        profit = (sale.total or 0) - cost_total

        if key not in result:
            result[key] = {
                "key": key,
                "total": 0,
                "cost_total": 0,
                "profit": 0,
                "count": 0,
                "quantity": 0,
            }
        result[key]["total"] += sale.total or 0
        result[key]["cost_total"] += cost_total
        result[key]["profit"] += profit
        result[key]["count"] += 1
        result[key]["quantity"] += sale.quantity or 0

    total_revenue = sum(row["total"] for row in result.values())
    total_profit = sum(row["profit"] for row in result.values())
    total_quantity = sum(row["quantity"] for row in result.values())

    rows = []
    for row in result.values():
        row["margin_rate"] = round((row["profit"] / row["total"]) * 100, 1) if row["total"] else 0
        row["revenue_percent"] = round((row["total"] / total_revenue) * 100, 1) if total_revenue else 0
        row["profit_percent"] = round((row["profit"] / total_profit) * 100, 1) if total_profit else 0
        row["quantity_percent"] = round((row["quantity"] / total_quantity) * 100, 1) if total_quantity else 0
        row["avg_sale"] = round(row["total"] / row["quantity"]) if row["quantity"] else 0
        row["avg_profit"] = round(row["profit"] / row["quantity"]) if row["quantity"] else 0
        rows.append(row)

    return sorted(rows, key=lambda x: x["key"], reverse=(group_by in ["day", "month"]))
