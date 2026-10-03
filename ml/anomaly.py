import numpy as np
import pandas as pd

MIN_SAMPLES = 5          # min. dépenses par catégorie pour juger
DEFAULT_THRESHOLD = 3.5  # seuil standard du "modified Z-score" (Iglewicz & Hoaglin)
DEFAULT_MIN_AMOUNT = 20.0  # en dessous, une dépense n'est jamais signalée (ex. un café à 7)


def _robust_z(values: np.ndarray, ref: np.ndarray | None = None) -> np.ndarray:
    """
    Modified Z-score sur log1p(montant) :
      - log1p : les montants sont très asymétriques (queue à droite),
        le log les rend proches d'une loi normale ;
      - médiane / MAD : un gros outlier ne fausse plus la moyenne ni l'écart-type
        (avec mean/std, l'outlier "se cache" lui-même en gonflant std).
    """
    x = np.log1p(values)
    r = x if ref is None else np.log1p(ref)   # ref : population de référence
    med = np.median(r)
    mad = np.median(np.abs(r - med))
    if mad > 0:
        return 0.6745 * (x - med) / mad
    # MAD = 0 (plus de la moitié des valeurs identiques) : repli sur l'écart moyen absolu
    mean_ad = np.mean(np.abs(r - med))
    if mean_ad > 0:
        return (x - med) / (1.253314 * mean_ad)
    return np.zeros_like(x)


def detect_anomalies(db, z_threshold: float = DEFAULT_THRESHOLD,
                     user_id: int | None = None,
                     high_only: bool = True,
                     min_amount: float = DEFAULT_MIN_AMOUNT) -> dict:
    """
    Détecte les dépenses anormales par catégorie (log + médiane/MAD).
    Si user_id est fourni, seules ses transactions sont analysées et
    seuls ses flags sont réinitialisés.
    high_only=True : on ne flag que les dépenses anormalement HAUTES.
    """
    from models.models import Transaction

    query = db.query(Transaction).filter(Transaction.amount < 0)
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)
    transactions = query.all()

    if not transactions:
        return {"error": "Pas de transactions à analyser."}

    df = pd.DataFrame([{
        "id":          t.id,
        "amount":      abs(t.amount),
        "category":    t.category,
        "description": t.description,
        "date":        t.date,
    } for t in transactions])

    anomalies_found = []
    flagged_ids = []

    # Baseline = le même marchand s'il a assez d'historique (loyer, assurance,
    # abonnements : un paiement récurrent n'est pas une anomalie) ;
    # sinon les marchands rares de la même catégorie sont comparés entre eux.
    df["merchant"] = df["description"].astype(str).str.strip().str.lower()
    n_same = df.groupby(["category", "merchant"])["id"].transform("count")
    df["baseline"] = np.where(
        n_same >= MIN_SAMPLES,
        df["category"].astype(str) + "|" + df["merchant"],
        df["category"].astype(str) + "|*rare*",
    )

    for baseline, cat_df in df.groupby("baseline"):
        cat_df = cat_df.copy()
        amounts = cat_df["amount"].to_numpy(dtype=float)

        if baseline.endswith("|*rare*"):
            # Marchands rares : comparés à TOUTE la catégorie (même s'ils sont peu nombreux)
            cat_all = df.loc[df["category"] == cat_df["category"].iloc[0],
                             "amount"].to_numpy(dtype=float)
            if len(cat_all) < MIN_SAMPLES:
                continue
            cat_df["z_score"] = _robust_z(amounts, ref=cat_all)
        else:
            if len(cat_df) < MIN_SAMPLES:
                continue
            cat_df["z_score"] = _robust_z(amounts)

        mask = cat_df["z_score"] > z_threshold if high_only \
            else cat_df["z_score"].abs() > z_threshold
        mask = mask & (cat_df["amount"] >= min_amount)

        for _, row in cat_df[mask].iterrows():
            anomalies_found.append({
                "id":          int(row["id"]),
                "description": row["description"],
                "category":    row["category"],
                "amount":      round(float(row["amount"]), 2),
                "z_score":     round(float(row["z_score"]), 2),
                "date":        str(row["date"]),
            })
            flagged_ids.append(int(row["id"]))

    # Reset propre des flags (limité à l'utilisateur)
    reset_query = db.query(Transaction)
    if user_id is not None:
        reset_query = reset_query.filter(Transaction.user_id == user_id)
    reset_query.update({"is_anomaly": False}, synchronize_session=False)

    if flagged_ids:
        db.query(Transaction).filter(
            Transaction.id.in_(flagged_ids)
        ).update({"is_anomaly": True}, synchronize_session=False)

    db.commit()

    return {
        "user_id":         user_id,
        "method":          "log1p + median/MAD, baseline par marchand",
        "total_scanned":   len(transactions),
        "anomalies_found": len(anomalies_found),
        "z_threshold":     z_threshold,
        "anomalies":       sorted(anomalies_found,
                                  key=lambda x: abs(x["z_score"]),
                                  reverse=True),
    }


def get_anomalies(db, user_id: int | None = None) -> list:
    """Retourne les transactions déjà flaggées is_anomaly = True."""
    from models.models import Transaction

    query = db.query(Transaction).filter(Transaction.is_anomaly == True)  # noqa: E712
    if user_id is not None:
        query = query.filter(Transaction.user_id == user_id)

    return [{
        "id":          t.id,
        "description": t.description,
        "category":    t.category,
        "amount":      round(abs(t.amount), 2),
        "date":        str(t.date),
    } for t in query.all()]
