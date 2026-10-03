import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from auth.routes import router as auth_router
from auth.security import require_user
from db import get_db
from models.models import User
from routers import budgets, ml, transactions
from schemas.schemas import UserRead

# Le schéma de la base est géré par Alembic : `alembic upgrade head`
# (plus de Base.metadata.create_all ici, pour que la base reste versionnée).

app = FastAPI(
    title="Smart Finance Dashboard API",
    description="Backend for the personal finance tracker",
    version="1.0.0"
)

# CORS : origines autorisées, configurables (CORS_ORIGINS="https://monsite.com,http://localhost:3000")
ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Routes publiques : inscription, connexion, visage ─────────────
app.include_router(auth_router)

# ── Routes de données : jeton d'accès obligatoire ─────────────────
# Le jeton n'est délivré qu'après mot de passe ET visage. Chaque route lit l'utilisateur
# dans le jeton (claims["sub"]) : aucun user_id ne vient du client.
for _router in (transactions.router, budgets.router, ml.router):
    app.include_router(_router, dependencies=[Depends(require_user)])


# ── GET /users/me ────────────────────────────────────
# Remplace POST /users et GET /users/{id} : on ne peut lire que son propre profil,
# et les comptes se créent uniquement par POST /auth/signup.
@app.get("/users/me", response_model=UserRead, tags=["Users"])
def get_me(claims: dict = Depends(require_user), db: Session = Depends(get_db)):
    user = db.get(User, int(claims["sub"]))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── Health check (public) ────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "Finance Dashboard API is running"}
