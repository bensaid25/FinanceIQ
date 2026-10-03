"""Exemple d'intégration dans ton main.py (adapte les noms de tes routeurs existants)."""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.routes import router as auth_router      # remplace l'ancien routeur d'auth (auth.py)
from auth.security import require_user

app = FastAPI()

# CORS : uniquement ton frontend (pas "*"), avec l'en-tête Authorization
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Routes publiques : inscription, connexion, visage
app.include_router(auth_router)

# TOUTES les routes de données passent derrière require_user.
# Sans ça, n'importe qui peut appeler l'API sans passer par le login.
#
#   from routers import transactions, anomalies, forecast, budgets
#   for r in (transactions.router, anomalies.router, forecast.router, budgets.router):
#       app.include_router(r, dependencies=[Depends(require_user)])
