from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models.models import Product, StockHistory, WholesaleOutbound, WholesaleOutboundItem

router = APIRouter(prefix="/api/wholesale-outbounds", tags=["wholesale"])

class WholesaleItemCreate(BaseModel):
    product_id: int
    sale_price: int
    quantity: int

class WholesaleCreate(BaseModel):
    outbound_date: date
    dealer_name: str
    paid_amount: int = 0
    memo: Optional[str] = None
    items: list[WholesaleItemCreate]

class WholesaleItemOut(BaseModel):
    id: int
    product_id: Optional[int]
    product_name: str
    business: Optional[str]
    category: Optional[str]
    subcategory: Optional[str]
    brand: Optional[str]
    cost_price: int
    sale_price: int
    quantity: int
    total: int
    class Config:
        from_attributes = True

class WholesaleOut(BaseModel):
    id: int
    transaction_no: str
    outbound_date: date
    dealer_name: str
    total: int
    paid_amount: int
    balance: int
    payment_status: str
    memo: Optional[str]
    staff_name: Optional[str] = None
    items: list[WholesaleItemOut] = []
    class Config:
        from_attributes = True

def payment_status(total: int, paid: int) -> str:
    if paid <= 0:
        return "미수"
    if paid >= total:
        return "완납"
    return "일부입금"

def generate_transaction_no(db: Session) -> str:
    last = db.query(WholesaleOutbound).order_by(WholesaleOutbound.id.desc()).first()
    if not last:
        return "W000001"
    return f"W{int(last.transaction_no[1:]) + 1:06d}"

def to_out(outbound: WholesaleOutbound, staff_name: Optional[str] = None) -> dict:
    return {
        "id": outbound.id,
        "transaction_no": outbound.transaction_no,
        "outbound_date": outbound.outbound_date,
        "dealer_name": outbound.dealer_name,
        "total": outbound.total or 0,
        "paid_amount": outbound.paid_amount or 0,
        "balance": max((outbound.total or 0) - (outbound.paid_amount or 0), 0),
        "payment_status": outbound.payment_status,
        "memo": outbound.memo,
        "staff_name": staff_name,
        "items": outbound.items,
    }

@router.post("", response_model=WholesaleOut)
def create_wholesale_outbound(body: WholesaleCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    dealer_name = body.dealer_name.strip()
    if not dealer_name:
        raise HTTPException(status_code=400, detail="도매처명을 입력해주세요.")
    if not body.items:
        raise HTTPException(status_code=400, detail="출고할 상품을 추가해주세요.")

    transaction_no = generate_transaction_no(db)
    outbound = WholesaleOutbound(
        transaction_no=transaction_no,
        outbound_date=body.outbound_date,
        dealer_name=dealer_name,
        paid_amount=max(body.paid_amount or 0, 0),
        memo=body.memo,
        created_by=user.id,
    )
    db.add(outbound)
    db.flush()

    total = 0
    for item in body.items:
        if item.quantity <= 0:
            continue
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"상품 ID {item.product_id}를 찾을 수 없습니다.")
        if product.stock < item.quantity:
            raise HTTPException(status_code=400, detail=f"{product.name} 재고 부족 (현재: {product.stock}개)")

        line_total = item.sale_price * item.quantity
        total += line_total
        product.stock -= item.quantity

        outbound_item = WholesaleOutboundItem(
            outbound_id=outbound.id,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            cost_price=product.cost_price,
            sale_price=item.sale_price,
            quantity=item.quantity,
            total=line_total,
        )
        db.add(outbound_item)

        history = StockHistory(
            transaction_no=transaction_no,
            record_date=body.outbound_date,
            product_id=product.id,
            product_name=product.name,
            business=product.business,
            category=product.category,
            subcategory=product.subcategory,
            brand=product.brand,
            io_type="출고",
            quantity=item.quantity,
            cost_price=product.cost_price,
            memo=f"도매처: {dealer_name}" + (f" / {body.memo}" if body.memo else ""),
            created_by=user.id,
        )
        db.add(history)

    if total <= 0:
        db.rollback()
        raise HTTPException(status_code=400, detail="출고 수량을 입력해주세요.")

    outbound.total = total
    outbound.paid_amount = min(outbound.paid_amount or 0, total)
    outbound.payment_status = payment_status(total, outbound.paid_amount)
    db.commit()
    db.refresh(outbound)
    return to_out(outbound, user.name)

@router.get("", response_model=list[WholesaleOut])
def list_wholesale_outbounds(
    start: Optional[date] = None,
    end: Optional[date] = None,
    dealer_name: Optional[str] = None,
    payment_status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    q = db.query(WholesaleOutbound)
    if start:
        q = q.filter(WholesaleOutbound.outbound_date >= start)
    if end:
        q = q.filter(WholesaleOutbound.outbound_date <= end)
    if dealer_name:
        q = q.filter(WholesaleOutbound.dealer_name.ilike(f"%{dealer_name}%"))
    if payment_status_filter:
        q = q.filter(WholesaleOutbound.payment_status == payment_status_filter)
    rows = q.order_by(WholesaleOutbound.outbound_date.desc(), WholesaleOutbound.id.desc()).limit(300).all()
    return [to_out(row, row.user.name if row.user else None) for row in rows]

@router.patch("/{outbound_id}", response_model=WholesaleOut)
def update_wholesale_outbound(outbound_id: int, body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    outbound = db.query(WholesaleOutbound).filter(WholesaleOutbound.id == outbound_id).first()
    if not outbound:
        raise HTTPException(status_code=404, detail="도매 출고 기록을 찾을 수 없습니다.")
    if "paid_amount" in body:
        paid = max(int(body["paid_amount"] or 0), 0)
        outbound.paid_amount = min(paid, outbound.total or 0)
        outbound.payment_status = payment_status(outbound.total or 0, outbound.paid_amount)
    if "memo" in body:
        outbound.memo = body["memo"]
    db.commit()
    db.refresh(outbound)
    return to_out(outbound, outbound.user.name if outbound.user else None)

@router.delete("/{outbound_id}")
def delete_wholesale_outbound(outbound_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    outbound = db.query(WholesaleOutbound).filter(WholesaleOutbound.id == outbound_id).first()
    if not outbound:
        raise HTTPException(status_code=404, detail="도매 출고 기록을 찾을 수 없습니다.")

    for item in outbound.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            product.stock += item.quantity
    db.query(StockHistory).filter(StockHistory.transaction_no == outbound.transaction_no).delete()
    db.delete(outbound)
    db.commit()
    return {"ok": True}
