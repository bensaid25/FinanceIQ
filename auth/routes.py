"""Routes d'authentification : inscription, connexion en 2 étapes, visage, déconnexion."""
import logging
import math
import re
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import store
from . import face_auth, security

log = logging.getLogger("financeiq.auth")

router = APIRouter(prefix="/auth", tags=["Authentication"])


MAX_FACE_ATTEMPTS = 5
USERNAME_RE = re.compile(r"^[a-z0-9_-]{3,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_IMAGE_CHARS = 4_500_000


class SignupBody(BaseModel):
    username: str = Field(max_length=64)
    email: str = Field(max_length=254)
    password: str = Field(max_length=256)


class LoginBody(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=256)


class EnrollBody(BaseModel):
    images: List[str]


class VerifyBody(BaseModel):
    image: str = Field(max_length=MAX_IMAGE_CHARS)


def _locked(username: str) -> None:
    wait = store.lock_remaining(username)
    if wait:
        minutes = max(1, math.ceil(wait / 60))
        raise HTTPException(
            status_code=429,
            detail=f"Trop de tentatives. Compte verrouillé, réessayez dans {minutes} min.",
            headers={"Retry-After": str(wait)},
        )


# ── POST /auth/signup ─────────────────────────────────────────
@router.post("/signup", status_code=201)
def signup(body: SignupBody):
    username = body.username.strip().lower()
    email = body.email.strip().lower()

    if not USERNAME_RE.match(username):
        raise HTTPException(422, "Nom d'utilisateur : 3 à 32 caractères (a-z, 0-9, _ ou -)")
    if not EMAIL_RE.match(email):
        raise HTTPException(422, "Adresse email invalide")
    try:
        security.validate_password(body.password, username)
    except ValueError as err:
        raise HTTPException(422, str(err))

    try:
        user_id = store.create_user(username, email, security.hash_password(body.password))
    except store.DuplicateUser:
        raise HTTPException(409, "Ce nom d'utilisateur ou cet email est déjà utilisé")

    token = security.create_token(user_id, username, security.SCOPE_ENROLL, security.ENROLL_TTL)
    return {"username": username, "step": "enroll", "token": token}


# ── POST /auth/login  (étape 1 : identifiants) ────────────────
@router.post("/login")
def login(body: LoginBody):
    username = body.username.strip().lower()
    _locked(username)

    user = store.get_user_by_username(username)
    # On vérifie toujours un hash, même si l'utilisateur n'existe pas (temps de réponse constant).
    ok = security.verify_password(body.password, user["password_hash"] if user else security.dummy_hash())
    if not user or not ok:
        store.register_failure(username[:64])
        raise HTTPException(401, "Identifiants incorrects")

    if not user["face_enrolled"]:
        token = security.create_token(user["id"], user["username"], security.SCOPE_ENROLL, security.ENROLL_TTL)
        return {"step": "enroll", "token": token, "username": user["username"]}

    token = security.create_token(user["id"], user["username"], security.SCOPE_FACE, security.FACE_TTL)
    return {"step": "face", "token": token, "username": user["username"]}


# ── POST /auth/face/enroll  (après inscription) ───────────────
@router.post("/face/enroll")
def face_enroll(body: EnrollBody, claims: dict = Depends(security.require_scope(security.SCOPE_ENROLL))):
    user_id = int(claims["sub"])
    if not store.get_user_by_id(user_id):
        raise HTTPException(401, "Session invalide ou expirée")
    try:
        count = face_auth.save_enrollment(user_id, body.images)
    except face_auth.FaceError as err:
        raise HTTPException(422, str(err))
    except Exception:
        log.exception("Enregistrement du visage impossible")
        raise HTTPException(500, "Erreur du service de reconnaissance faciale")

    store.set_face_enrolled(user_id, True)
    store.revoke(claims["jti"], claims["exp"])
    return {"enrolled": True, "photos": count}


# ── POST /auth/face/verify  (étape 2 : visage) ────────────────
@router.post("/face/verify")
def face_verify(body: VerifyBody, claims: dict = Depends(security.require_scope(security.SCOPE_FACE))):
    user_id = int(claims["sub"])
    username = claims["usr"]
    _locked(username)

    used = store.face_attempts(claims["jti"])
    if used >= MAX_FACE_ATTEMPTS:
        store.revoke(claims["jti"], claims["exp"])
        raise HTTPException(403, "Trop de tentatives. Reconnectez-vous avec votre mot de passe.")

    try:
        matched = face_auth.verify_probe(body.image, user_id)
    except face_auth.FaceError as err:
        # image inutilisable (pas de visage...) : ne consomme pas une tentative
        return {"authenticated": False, "message": str(err), "attempts_left": MAX_FACE_ATTEMPTS - used}
    except Exception:
        log.exception("Vérification faciale impossible")
        raise HTTPException(500, "Erreur du service de reconnaissance faciale")

    if not matched:
        used = store.bump_face_attempts(claims["jti"], claims["exp"])
        store.register_failure(username)
        left = max(0, MAX_FACE_ATTEMPTS - used)
        if left == 0:
            store.revoke(claims["jti"], claims["exp"])
        return {"authenticated": False, "message": "Visage non reconnu", "attempts_left": left}

    # Succès : le jeton de l'étape 1 est consommé, on délivre le jeton d'accès.
    store.revoke(claims["jti"], claims["exp"])
    store.clear_failures(username)
    access = security.create_token(user_id, username, security.SCOPE_ACCESS, security.ACCESS_TTL)
    return {
        "authenticated": True,
        "username": username,
        "access_token": access,
        "expires_in": security.ACCESS_TTL,
    }


# ── GET /auth/me ──────────────────────────────────────────────
@router.get("/me")
def me(claims: dict = Depends(security.require_user)):
    return {"username": claims["usr"], "expires_at": claims["exp"]}


# ── POST /auth/logout ─────────────────────────────────────────
@router.post("/logout")
def logout(claims: dict = Depends(security.require_user)):
    store.revoke(claims["jti"], claims["exp"])
    return {"ok": True}
