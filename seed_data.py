"""Données de démonstration pour un compte EXISTANT (créé via l'écran d'inscription).

    python seed_data.py --username chadha             # budgets du mois + ~3 mois de transactions
    python seed_data.py --username chadha --replace   # supprime d'abord les anciennes données de démo

Écrit directement en base (DATABASE_URL) : plus besoin de jeton ni d'API qui tourne.
Les transactions de démo portent source="seed" : --replace ne touche jamais aux autres.
"""
import argparse
import random
from datetime import datetime, timedelta

from db import SessionLocal
from models.models import Budget, Transaction, User

SOURCE = "seed"

CATEGORIES = {
    "Food":          ["Carrefour", "Monoprix", "McDonald's", "Pizza Hut",
                      "Local restaurant", "Bakery", "Supermarket"],
    "Transport":     ["Uber", "Bolt", "Bus ticket", "Train ticket",
                      "Taxi", "Metro card top-up"],
    "Bills":         ["Electricity bill", "Water bill", "Internet bill",
                      "Phone bill", "Rent payment"],
    "Entertainment": ["Netflix", "Spotify", "Cinema ticket",
                      "Steam game purchase", "YouTube Premium"],
    "Health":        ["Pharmacy", "Doctor visit", "Gym membership",
                      "Dental check-up"],
    "Shopping":      ["Zara", "H&M", "Amazon order", "IKEA",
                      "Electronics store"],
    "Education":     ["Udemy course", "Book purchase", "University fees",
                      "Printing"],
}

BUDGET_LIMITS = {
    "Food": 300,
    "Transport": 100,
    "Bills": 250,
    "Entertainment": 80,
    "Health": 100,
    "Shopping": 150,
    "Education": 120,
}


def seed(username: str, replace: bool, run_ml: bool) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username.strip().lower()).first()
        if not user:
            raise SystemExit(f"Compte '{username}' introuvable : crée-le d'abord via l'inscription.")
        print(f"✅ Compte : {user.username} (id {user.id})")

        if replace:
            n = db.query(Transaction).filter(
                Transaction.user_id == user.id, Transaction.source == SOURCE
            ).delete()
            print(f"🗑️  {n} anciennes transactions de démo supprimées")

        # 1. Budgets du mois courant (mis à jour s'ils existent déjà)
        now = datetime.now()
        for category, limit in BUDGET_LIMITS.items():
            budget = db.query(Budget).filter_by(
                user_id=user.id, category=category, month=now.month, year=now.year
            ).first()
            if budget:
                budget.limit_amount = limit
            else:
                db.add(Budget(user_id=user.id, category=category, limit_amount=limit,
                              month=now.month, year=now.year))
        print("✅ Budgets définis")

        # 2. Transactions des 3 derniers mois (dépenses = montants négatifs)
        total = 0
        for months_ago in range(3):
            ref = datetime(now.year, now.month, 1) - timedelta(days=30 * months_ago)
            for _ in range(random.randint(25, 40)):
                category = random.choice(list(CATEGORIES.keys()))
                description = random.choice(CATEGORIES[category])
                date = datetime(ref.year, ref.month, random.randint(1, 28),
                                random.randint(8, 21), random.randint(0, 59))
                amount = -round(random.uniform(5, 150), 2)
                if random.random() < 0.04:          # dépense exceptionnelle (anomalie)
                    amount = -round(random.uniform(300, 800), 2)
                db.add(Transaction(
                    user_id=user.id, amount=amount, description=description,
                    category=category, date=date, is_anomaly=False, source=SOURCE,
                ))
                total += 1
        db.commit()
        print(f"✅ {total} transactions générées sur 3 mois")

        if run_ml:
            from ml.anomaly import detect_anomalies
            res = detect_anomalies(db, user_id=user.id)
            print(f"✅ Anomalies détectées : {res.get('anomalies_found')}")
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--replace", action="store_true")
    ap.add_argument("--run-ml", action="store_true", help="lance la détection d'anomalies ensuite")
    args = ap.parse_args()
    seed(args.username, args.replace, args.run_ml)
