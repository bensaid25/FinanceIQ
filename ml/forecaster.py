import logging
import warnings
from datetime import datetime

import pandas as pd
from prophet import Prophet

warnings.filterwarnings("ignore")
logging.getLogger("cmdstanpy").setLevel(logging.ERROR)
logging.getLogger("prophet").setLevel(logging.ERROR)

MIN_HISTORY_DAYS = 28   # en dessous : pas assez d'historique pour Prophet
MIN_ACTIVE_DAYS = 8     # jours avec au moins une dépense dans la catégorie


def _get_transactions(db, user_id: int | None = None) -> pd.DataFrame:
    """Charge les dépenses depuis la DB (celles de user_id si fourni)."""
    from models.models import Transaction
    query = db.query(Transaction).filter(Transaction.amount < 0)
    # Les achats exceptionnels déjà flaggés (ex. 9 200 de travaux) faussent la tendance
    query = query.filter((Transaction.is_anomaly == False) |  # noqa: E712
                         (Transaction.is_anomaly.is_(None)))
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    transactions = query.all()

    if not transactions:
        return pd.DataFrame()

    df = pd.DataFrame([{
        "date":     t.date,
        "amount":   abs(t.amount),
        "category": t.category,
    } for t in transactions])
    df["date"] = pd.to_datetime(df["date"]).dt.normalize()
    return df


def forecast_next_month(db, user_id: int | None = None) -> dict:
    """
    Prédit les dépenses du mois calendaire qui suit la dernière transaction,
    par catégorie. Série journalière complétée avec des 0 (jours sans dépense),
    sinon Prophet croit que la catégorie est dépensée tous les jours.
    """
    df = _get_transactions(db, user_id)
    if df.empty:
        return {"error": "Pas assez de données pour faire une prévision."}

    first, last = df["date"].min(), df["date"].max()

    # Mois cible complet : du 1er au dernier jour du mois suivant
    next_start = last + pd.offsets.MonthBegin(1)
    next_end = next_start + pd.offsets.MonthEnd(0)
    horizon = (next_end - last).days
    n_days = (next_end - next_start).days + 1

    # Même axe temporel pour toutes les catégories (zero-fill)
    full_index = pd.date_range(first, last, freq="D")

    results, methods = {}, {}

    for category in df["category"].unique():
        daily = (
            df[df["category"] == category]
            .groupby("date")["amount"].sum()
            .reindex(full_index, fill_value=0.0)
            .rename_axis("ds")
            .reset_index(name="y")
        )
        active_days = int((daily["y"] > 0).sum())

        if active_days < 2:
            results[category], methods[category] = None, "insufficient_data"
            continue

        # Peu d'historique : moyenne journalière x nb de jours du mois cible
        if len(daily) < MIN_HISTORY_DAYS or active_days < MIN_ACTIVE_DAYS:
            predicted = float(daily["y"].mean()) * n_days
            results[category] = round(predicted, 2)
            methods[category] = "run_rate"
            continue

        try:
            model = Prophet(
                yearly_seasonality=False,
                weekly_seasonality=True,
                daily_seasonality=False,
                interval_width=0.8,
            )
            model.fit(daily)
            future = model.make_future_dataframe(periods=horizon)
            forecast = model.predict(future)

            month_fc = forecast[(forecast["ds"] >= next_start) &
                                (forecast["ds"] <= next_end)]
            # Une dépense ne peut pas être négative : clip jour par jour
            predicted = float(month_fc["yhat"].clip(lower=0).sum())
            results[category] = round(predicted, 2)
            methods[category] = "prophet"
        except Exception:
            predicted = float(daily["y"].mean()) * n_days
            results[category] = round(predicted, 2)
            methods[category] = "run_rate (prophet failed)"

    total = round(sum(v for v in results.values() if v is not None), 2)

    return {
        "user_id":         user_id,
        "forecast_month":  _next_month_label(last),
        "total_predicted": total,
        "by_category":     results,
        "methods":         methods,
    }


def _next_month_label(reference_date=None) -> str:
    months_fr = [
        "", "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ]
    ref = reference_date if reference_date is not None else datetime.now()
    next_m = ref.month % 12 + 1
    next_y = ref.year + (1 if ref.month == 12 else 0)
    return f"{months_fr[next_m]} {next_y}"
