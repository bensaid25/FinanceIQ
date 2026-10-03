import pickle
import os
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report

MODEL_PATH = "ml/categorizer_model.pkl"

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


def _build_training_data():
    """Construit X (descriptions) et y (catégories) depuis CATEGORIES."""
    X, y = [], []
    for category, descriptions in CATEGORIES.items():
        for desc in descriptions:
            X.append(desc)
            y.append(category)
            # Augmentation légère : lowercase + variation
            X.append(desc.lower())
            y.append(category)
    return X, y


def train(db_transactions: list[dict] | None = None):
    """
    Entraîne le modèle TF-IDF + Logistic Regression.
    Si db_transactions est fourni (liste de dicts {description, category}),
    combine avec les données statiques pour un meilleur modèle.
    """
    X, y = _build_training_data()

    # Ajoute les vraies transactions de la DB si disponibles
    if db_transactions:
        for t in db_transactions:
            if t.get("category") and t["category"] != "Uncategorized":
                X.append(t["description"])
                y.append(t["category"])

    pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=(1, 2),
            min_df=1,
            analyzer="word",
            lowercase=True
        )),
        ("clf", LogisticRegression(
            max_iter=1000,
            C=1.0,
            random_state=42
        ))
    ])

    # Évalue si assez de données
    if len(set(y)) > 1 and len(X) > 10:
        class_counts = Counter(y)
        can_stratify = min(class_counts.values()) >= 2
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42,
            stratify=y if can_stratify else None
        )
        pipeline.fit(X_train, y_train)
        y_pred = pipeline.predict(X_test)
        report = classification_report(y_test, y_pred, output_dict=True)
        accuracy = round(report["accuracy"] * 100, 1)
    else:
        pipeline.fit(X, y)
        accuracy = None

    # Sauvegarde le modèle
    os.makedirs("ml", exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(pipeline, f)

    return accuracy


def load_model():
    """Charge le modèle depuis le disque. L'entraîne si absent."""
    if not os.path.exists(MODEL_PATH):
        train()
    with open(MODEL_PATH, "rb") as f:
        return pickle.load(f)


def predict(description: str) -> dict:
    """
    Prédit la catégorie d'une description de transaction.
    Retourne la catégorie prédite + le score de confiance.
    """
    model = load_model()
    category = model.predict([description])[0]
    proba = model.predict_proba([description])[0]
    confidence = round(float(max(proba)) * 100, 1)
    return {
        "description": description,
        "predicted_category": category,
        "confidence": confidence
    }


def retrain_from_db(db):
    """
    Ré-entraîne le modèle en utilisant toutes les transactions
    existantes dans la base de données SQLite.
    """
    from models.models import Transaction
    transactions = db.query(Transaction).filter(
        Transaction.category != "Uncategorized",
        Transaction.amount < 0
    ).all()
    db_data = [
        {"description": t.description, "category": t.category}
        for t in transactions
    ]
    accuracy = train(db_transactions=db_data)
    return accuracy
