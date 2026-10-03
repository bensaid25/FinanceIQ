from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import extract
from datetime import datetime
from typing import Optional
import io

import pandas as pd
from pydantic import BaseModel

from ml import categorizer, anomaly
from db import get_db
from models.models import Transaction, User, Budget
from schemas.schemas import (
    TransactionCreate, TransactionRead,
    SummaryRead, CategorySummary
)
from auth.security import require_user

router = APIRouter(prefix="/transactions", tags=["Transactions"])

APP_CATEGORIES = ["Food", "Transport", "Bills", "Entertainment",
                  "Health", "Shopping", "Education"]


def _uid(claims: dict) -> int:
    return int(claims["sub"])


# ── POST /transactions ───────────────────────────────
@router.post("/", response_model=TransactionRead)
def create_transaction(
    payload: TransactionCreate,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump()
    data["user_id"] = user_id
    transaction = Transaction(**data)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


# ── GET /transactions ────────────────────────────────
@router.get("/", response_model=list[TransactionRead])
def get_transactions(
    claims: dict = Depends(require_user),
    category: Optional[str] = None,
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    query = db.query(Transaction).filter(Transaction.user_id == user_id)
    if category:
        query = query.filter(Transaction.category == category)
    if month:
        query = query.filter(extract("month", Transaction.date) == month)
    if year:
        query = query.filter(extract("year", Transaction.date) == year)
    return query.order_by(Transaction.date.desc()).all()


# ── GET /transactions/summary ────────────────────────
@router.get("/summary", response_model=SummaryRead)
def get_summary(
    month: int,
    year: int,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    txns = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        extract("month", Transaction.date) == month,
        extract("year", Transaction.date) == year
    ).all()

    expenses  = [t for t in txns if t.amount < 0]
    total_exp = abs(sum(t.amount for t in expenses))
    month_income = sum(t.amount for t in txns if t.amount > 0)
    has_income = db.query(Transaction).filter(
        Transaction.user_id == user_id, Transaction.amount > 0
    ).first() is not None
    total_inc = month_income if has_income else user.monthly_income
    savings   = round((total_inc - total_exp) / total_inc * 100, 1) if total_inc > 0 else 0.0

    cat_totals: dict[str, float] = {}
    for t in expenses:
        cat_totals[t.category] = cat_totals.get(t.category, 0) + abs(t.amount)

    budgets = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.month == month,
        Budget.year == year
    ).all()
    budget_map = {b.category: b.limit_amount for b in budgets}

    categories = [
        CategorySummary(
            category=cat,
            total_spent=round(spent, 2),
            budget_limit=budget_map.get(cat),
            remaining=round(budget_map[cat] - spent, 2) if cat in budget_map else None
        )
        for cat, spent in cat_totals.items()
    ]

    return SummaryRead(
        user_id=user_id, month=month, year=year,
        total_income=total_inc,
        total_expenses=round(total_exp, 2),
        savings_rate=savings,
        categories=categories
    )


# ── POST /transactions/quick ─────────────────────────
class QuickTransaction(BaseModel):
    description: str
    amount: float
    type: str = "expense"
    category: Optional[str] = None
    date: Optional[datetime] = None


@router.post("/quick")
def quick_add(
    payload: QuickTransaction,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    description = payload.description.strip()
    if not description or payload.amount <= 0:
        raise HTTPException(status_code=422, detail="Description et montant > 0 requis")

    is_income = payload.type == "income"
    confidence = None
    if is_income:
        category = "Income"
    elif payload.category and payload.category != "auto":
        category = payload.category
    else:
        pred = categorizer.predict(description)
        category, confidence = pred["predicted_category"], pred["confidence"]

    amount = abs(payload.amount) * (1 if is_income else -1)
    tx = Transaction(
        user_id=user_id, amount=amount, description=description,
        category=category, date=payload.date or datetime.now(), is_anomaly=False,
    )
    db.add(tx)
    db.commit()
    anomaly.detect_anomalies(db, z_threshold=2.0, user_id=user_id)
    db.refresh(tx)

    return {
        "id": tx.id, "description": tx.description, "amount": tx.amount,
        "category": tx.category, "confidence": confidence,
        "date": tx.date.isoformat(), "is_anomaly": bool(tx.is_anomaly),
    }


# ── POST /transactions/import-csv ────────────────────
class CsvImport(BaseModel):
    csv_text: str


@router.post("/import-csv")
def import_csv(
    payload: CsvImport,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        df = pd.read_csv(io.StringIO(payload.csv_text))
    except Exception:
        raise HTTPException(status_code=400, detail="CSV illisible")
    if len(df) > 5000:
        raise HTTPException(status_code=400, detail="Max 5000 lignes par import")

    df.columns = [c.strip().lower().replace(" ", "_") for c in df.columns]
    aliases = {
        "date":        ["date", "transaction_date"],
        "description": ["description", "merchant_name", "merchant", "libelle"],
        "amount":      ["amount", "transaction_amount", "montant"],
        "type":        ["transaction_type", "type"],
        "category":    ["category", "categorie"],
    }
    rename = {}
    for target, candidates in aliases.items():
        found = next((c for c in candidates if c in df.columns), None)
        if found:
            rename[found] = target
    df = df.rename(columns=rename)

    missing = [c for c in ("date", "description", "amount") if c not in df.columns]
    if missing:
        raise HTTPException(status_code=400,
            detail=f"Colonnes manquantes : {missing}. Colonnes reçues : {list(df.columns)}")

    df["date"]        = pd.to_datetime(df["date"], errors="coerce")
    df["amount"]      = pd.to_numeric(df["amount"], errors="coerce")
    df["description"] = df["description"].astype(str).str.strip()
    before = len(df)
    df = df.dropna(subset=["date", "amount"])
    df = df[df["description"] != ""]
    skipped = before - len(df)

    if "type" in df.columns:
        t = df["type"].astype(str).str.lower()
        is_income = t.str.contains("credit|income|revenu", regex=True) \
                    & ~t.str.contains("debit|expense|depense", regex=True)
    else:
        is_income = df["amount"] > 0
    df["is_income"] = is_income
    df["amount"]    = df["amount"].abs() * df["is_income"].map({True: 1, False: -1})

    known = {c.lower(): c for c in APP_CATEGORIES}
    given = df["category"].astype(str).str.strip().str.lower().map(known) \
        if "category" in df.columns else pd.Series([None] * len(df), index=df.index)
    to_predict = df.index[~df["is_income"] & given.isna()]
    predicted  = {}
    if len(to_predict):
        model = categorizer.load_model()
        preds = model.predict(df.loc[to_predict, "description"].tolist())
        predicted = dict(zip(to_predict, preds))

    existing = {
        (t.date, round(t.amount, 2), t.description)
        for t in db.query(Transaction).filter(Transaction.user_id == user_id)
    }

    n_exp = n_inc = dup = 0
    latest = None
    for idx, r in df.iterrows():
        when = r["date"].to_pydatetime()
        key  = (when, round(float(r["amount"]), 2), r["description"])
        if key in existing:
            dup += 1
            continue
        existing.add(key)
        if r["is_income"]:
            category = "Income"; n_inc += 1
        else:
            category = given.get(idx) if isinstance(given.get(idx), str) \
                else predicted.get(idx, "Uncategorized")
            n_exp += 1
        db.add(Transaction(
            user_id=user_id, amount=float(r["amount"]),
            description=r["description"], category=category,
            date=when, is_anomaly=False,
        ))
        latest = when if latest is None or when > latest else latest
    db.commit()

    res = anomaly.detect_anomalies(db, z_threshold=2.0, user_id=user_id)
    return {
        "imported": n_exp + n_inc, "expenses": n_exp, "income": n_inc,
        "duplicates": dup, "skipped": skipped,
        "anomalies_found": res.get("anomalies_found"),
        "latest_date": latest.isoformat() if latest else None,
    }