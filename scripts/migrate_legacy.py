"""Copie les anciennes bases SQLite (finance.db + auth.db) vers la base unifiée.

Prérequis : la base cible existe et son schéma est créé (`alembic upgrade head`).
La cible est celle de la variable DATABASE_URL (PostgreSQL ou SQLite).

    python scripts/migrate_legacy.py --finance finance.db --auth auth.db --owner chadha

- Tous les comptes de auth.db sont copiés AVEC LEUR ID (les photos auth/faces/<id>/ restent valides).
- Les transactions et budgets de l'ancien utilisateur de finance.db (--legacy-user-id, 1 par défaut)
  sont rattachés au compte --owner. Les données d'autres anciens utilisateurs ne sont pas copiées.
- Les anciens jetons révoqués et compteurs d'échecs ne sont pas migrés (éphémères).
- Refuse de s'exécuter si la base cible contient déjà des utilisateurs.
"""
import argparse
import os
import sqlite3
import sys
from datetime import datetime

from sqlalchemy import func, insert, select, text

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db as app_db                                     # noqa: E402
from models.models import Budget, Transaction, User     # noqa: E402


def read_table(path: str, table: str) -> list:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(f"SELECT * FROM {table}")]
    finally:
        conn.close()


def to_dt(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return datetime.utcfromtimestamp(value)
    return datetime.fromisoformat(str(value))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--finance", default="finance.db")
    ap.add_argument("--auth", default="auth.db")
    ap.add_argument("--owner", required=True, help="nom d'utilisateur qui reçoit les anciennes données")
    ap.add_argument("--legacy-user-id", type=int, default=1,
                    help="id de l'utilisateur dans l'ancien finance.db (défaut : 1)")
    args = ap.parse_args()

    for path in (args.finance, args.auth):
        if not os.path.exists(path):
            sys.exit(f"Fichier introuvable : {path}")

    auth_users = read_table(args.auth, "users")
    owner = next((u for u in auth_users if u["username"].lower() == args.owner.strip().lower()), None)
    if owner is None:
        sys.exit(f"Compte '{args.owner}' introuvable dans {args.auth}. "
                 f"Comptes : {[u['username'] for u in auth_users]}")

    legacy_users = {u["id"]: u for u in read_table(args.finance, "users")}
    legacy = legacy_users.get(args.legacy_user_id)
    if legacy is None:
        sys.exit(f"Utilisateur {args.legacy_user_id} introuvable dans {args.finance} "
                 f"(ids présents : {sorted(legacy_users)})")

    txns = [t for t in read_table(args.finance, "transactions") if t["user_id"] == args.legacy_user_id]
    old_budgets = [b for b in read_table(args.finance, "budgets") if b["user_id"] == args.legacy_user_id]
    ignored_txns = len(read_table(args.finance, "transactions")) - len(txns)

    with app_db.engine.connect() as conn:
        if conn.execute(select(func.count()).select_from(User)).scalar_one() > 0:
            sys.exit("La base cible contient déjà des utilisateurs : migration annulée, rien n'a été copié.")

    user_rows = []
    for u in auth_users:
        is_owner = u["id"] == owner["id"]
        user_rows.append({
            "id": u["id"],
            "username": u["username"].lower(),
            "email": u["email"].lower(),
            "password_hash": u["password_hash"],
            "face_enrolled": bool(u["face_enrolled"]),
            "name": (legacy.get("name") if is_owner else None) or u["username"],
            "monthly_income": float(legacy.get("monthly_income") or 0) if is_owner else 0,
            "created_at": datetime.utcfromtimestamp(u["created_at"]),
        })

    txn_rows = [{
        "user_id": owner["id"],
        "amount": float(t["amount"]),
        "description": t["description"],
        "category": t.get("category") or "Uncategorized",
        "date": to_dt(t["date"]),
        "is_anomaly": bool(t.get("is_anomaly")),
        "source": t.get("source") or "manual",
        "created_at": to_dt(t.get("created_at")) or datetime.utcnow(),
    } for t in txns]

    # Un seul budget par (catégorie, mois, année) : le dernier gagne
    unique_budgets = {}
    for b in old_budgets:
        unique_budgets[(b["category"], b["month"], b["year"])] = float(b["limit_amount"])
    budget_rows = [{
        "user_id": owner["id"], "category": cat, "month": m, "year": y, "limit_amount": limit,
    } for (cat, m, y), limit in unique_budgets.items()]

    with app_db.engine.begin() as conn:      # une seule transaction : tout ou rien
        conn.execute(insert(User.__table__), user_rows)
        if txn_rows:
            conn.execute(insert(Transaction.__table__), txn_rows)
        if budget_rows:
            conn.execute(insert(Budget.__table__), budget_rows)
        if conn.dialect.name == "postgresql":
            # les ids des comptes ont été insérés à la main : on remet la séquence à jour
            conn.execute(text(
                "SELECT setval(pg_get_serial_sequence('users', 'id'), "
                "(SELECT COALESCE(MAX(id), 1) FROM users))"
            ))

    names = ", ".join("%s (id %s)" % (u["username"], u["id"]) for u in user_rows)
    print(f"{len(user_rows)} compte(s) copié(s) : {names}")
    print(f"{len(txn_rows)} transactions et {len(budget_rows)} budgets rattachés à "
          f"'{owner['username']}' (id {owner['id']}).")
    if ignored_txns:
        print(f"{ignored_txns} transactions d'autres anciens utilisateurs NON copiées.")
    print("Vérifie ensuite : photos du visage dans auth/faces/<id>/ inchangées (ids conservés).")


if __name__ == "__main__":
    main()
