import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.security import require_user
from db import get_db
from ml import categorizer, forecaster, anomaly, budgets
from ml import alerts as alert_engine

router = APIRouter(prefix="/ml", tags=["ML"])

# Le catégoriseur est un modèle PARTAGÉ : seuls les comptes listés ici peuvent le ré-entraîner.
# Exemple : FINANCEIQ_ADMINS=chadha   (plusieurs comptes séparés par des virgules)
ADMINS = {u.strip().lower() for u in os.getenv("FINANCEIQ_ADMINS", "").split(",") if u.strip()}


def _uid(claims: dict) -> int:
    return int(claims["sub"])


# ── POST /ml/categorize ──────────────────────────────
@router.post("/categorize")
def categorize_transaction(payload: dict):
    """Body: { "description": "Metro card top-up" }"""
    description = payload.get("description", "")
    if not description:
        return {"error": "description est requis"}
    return categorizer.predict(description)


# ── POST /ml/train  (administrateur) ─────────────────
@router.post("/train")
def train_categorizer(claims: dict = Depends(require_user), db: Session = Depends(get_db)):
    """Ré-entraîne le catégoriseur sur les transactions en base (toutes) : réservé à l'admin."""
    if claims["usr"] not in ADMINS:
        raise HTTPException(status_code=403, detail="Réservé à l'administrateur")
    accuracy = categorizer.retrain_from_db(db)
    return {
        "status": "Modèle entraîné avec succès",
        "accuracy": f"{accuracy}%" if accuracy else "N/A"
    }


# ── GET /ml/forecast ─────────────────────────────────
@router.get("/forecast")
def get_forecast(claims: dict = Depends(require_user), db: Session = Depends(get_db)):
    """Prévision du mois prochain par catégorie (Prophet), pour l'utilisateur connecté."""
    return forecaster.forecast_next_month(db, user_id=_uid(claims))


# ── POST /ml/detect-anomalies ────────────────────────
@router.post("/detect-anomalies")
def detect_anomalies(
    z_threshold: float = anomaly.DEFAULT_THRESHOLD,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    """Flag les anomalies (log + médiane/MAD) et met à jour is_anomaly."""
    return anomaly.detect_anomalies(db, z_threshold=z_threshold, user_id=_uid(claims))


# ── GET /ml/anomalies ────────────────────────────────
@router.get("/anomalies")
def get_anomalies(claims: dict = Depends(require_user), db: Session = Depends(get_db)):
    result = anomaly.get_anomalies(db, user_id=_uid(claims))
    return {"total": len(result), "anomalies": result}


# ── POST /ml/suggest-budgets?apply=true ──────────────
@router.post("/suggest-budgets")
def suggest_budgets(
    months: int = 3,
    buffer: float = 1.10,
    month: Optional[int] = None,
    year: Optional[int] = None,
    apply: bool = False,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    """Budgets = moyenne réelle des derniers mois complets + marge. apply=true les enregistre."""
    return budgets.suggest_budgets(db, _uid(claims), months=months, buffer=buffer,
                                   month=month, year=year, apply=apply)


# ── GET /ml/alerts?month=10&year=2026 ────────────────
@router.get("/alerts")
def get_alerts(
    month: Optional[int] = None,
    year: Optional[int] = None,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    """Alertes proactives : budgets, projection fin de mois, dépenses inhabituelles."""
    return alert_engine.build_alerts(db, _uid(claims), month, year)
