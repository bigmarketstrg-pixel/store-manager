from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional, List
from app.database import get_db
from app.models.models import Delivery, Document, User
from app.auth import get_current_user, require_admin
from datetime import date
import json

# ── 택배비 ────────────────────────────────────────────
delivery_router = APIRouter(prefix="/api/deliveries", tags=["deliveries"])

class DeliveryCreate(BaseModel):
    delivery_date: date
    business: str
    recipient: Optional[str] = None
    shipping_fee: int = 0
    memo: Optional[str] = None

class DeliveryOut(BaseModel):
    id: int
    delivery_date: date
    business: str
    recipient: Optional[str]
    shipping_fee: int
    memo: Optional[str]
    class Config:
        from_attributes = True

@delivery_router.get("", response_model=list[DeliveryOut])
def list_deliveries(
    business: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(Delivery)
    if business:
        q = q.filter(Delivery.business == business)
    if start:
        q = q.filter(Delivery.delivery_date >= start)
    if end:
        q = q.filter(Delivery.delivery_date <= end)
    return q.order_by(Delivery.delivery_date.desc()).all()

@delivery_router.post("", response_model=DeliveryOut)
def create_delivery(body: DeliveryCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = Delivery(**body.dict(), created_by=user.id)
    db.add(d)
    db.commit()
    db.refresh(d)
    return d

@delivery_router.patch("/{delivery_id}", response_model=DeliveryOut)
def update_delivery(delivery_id: int, body: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="배송 기록을 찾을 수 없습니다.")
    for k, v in body.items():
        if hasattr(d, k):
            setattr(d, k, v)
    db.commit()
    db.refresh(d)
    return d

@delivery_router.delete("/{delivery_id}")
def delete_delivery(delivery_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    d = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="배송 기록을 찾을 수 없습니다.")
    db.delete(d)
    db.commit()
    return {"ok": True}

# ── 견적서 / 납품서 / 거래명세서 ──────────────────────
doc_router = APIRouter(prefix="/api/documents", tags=["documents"])

class DocItem(BaseModel):
    name: str
    spec: Optional[str] = None
    qty: int
    price: int

class DocumentCreate(BaseModel):
    doc_type: str
    business: str
    doc_date: date
    recipient: str
    total: int
    memo: Optional[str] = None
    items: List[DocItem]

class DocumentOut(BaseModel):
    id: int
    doc_type: str
    doc_no: str
    business: str
    doc_date: date
    recipient: str
    total: int
    memo: Optional[str]
    items_json: Optional[str]
    issuer_name: Optional[str] = None
    class Config:
        from_attributes = True

def generate_doc_no(db: Session, doc_type: str) -> str:
    prefix = {"견적서": "Q", "납품서": "D", "거래명세서": "T"}.get(doc_type, "X")
    last = db.query(Document).filter(Document.doc_type == doc_type).order_by(Document.id.desc()).first()
    num = int(last.doc_no[1:]) + 1 if last else 1
    return f"{prefix}{num:05d}"

def document_to_out(doc: Document, issuer_name: Optional[str] = None) -> dict:
    return {
        "id": doc.id,
        "doc_type": doc.doc_type,
        "doc_no": doc.doc_no,
        "business": doc.business,
        "doc_date": doc.doc_date,
        "recipient": doc.recipient,
        "total": doc.total,
        "memo": doc.memo,
        "items_json": doc.items_json,
        "issuer_name": issuer_name,
    }

@doc_router.get("", response_model=list[DocumentOut])
def list_documents(
    doc_type: Optional[str] = None,
    business: Optional[str] = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    q = db.query(Document, User.name).outerjoin(User, Document.created_by == User.id)
    if doc_type:
        q = q.filter(Document.doc_type == doc_type)
    if business:
        q = q.filter(Document.business == business)
    return [document_to_out(doc, issuer_name) for doc, issuer_name in q.order_by(Document.created_at.desc()).all()]

@doc_router.post("", response_model=DocumentOut)
def create_document(body: DocumentCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc_no = generate_doc_no(db, body.doc_type)
    doc = Document(
        doc_type=body.doc_type,
        doc_no=doc_no,
        business=body.business,
        doc_date=body.doc_date,
        recipient=body.recipient,
        total=body.total,
        memo=body.memo,
        items_json=json.dumps([i.dict() for i in body.items], ensure_ascii=False),
        created_by=user.id
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return document_to_out(doc, user.name)

@doc_router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    doc, issuer_name = db.query(Document, User.name).outerjoin(User, Document.created_by == User.id).filter(Document.id == doc_id).first() or (None, None)
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    return document_to_out(doc, issuer_name)

@doc_router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db), user=Depends(require_admin)):
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="문서를 찾을 수 없습니다.")
    db.delete(doc)
    db.commit()
    return {"ok": True}
