from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from models.models import Budget, User
from auth.security import require_user

router = APIRouter(prefix="/budgets", tags=["Budgets"])


class BudgetCreate(BaseModel):
    category: str
    limit_amount: float
    month: int
    year: int


class BudgetRead(BaseModel):
    id: int
    user_id: int
    category: str
    limit_amount: float
    month: int
    year: int
    model_config = {"from_attributes": True}


def _uid(claims: dict) -> int:
    return int(claims["sub"])


@router.post("/", response_model=BudgetRead)
def set_budget(
    payload: BudgetCreate,
    claims: dict = Depends(require_user),
    db: Session = Depends(get_db)
):
    user_id = _uid(claims)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    budget = db.query(Budget).filter(
        Budget.user_id == user_id,
        Budget.category == payload.category,
        Budget.month == payload.month,
        Budget.year == payload.year,
    ).first()

    if budget:
        budget.limit_amount = payload.limit_amount
    else:
        budget = Budget(user_id=user_id, **payload.model_dump())
        db.add(budget)

    db.commit()
    db.refresh(budget)
    return budget


@router.get("/", response_model=list[BudgetRead])
def get_budgets(
    claims: dict = Depends(require_user),
    month: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    user_id = _uid(claims)
    query = db.query(Budget).filter(Budget.user_id == user_id)
    if month:
        query = query.filter(Budget.month == month)
    if year:
        query = query.filter(Budget.year == year)
    return query.all()