"""Tests du flux complet. DeepFace est remplacé par des fonctions simulées (pas besoin de TensorFlow).

Lancer :  cd backend && pip install pytest httpx && pytest -q
"""
import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["FINANCEIQ_AUTH_DB"] = os.path.join(_tmp, "test.db")
os.environ["FINANCEIQ_FACES_DIR"] = os.path.join(_tmp, "faces")
os.environ["FINANCEIQ_JWT_SECRET"] = "x" * 64

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import base64  # noqa: E402

import pytest  # noqa: E402
from fastapi import Depends, FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from auth import face_auth, security  # noqa: E402
from auth.routes import router  # noqa: E402

app = FastAPI()
app.include_router(router)


@app.get("/private/data", dependencies=[Depends(security.require_user)])
def private():
    return {"secret": 42}


client = TestClient(app)
IMG = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"0" * 64).decode()
GOOD_PW = "Secure-pass-2026"

# Simulation de DeepFace
state = {"face_present": True, "distance": 0.2}


def fake_assert_face(path):
    if not state["face_present"]:
        raise face_auth.FaceError(face_auth.NO_FACE_MSG)


def fake_verify_pair(a, b):
    return state["distance"]


@pytest.fixture(autouse=True)
def patch_face(monkeypatch):
    monkeypatch.setattr(face_auth, "assert_face", fake_assert_face)
    monkeypatch.setattr(face_auth, "_verify_pair", fake_verify_pair)
    state.update(face_present=True, distance=0.2)


def H(token):
    return {"Authorization": f"Bearer {token}"}


def make_user(name, enroll=True):
    r = client.post("/auth/signup", json={"username": name, "email": f"{name}@x.io", "password": GOOD_PW})
    assert r.status_code == 201, r.text
    token = r.json()["token"]
    if enroll:
        r = client.post("/auth/face/enroll", json={"images": [IMG] * 3}, headers=H(token))
        assert r.status_code == 200, r.text
    return token


def face_token(name):
    r = client.post("/auth/login", json={"username": name, "password": GOOD_PW})
    assert r.status_code == 200 and r.json()["step"] == "face", r.text
    return r.json()["token"]


# ── Inscription ───────────────────────────────────────────────
def test_signup_validation():
    bad = lambda **kw: client.post("/auth/signup", json={"username": "okname", "email": "a@b.co", "password": GOOD_PW, **kw})
    assert bad(password="short1").status_code == 422
    assert bad(password="onlyletterspassword").status_code == 422
    assert bad(password="okname-12345").status_code == 422          # contient le nom d'utilisateur
    assert bad(email="pas-un-email").status_code == 422
    assert bad(username="a/../b").status_code == 422                # traversée de chemin
    assert bad(username="ab").status_code == 422


def test_signup_duplicate_and_case_insensitive():
    make_user("dupuser", enroll=False)
    r = client.post("/auth/signup", json={"username": "DupUser", "email": "other@x.io", "password": GOOD_PW})
    assert r.status_code == 409


# ── Visage : enregistrement ───────────────────────────────────
def test_enroll_needs_enough_valid_photos():
    token = make_user("enrollguy", enroll=False)
    assert client.post("/auth/face/enroll", json={"images": [IMG] * 2}, headers=H(token)).status_code == 422
    state["face_present"] = False
    r = client.post("/auth/face/enroll", json={"images": [IMG] * 3}, headers=H(token))
    assert r.status_code == 422 and "visage" in r.json()["detail"].lower()
    state["face_present"] = True
    assert client.post("/auth/face/enroll", json={"images": ["pas-du-base64!!"] * 3}, headers=H(token)).status_code == 422


def test_enroll_token_is_single_use():
    token = make_user("once")
    assert client.post("/auth/face/enroll", json={"images": [IMG] * 3}, headers=H(token)).status_code == 401


def test_login_before_enrollment_goes_to_enroll_step():
    make_user("late", enroll=False)
    r = client.post("/auth/login", json={"username": "late", "password": GOOD_PW})
    assert r.json()["step"] == "enroll"


