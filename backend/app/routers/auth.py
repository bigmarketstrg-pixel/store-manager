from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.models import User
from app.auth import verify_password, hash_password, create_access_token, get_current_user, require_admin

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserCreate(BaseModel):
    username: str
    password: str
    name: str
    role: str = "staff"

class UserOut(BaseModel):
    id: int
    username: str
    name: str
    role: str
    is_active: int
    class Config:
        from_attributes = True

@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 틀렸습니다.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="비활성화된 계정입니다.")
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer", "user": UserOut.from_orm(user)}

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), admin=Depends(require_admin)):
    return db.query(User).all()

@router.post("/users", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="이미 존재하는 아이디입니다.")
    user = User(
        username=body.username,
        hashed_password=hash_password(body.password),
        name=body.name,
        role=body.role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.patch("/users/{user_id}")
def update_user(user_id: int, body: dict, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    if "password" in body:
        user.hashed_password = hash_password(body["password"])
    if "name" in body:
        user.name = body["name"]
    if "role" in body:
        user.role = body["role"]
    if "is_active" in body:
        user.is_active = body["is_active"]
    db.commit()
    return {"ok": True}

@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다.")
    db.delete(user)
    db.commit()
    return {"ok": True}
