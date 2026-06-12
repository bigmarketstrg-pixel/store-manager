from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models.models import Base
from app.routers.auth import router as auth_router
from app.routers.products import router as products_router
from app.routers.sales import router as sales_router
from app.routers.extras import delivery_router, doc_router, handover_router
from app.auth import hash_password
from app.database import SessionLocal
from app.models.models import User

# DB 테이블 생성
Base.metadata.create_all(bind=engine)

app = FastAPI(title="악기점 매장관리 API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 배포 시 프론트엔드 URL로 변경
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(products_router)
app.include_router(sales_router)
app.include_router(delivery_router)
app.include_router(handover_router)
app.include_router(doc_router)

@app.on_event("startup")
def create_default_admin():
    """최초 실행 시 관리자 계정 생성"""
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "admin").first():
            admin = User(
                username="admin",
                hashed_password=hash_password("admin1234"),
                name="관리자",
                role="admin"
            )
            db.add(admin)
            db.commit()
            print("✅ 기본 관리자 계정 생성: admin / admin1234")
    finally:
        db.close()

@app.get("/")
def root():
    return {"message": "악기점 매장관리 API 정상 작동 중"}