# ── Connexion en 2 étapes ─────────────────────────────────────
def test_full_login_and_logout():
    make_user("alice")
    assert client.get("/private/data").status_code == 401           # sans jeton

    ft = face_token("alice")
    assert client.get("/private/data", headers=H(ft)).status_code == 401   # jeton étape 1 ≠ accès

    r = client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft))
    assert r.json()["authenticated"] is True
    access = r.json()["access_token"]

    assert client.get("/private/data", headers=H(access)).json() == {"secret": 42}
    assert client.get("/auth/me", headers=H(access)).json()["username"] == "alice"

    assert client.post("/auth/logout", headers=H(access)).status_code == 200
    assert client.get("/private/data", headers=H(access)).status_code == 401   # jeton révoqué
    assert client.post("/auth/logout", headers=H(access)).status_code == 401


def test_face_token_cannot_be_replayed_after_success():
    make_user("bob")
    ft = face_token("bob")
    assert client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).json()["authenticated"]
    assert client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).status_code == 401


def test_wrong_password_is_generic_and_locks_after_5():
    make_user("carol")
    for _ in range(5):
        r = client.post("/auth/login", json={"username": "carol", "password": "wrong-password-1"})
        assert r.status_code == 401 and r.json()["detail"] == "Identifiants incorrects"
    r = client.post("/auth/login", json={"username": "carol", "password": GOOD_PW})   # même le bon mot de passe
    assert r.status_code == 429


def test_unknown_user_gets_same_error():
    r = client.post("/auth/login", json={"username": "ghost", "password": "whatever-123"})
    assert r.status_code == 401 and r.json()["detail"] == "Identifiants incorrects"


# ── Échecs du visage ──────────────────────────────────────────
def test_face_mismatch_counts_attempts_then_blocks():
    make_user("dave")
    ft = face_token("dave")
    state["distance"] = 0.9
    lefts = []
    for _ in range(4):
        r = client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).json()
        assert r["authenticated"] is False
        lefts.append(r["attempts_left"])
    assert lefts == [4, 3, 2, 1]
    r = client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).json()
    assert r["attempts_left"] == 0
    assert client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).status_code == 401  # jeton révoqué


def test_no_face_does_not_burn_attempts():
    make_user("erin")
    ft = face_token("erin")
    state["face_present"] = False
    r = client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).json()
    assert r["authenticated"] is False and r["attempts_left"] == 5


def test_face_failures_lock_the_account():
    make_user("frank")
    state["distance"] = 0.9
    for _ in range(5):
        ft = face_token("frank") if client.post("/auth/login", json={"username": "frank", "password": GOOD_PW}).status_code == 200 else None
        if ft is None:
            break
        client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft))
    assert client.post("/auth/login", json={"username": "frank", "password": GOOD_PW}).status_code == 429


def test_majority_rule():
    """3 photos enregistrées : il faut au moins 2 correspondances."""
    make_user("gina")
    ft = face_token("gina")
    calls = iter([0.2, 0.9, 0.9])
    face_auth._verify_pair = lambda a, b: next(calls)
    assert client.post("/auth/face/verify", json={"image": IMG}, headers=H(ft)).json()["authenticated"] is False


# ── Jetons ────────────────────────────────────────────────────
def test_scope_confusion_and_garbage_tokens():
    enroll = make_user("hank", enroll=False)
    assert client.post("/auth/face/verify", json={"image": IMG}, headers=H(enroll)).status_code == 401
    assert client.get("/auth/me", headers=H(enroll)).status_code == 401
    assert client.get("/auth/me", headers=H("not.a.jwt")).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401


def test_expired_token_rejected():
    make_user("ivy")
    expired = security.create_token(1, "ivy", security.SCOPE_ACCESS, -10)
    assert client.get("/auth/me", headers=H(expired)).status_code == 401


def test_password_hash_roundtrip():
    h = security.hash_password(GOOD_PW)
    assert h.startswith("scrypt$") and GOOD_PW not in h
    assert security.verify_password(GOOD_PW, h) and not security.verify_password("autre-mdp-123", h)
    assert security.hash_password(GOOD_PW) != h        # sel aléatoire
