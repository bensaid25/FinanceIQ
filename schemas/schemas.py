from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional


# ── User ────────────────────────────────────────────
class UserCreate(BaseModel):
    name: str
    email: str
    monthly_income: float = 0.0

class UserRead(BaseModel):
    id: int
    name: str
    email: str
    monthly_income: float
    created_at: datetime

    class Config:
        from_attributes = True


# ── Transaction ─────────────────────────────────────
class TransactionCreate(BaseModel):
    user_id: int
    amount: float
    description: str
    category: Optional[str] = "Uncategorized"
    date: datetime

class TransactionRead(BaseModel):
    id: int
    user_id: int
    amount: float
    description: str
    category: str
    date: datetime
    is_anomaly: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ── Budget ───────────────────────────────────────────
class BudgetCreate(BaseModel):
    user_id: int
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

    class Config:
        from_attributes = True


# ── Summary (response only) ──────────────────────────
class CategorySummary(BaseModel):
    category: str
    total_spent: float
    budget_limit: Optional[float]
    remaining: Optional[float]

class SummaryRead(BaseModel):
    user_id: int
    month: int
    year: int
    total_income: float
    total_expenses: float
    savings_rate: float
    categories: list[CategorySummary]