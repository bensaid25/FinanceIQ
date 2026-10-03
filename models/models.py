from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, Column, DateTime, ForeignKey, Index,
                        Integer, Numeric, String, UniqueConstraint)
from sqlalchemy.orm import relationship

from db import Base

# Montants : NUMERIC(12,2) dans la base (exact), float côté Python (compatible pandas / ML).
Money = Numeric(12, 2, asdecimal=False)


class User(Base):
    """Un seul utilisateur pour tout le projet : identifiants, visage et profil financier.
    L'id est celui qui figure dans le jeton (claims["sub"]) et dans le dossier auth/faces/<id>/."""
    __tablename__ = "users"

    id             = Column(Integer, primary_key=True)
    username       = Column(String(32), unique=True, nullable=False)    # toujours en minuscules
    email          = Column(String(254), unique=True, nullable=False)   # toujours en minuscules
    password_hash  = Column(String(255), nullable=False)
    face_enrolled  = Column(Boolean, nullable=False, default=False)
    name           = Column(String(100))                                 # nom affiché (optionnel)
    monthly_income = Column(Money, nullable=False, default=0)
    created_at     = Column(DateTime, nullable=False, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="user",
                                cascade="all, delete-orphan", passive_deletes=True)
    budgets      = relationship("Budget", back_populates="user",
                                cascade="all, delete-orphan", passive_deletes=True)


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ix_transactions_user_date", "user_id", "date"),
    )

    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    amount      = Column(Money, nullable=False)
    description = Column(String, nullable=False)
    category    = Column(String, nullable=False, default="Uncategorized")
    date        = Column(DateTime, nullable=False)
    is_anomaly  = Column(Boolean, nullable=False, default=False)
    source      = Column(String, nullable=False, default="manual")
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="transactions")


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        UniqueConstraint("user_id", "category", "month", "year", name="uq_budget_user_cat_period"),
    )

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category     = Column(String, nullable=False)
    limit_amount = Column(Money, nullable=False)
    month        = Column(Integer, nullable=False)
    year         = Column(Integer, nullable=False)

    user = relationship("User", back_populates="budgets")


# ── Tables techniques de l'authentification (ex-auth.db) ───────────────
class LoginFailure(Base):
    __tablename__ = "login_failures"

    username     = Column(String(64), primary_key=True)
    count        = Column(Integer, nullable=False)
    locked_until = Column(BigInteger, nullable=False, default=0)   # secondes epoch
    last_failure = Column(BigInteger, nullable=False)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti = Column(String(64), primary_key=True)
    exp = Column(BigInteger, nullable=False, index=True)


class FaceAttempt(Base):
    __tablename__ = "face_attempts"

    jti   = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False)
    exp   = Column(BigInteger, nullable=False)
