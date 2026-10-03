import math
from datetime import datetime

import pandas as pd


def suggest_budgets(db, user_id: int, months: int = 3, buffer: float = 1.10,
                    month: int | None = None, year: int | None = None,
                    apply: bool = False) -> dict:
    """
    Budget par catégorie = moyenne mensuelle réelle des `months` derniers mois
    complets x `buffer` (10 % de marge), arrondie au multiple de 5 supérieur.
    Les mois sans dépense dans une catégorie comptent comme 0.
    apply=True : écrit (upsert) les budgets pour month/year (défaut : mois courant).
    """
    from models.models import Transaction, Budget

    txns = db.query(Transaction).filter(
        Transaction.user_id == user_id, Transaction.amount < 0,
        (Transaction.is_anomaly == False) |  # noqa: E712
        (Transaction.is_anomaly.is_(None)),
    ).all()
    if not txns:
        return {"error": "Pas de transactions pour cet utilisateur."}

    df = pd.DataFrame([{
        "date": t.date, "amount": abs(t.amount), "category": t.category
    } for t in txns])
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    df = df[df["category"] != "Uncategorized"]
    if df.empty:
        return {"error": "Toutes les transactions sont 'Uncategorized'."}

    first, last = df["date"].min(), df["date"].max()

    # Dernier mois COMPLET (si le mois de la dernière transaction est en cours, on l'exclut)
    last_period = last.to_period("M")
    if last != last_period.end_time.normalize():
        last_period -= 1
    periods = [p for p in pd.period_range(end=last_period, periods=months, freq="M")
               if p >= first.to_period("M")]
    if not periods:
        return {"error": "Pas assez d'historique (aucun mois complet)."}

    df["period"] = df["date"].dt.to_period("M")
    df = df[df["period"].isin(periods)]
    monthly = (df.pivot_table(index="period", columns="category",
                              values="amount", aggfunc="sum")
                 .reindex(periods).fillna(0.0))

    suggestions = {}
    for category, avg in monthly.median().items():
        if avg > 0:
            suggestions[category] = float(math.ceil(avg * buffer / 5) * 5)

    if apply:
        now = datetime.now()
        m, y = month or now.month, year or now.year
        for category, limit in suggestions.items():
            row = db.query(Budget).filter(
                Budget.user_id == user_id, Budget.category == category,
                Budget.month == m, Budget.year == y).first()
            if row:
                row.limit_amount = limit
            else:
                db.add(Budget(user_id=user_id, category=category,
                              limit_amount=limit, month=m, year=y))
        db.commit()

    return {
        "user_id": user_id,
        "based_on_months": [str(p) for p in periods],
        "buffer": buffer,
        "applied": apply,
        "suggested_budgets": dict(sorted(suggestions.items(),
                                         key=lambda kv: -kv[1])),
    }
