"""Exécuté par pytest avant tout test : base de test isolée, racine du projet dans le chemin d'import."""
import os
import tempfile

_tmp = tempfile.mkdtemp().replace("\\", "/")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"   # jamais PostgreSQL pendant les tests
os.environ["FINANCEIQ_JWT_SECRET"] = "t" * 40
os.environ.pop("FINANCEIQ_ADMINS", None)