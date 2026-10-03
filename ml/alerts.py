import calendar
from datetime import datetime, timedelta

WARN_RATIO = 0.8              # alerte à 80 % du budget
PROJECTION_MARGIN = 1.1       # alerte si la projection dépasse le budget de 10 %
MIN_DAYS_FOR_PROJECTION = 7   # pas de projection avant 7 jours de données
_ORDER = {"danger": 0, "warning": 1, "info": 2}


def build_alerts(db, user_id: int, month: int | None = None,
                 year: int | None = None, today: datetime | None = None) -> dict:
    """
    Alertes proactives pour un mois (par défaut : mois de la dernière transaction) :
      - budget dépassé / proche du plafond,
      - projection de fin de mois au rythme actuel,
      - dépenses inhabituelles récentes (7 derniers jours de données).
    Renvoie aussi le revenu mensuel moyen, pour comparer à la prévision côté dashboard.
    """
    from models.models import Transaction, Budget, User

    txns = db.query(Transaction).filter(Transaction.user_id == user_id).all()
    user = db.query(User).filter(User.id == user_id).first()
    if not txns:
        return {"period": None, "alerts": [], "avg_monthly_income": None}

    today = today or datetime.now()
    last = max(t.date for t in txns)
    month = month or last.month
    year = year or last.year

    days_in = calendar.monthrange(year, month)[1]
    is_current = (year, month) == (today.year, today.month)
    elapsed = today.day if is_current else days_in      # mois passé = terminé
    days_left = max(days_in - elapsed, 0)

    spent: dict[str, float] = {}
    for t in txns:
        if t.amount < 0 and t.date.month == month and t.date.year == year:
            spent[t.category] = spent.get(t.category, 0.0) + abs(t.amount)

    budgets = db.query(Budget).filter(
        Budget.user_id == user_id, Budget.month == month, Budget.year == year
    ).all()

    alerts = []
    for b in budgets:
        limit = b.limit_amount
        if not limit or limit <= 0:
            continue
        used = spent.get(b.category, 0.0)
        ratio = used / limit
        if ratio >= 1:
            alerts.append({
                "level": "danger", "category": b.category,
                "title": f"{b.category} : budget dépassé",
                "detail": f"{used:.0f} / {limit:.0f} TND ({ratio * 100:.0f}%)",
            })
        elif ratio >= WARN_RATIO:
            left = f" — il reste {days_left} jours" if days_left else ""
            alerts.append({
                "level": "warning", "category": b.category,
                "title": f"{b.category} : {ratio * 100:.0f}% du budget utilisé",
                "detail": f"{used:.0f} / {limit:.0f} TND{left}",
            })
        elif days_left > 0 and elapsed >= MIN_DAYS_FOR_PROJECTION:
            projected = used / elapsed * days_in
            if projected > limit * PROJECTION_MARGIN:
                alerts.append({
                    "level": "warning", "category": b.category,
                    "title": f"{b.category} : risque de dépassement",
                    "detail": (f"Au rythme actuel, ~{projected:.0f} TND d'ici fin de mois "
                               f"(budget {limit:.0f})"),
                })

    # Dépenses inhabituelles récentes (par rapport aux données, pas à l'horloge)
    cutoff = last - timedelta(days=7)
    recent = sorted(
        (t for t in txns if t.is_anomaly and t.amount < 0 and t.date >= cutoff),
        key=lambda t: t.date, reverse=True)[:3]
    for t in recent:
        alerts.append({
            "level": "warning", "category": t.category,
            "title": "Dépense inhabituelle récente",
            "detail": f"{t.description} — {abs(t.amount):.0f} TND ({t.category}), "
                      f"le {t.date:%d/%m}",
        })

    alerts.sort(key=lambda a: _ORDER[a["level"]])

    # Revenu mensuel moyen : mois précédents complets (le dernier mois peut être partiel)
    income: dict[tuple, float] = {}
    for t in txns:
        if t.amount > 0:
            k = (t.date.year, t.date.month)
            income[k] = income.get(k, 0.0) + t.amount
    avg_income = None
    if income:
        keys = sorted(income)
        if len(keys) > 1:
            keys = keys[:-1]
        keys = keys[-6:]
        avg_income = round(sum(income[k] for k in keys) / len(keys), 2)
    elif user and user.monthly_income:
        avg_income = float(user.monthly_income)

    return {"period": f"{year}-{month:02d}", "alerts": alerts,
            "avg_monthly_income": avg_income}
