"""Accès base de données de l'authentification (remplace l'ancien auth/db.py en SQLite).

Même API qu'avant, mais sur la base commune du projet (PostgreSQL en Docker, SQLite en local) :
comptes, verrouillage anti brute-force, jetons révoqués, tentatives faciales.
"""
import time
from contextlib import contextmanager

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError

import db as app_db
from models.models import FaceAttempt, LoginFailure, RevokedToken, User

MAX_FAILURES = 5            # échecs (mot de passe OU visage) avant verrouillage
LOCK_SECONDS = 15 * 60      # durée du verrouillage, et fenêtre de comptage des échecs


class DuplicateUser(Exception):
    """Nom d'utilisateur ou email déjà utilisé."""


@contextmanager
def session():
    s = app_db.SessionLocal()
    try:
        yield s
        s.commit()
    except Exception:
        s.rollback()
        raise
    finally:
        s.close()


def _insert(model):
    """INSERT ... ON CONFLICT, identique sur PostgreSQL et SQLite."""
    if app_db.engine.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    return insert(model)


# ── Utilisateurs ──────────────────────────────────────────────
def _as_dict(user):
    if user is None:
        return None
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "password_hash": user.password_hash,
        "face_enrolled": bool(user.face_enrolled),
    }


def create_user(username: str, email: str, password_hash: str) -> int:
    with session() as s:
        s.add(User(username=username, email=email, password_hash=password_hash, name=username))
        try:
            s.flush()
        except IntegrityError:
            raise DuplicateUser() from None
        return s.execute(select(User.id).where(User.username == username)).scalar_one()


def get_user_by_username(username: str):
    with session() as s:
        return _as_dict(s.execute(select(User).where(User.username == username)).scalar_one_or_none())


def get_user_by_id(user_id: int):
    with session() as s:
        return _as_dict(s.get(User, user_id))


def set_face_enrolled(user_id: int, enrolled: bool) -> None:
    with session() as s:
        s.execute(update(User).where(User.id == user_id).values(face_enrolled=bool(enrolled)))


# ── Anti brute-force ──────────────────────────────────────────
def lock_remaining(username: str) -> int:
    """Secondes restantes avant la fin du verrouillage (0 si le compte n'est pas verrouillé)."""
    now = int(time.time())
    with session() as s:
        locked_until = s.execute(
            select(LoginFailure.locked_until).where(LoginFailure.username == username)
        ).scalar_one_or_none()
    if locked_until and locked_until > now:
        return locked_until - now
    return 0


def register_failure(username: str) -> None:
    now = int(time.time())
    with session() as s:
        row = s.execute(
            select(LoginFailure).where(LoginFailure.username == username).with_for_update()
        ).scalar_one_or_none()
        count = row.count + 1 if row and now - row.last_failure <= LOCK_SECONDS else 1
        locked_until = now + LOCK_SECONDS if count >= MAX_FAILURES else 0
        stmt = _insert(LoginFailure).values(
            username=username, count=count, locked_until=locked_until, last_failure=now
        )
        s.execute(stmt.on_conflict_do_update(
            index_elements=["username"],
            set_={
                "count": stmt.excluded["count"],
                "locked_until": stmt.excluded["locked_until"],
                "last_failure": stmt.excluded["last_failure"],
            },
        ))


def clear_failures(username: str) -> None:
    with session() as s:
        s.execute(delete(LoginFailure).where(LoginFailure.username == username))


# ── Jetons révoqués (déconnexion, jetons à usage unique) ──────
def revoke(jti: str, exp: int) -> None:
    now = int(time.time())
    with session() as s:
        s.execute(_insert(RevokedToken).values(jti=jti, exp=int(exp))
                  .on_conflict_do_nothing(index_elements=["jti"]))
        # nettoyage des entrées expirées (elles seraient de toute façon rejetées par la signature)
        s.execute(delete(RevokedToken).where(RevokedToken.exp < now))
        s.execute(delete(FaceAttempt).where(FaceAttempt.exp < now))


def is_revoked(jti: str) -> bool:
    with session() as s:
        return s.execute(select(RevokedToken.jti).where(RevokedToken.jti == jti)).first() is not None


# ── Tentatives faciales par jeton de connexion ────────────────
def face_attempts(jti: str) -> int:
    with session() as s:
        value = s.execute(select(FaceAttempt.count).where(FaceAttempt.jti == jti)).scalar_one_or_none()
    return value or 0


def bump_face_attempts(jti: str, exp: int) -> int:
    with session() as s:
        stmt = _insert(FaceAttempt).values(jti=jti, count=1, exp=int(exp))
        s.execute(stmt.on_conflict_do_update(
            index_elements=["jti"], set_={"count": FaceAttempt.count + 1}
        ))
        return s.execute(select(FaceAttempt.count).where(FaceAttempt.jti == jti)).scalar_one()
