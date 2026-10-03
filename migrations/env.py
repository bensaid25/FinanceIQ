"""Environnement Alembic : l'URL vient de db.py (variable DATABASE_URL), le schéma de models/models.py."""
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# Racine du projet (là où se trouvent db.py et models/) dans le chemin d'import
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import db as app_db            # noqa: E402
import models.models           # noqa: E402,F401  (enregistre toutes les tables)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# configparser interprète "%" : on le double pour les mots de passe qui en contiennent
config.set_main_option("sqlalchemy.url", app_db.DATABASE_URL.replace("%", "%%"))
target_metadata = app_db.Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=app_db.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
