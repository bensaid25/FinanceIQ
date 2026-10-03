"""Isolation des données entre utilisateurs.

Lancer SEUL (il fixe DATABASE_URL avant l'import de l'application) :
    pip install pytest httpx
    pytest tests/test_isolation.py -q
Base de test = fichier SQLite temporaire : ni ta base de développement ni PostgreSQL ne sont touchées.
"""
import os
import tempfile

_tmp = tempfile.mkdtemp().replace("\\", "/")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["FINANCEIQ_JWT_SECRET"] = "t" * 40
os.environ.pop("FINANCEIQ_ADMINS", None)

import pytest                                   # noqa: E402
from fastapi.testclient import TestClient       # noqa: E402

import db as app_db                             # noqa: E402
import models.models                            # noqa: E402,F401
from auth import security, store                # noqa: E402


@pytest.fixture(scope="module")
def client():
    app_db.Base.metadata.create_all(app_db.engine)
    from main import app
    return TestClient(app)


def make_user(name: str):
    """Crée un compte et un jeton d'accès directement (sans passer par le visage)."""
    uid = store.create_user(name, f"{name}@test.io", security.hash_password("motdepasse123"))
    token = security.create_token(uid, name, security.SCOPE_ACCESS, 600)
    return uid, {"Authorization": f"Bearer {token}"}


def test_routes_de_donnees_exigent_un_jeton(client):
    for url in ("/transactions/", "/budgets/", "/ml/anomalies", "/ml/forecast", "/users/me"):
        assert client.get(url).status_code == 401, url


def test_transactions_isolees(client):
    _, alice = make_user("alice")
    _, bob = make_user("bob")
    r = client.post("/transactions/quick", headers=alice,
                    json={"description": "Loyer", "amount": 500, "category": "Bills"})
    assert r.status_code == 200, r.text
    assert len(client.get("/transactions/", headers=alice).json()) == 1
    assert client.get("/transactions/", headers=bob).json() == []


def test_budgets_isoles(client):
    _, carol = make_user("carol")
    _, dave = make_user("dave")
    body = {"category": "Food", "limit_amount": 300, "month": 10, "year": 2026}
    assert client.post("/budgets/", headers=carol, json=body).status_code == 200
    assert len(client.get("/budgets/", headers=carol).json()) == 1
    assert client.get("/budgets/", headers=dave).json() == []


def test_ml_utilise_l_utilisateur_du_jeton(client, monkeypatch):
    """Même si on passe ?user_id=<autre>, la route travaille sur l'utilisateur du jeton."""
    from ml import anomaly
    seen = {}

    def fake(db, user_id=None):
        seen["uid"] = user_id
        return []

    monkeypatch.setattr(anomaly, "get_anomalies", fake)
    eve_id, _ = make_user("eve")
    frank_id, frank = make_user("frank")
    assert client.get(f"/ml/anomalies?user_id={eve_id}", headers=frank).status_code == 200
    assert seen["uid"] == frank_id


def test_profil_et_routes_admin(client):
    gina_id, gina = make_user("gina")
    _, hugo = make_user("hugo")
    assert client.get("/users/me", headers=gina).json()["id"] == gina_id
    assert client.get(f"/users/{gina_id}", headers=hugo).status_code in (404, 405)  # route supprimée
    assert client.post("/ml/train", headers=hugo).status_code == 403                # pas admin


def test_doublon_de_compte():
    make_user("ivan")
    with pytest.raises(store.DuplicateUser):
        store.create_user("ivan", "autre@test.io", "x")
