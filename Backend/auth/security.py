"""Mots de passe (scrypt), jetons JWT à portée limitée, dépendances FastAPI."""
import base64
import hashlib
import hmac
import os
import re
import secrets
import time
import uuid

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from . import db as store

# ── Durées de vie des jetons (secondes) ───────────────────────
ACCESS_TTL = int(os.environ.get("FINANCEIQ_ACCESS_TTL", 30 * 60))  # session ouverte
FACE_TTL = 5 * 60      # entre le mot de passe et la vérification du visage
ENROLL_TTL = 15 * 60   # pour enregistrer le visage après l'inscription

# Chaque jeton a une "portée" : un jeton de l'étape 1 ne donne JAMAIS accès aux données.
SCOPE_ENROLL = "enroll"
SCOPE_FACE = "face"
SCOPE_ACCESS = "access"


# ── Clé de signature ──────────────────────────────────────────
def _load_secret() -> str:
    env = os.environ.get("FINANCEIQ_JWT_SECRET", "")
    if len(env) >= 32:
        return env
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".jwt_secret")
    if os.path.exists(path):
        with open(path) as f:
            return f.read().strip()
    value = secrets.token_urlsafe(64)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(value)
    return value


SECRET = _load_secret()


# ── Mots de passe ─────────────────────────────────────────────
_N, _R, _P = 2 ** 14, 8, 1


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, n, r, p, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


_dummy_hash = None


def dummy_hash() -> str:
    """Hash factice : on le vérifie quand l'utilisateur n'existe pas, pour que la réponse
    prenne le même temps (sinon on pourrait deviner quels noms d'utilisateur existent)."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(16))
    return _dummy_hash


def validate_password(password: str, username: str = "") -> None:
    if len(password) < 10:
        raise ValueError("Le mot de passe doit contenir au moins 10 caractères")
    if len(password) > 128:
        raise ValueError("Le mot de passe est trop long (128 caractères maximum)")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise ValueError("Le mot de passe doit contenir au moins une lettre et un chiffre")
    if username and username.lower() in password.lower():
        raise ValueError("Le mot de passe ne doit pas contenir le nom d'utilisateur")
    if len(set(password)) < 4:
        raise ValueError("Le mot de passe est trop répétitif")


# ── Jetons ────────────────────────────────────────────────────
def create_token(user_id: int, username: str, scope: str, ttl: int) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "usr": username,
        "scope": scope,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def decode_token(token: str, scope: str) -> dict:
    try:
        claims = jwt.decode(
            token, SECRET, algorithms=["HS256"],
            options={"require": ["exp", "jti", "sub", "scope"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session invalide ou expirée")
    if claims.get("scope") != scope or store.is_revoked(claims["jti"]):
        raise HTTPException(status_code=401, detail="Session invalide ou expirée")
    return claims


_bearer = HTTPBearer(auto_error=False)


def require_scope(scope: str):
    def dependency(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
        if creds is None or creds.scheme.lower() != "bearer":
            raise HTTPException(
                status_code=401, detail="Authentification requise",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return decode_token(creds.credentials, scope)
    return dependency


# À mettre sur toutes les routes qui exposent des données financières.
require_user = require_scope(SCOPE_ACCESS)
