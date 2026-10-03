# Database & Docker

How SmartFinanceDashboard stores its data (PostgreSQL), keeps each user's data private, and runs in containers.

## 1. Overview

| Layer | Technology |
|---|---|
| Database | PostgreSQL 16 (SQLite as a zero-setup fallback for local development) |
| ORM / migrations | SQLAlchemy 2 + Alembic |
| Backend | FastAPI (Python 3.11), served by uvicorn |
| Frontend | React (Create React App), built to static files and served by nginx |
| Orchestration | Docker Compose: `db`, `backend`, `frontend` |

```
browser ──► nginx :3000 ──► /          React app (static files)
                       └──► /api/*     FastAPI :8000 ──► PostgreSQL
```

nginx forwards `/api/...` to the backend (the `/api` prefix is stripped), so the browser only talks to one origin.

## 2. Data model

There is a **single `users` table** shared by authentication and finance data. The user id is the one stored in the JWT (`sub`) and used for the face-photo folder `auth/faces/<id>/`.

| Table | Purpose | Notes |
|---|---|---|
| `users` | Account, credentials, profile | `username` and `email` unique, stored lowercase; `password_hash` (scrypt); `face_enrolled`; `monthly_income` |
| `transactions` | Income and expenses | `user_id` → `users.id` **ON DELETE CASCADE**; `amount` is `NUMERIC(12,2)`; index on `(user_id, date)`; `source` = manual / kaggle / seed |
| `budgets` | Monthly limit per category | `user_id` → `users.id` ON DELETE CASCADE; **unique** `(user_id, category, month, year)` |
| `login_failures` | Brute-force lockout counters | 5 failures → 15 min lock |
| `revoked_tokens` | Logged-out and single-use tokens | |
| `face_attempts` | Face-verification attempts per login | |

Code: `models/models.py` (schema), `auth/store.py` (auth queries), `db.py` (engine and session).

## 3. Each user only sees their own data

- Every data route takes the user from the **access token** (`claims["sub"]`). No `user_id` is accepted from the client.
- `/ml/*` (forecast, anomalies, budget suggestions, alerts) works on the token's user. Passing `?user_id=<someone else>` has no effect.
- `GET /users/me` replaces the former `/users/{id}`; accounts are created only via `POST /auth/signup`.
- `POST /ml/train` retrains a **shared** model, so it is restricted to usernames listed in `FINANCEIQ_ADMINS`.
- Anomaly detection triggered by a transaction or CSV import only touches that user's rows.

Regression tests: `python -m pytest tests/test_isolation.py -q` (uses a temporary SQLite file, never your real database).

## 4. Configuration

| Variable | Used by | Meaning |
|---|---|---|
| `DATABASE_URL` | backend, Alembic | e.g. `postgresql://user:pass@host:5432/db`. Default: `sqlite:///./finance.db` |
| `FINANCEIQ_JWT_SECRET` | backend | Token signing key, **32+ characters** (required in Docker) |
| `FINANCEIQ_FACES_DIR` | backend | Where face photos are stored (`/data/faces` in Docker) |
| `FINANCEIQ_ADMINS` | backend | Comma-separated usernames allowed to call `/ml/train` |
| `CORS_ORIGINS` | backend | Allowed browser origins (default: `http://localhost:3000`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose | Database credentials (defaults: `financeiq` / – / `financeiq`) |
| `REACT_APP_API_URL` | frontend build | API base URL (`/api` in Docker, `http://127.0.0.1:8000` in dev) |

Docker settings live in a `.env` file next to `docker-compose.yml` (copy `.env.example`). **Never commit `.env`.**

## 5. Migrations (Alembic)

The schema is versioned in `migrations/versions/`. The backend container runs `alembic upgrade head` at startup.

```bash
# apply migrations to the database in DATABASE_URL
alembic upgrade head

# after changing models/models.py
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Review the generated file before applying it.

## 6. Migrating the legacy SQLite data (one-off)

Before this change, accounts lived in `auth.db` and finance data in `finance.db`, with a hardcoded user id of 1. To move everything into the unified database:

```bash
alembic upgrade head          # create the tables first
python scripts/migrate_legacy.py --finance finance.db --auth auth/auth.db --owner <username>
```

- All accounts are copied **with their ids**, so existing face photos stay valid.
- The legacy finance data (`--legacy-user-id`, default 1) is attached to `--owner`.
- It refuses to run if the `users` table is not empty, and runs in a single transaction (all or nothing).

For demo data on an existing account: `python seed_data.py --username <username> [--replace]`.

## 7. Running with Docker

Requirements: Docker Desktop (or Docker Engine + Compose).

```bash
# 1. secrets
cp .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"   # paste into FINANCEIQ_JWT_SECRET

# 2. the PostgreSQL data volume is declared as external: create it once
docker volume create financeiq_pgdata

# 3. build and start
docker compose up --build
```

- App: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>
- Stop: `docker compose down` (data is kept). Add `-v` only if you want to delete the non-external volumes.

| Volume / mount | Contents |
|---|---|
| `financeiq_pgdata` (external) | PostgreSQL data |
| `./auth/faces` → `/data/faces` | Enrolled face photos |
| `deepface_weights` | VGG-Face model weights (downloaded on the first face verification) |

Notes:

- `POSTGRES_PASSWORD` is only applied when the volume is first initialised. If you change it later, the existing database keeps the old password.
- The first build is long (TensorFlow, Prophet), and the first face verification is slow while the model downloads.
- If `npm ci` fails during the frontend build, add `--legacy-peer-deps` to that line in `frontend/Dockerfile`.
- `.dockerignore` keeps `.env`, `*.db`, `auth/.jwt_secret` and `auth/faces/` out of the images.

## 8. Local development without Docker

```bash
docker run --name financeiq-db -e POSTGRES_USER=financeiq -e POSTGRES_PASSWORD=change_me \
  -e POSTGRES_DB=financeiq -p 5432:5432 -v financeiq_pgdata:/var/lib/postgresql/data -d postgres:16

export DATABASE_URL=postgresql://financeiq:change_me@localhost:5432/financeiq   # PowerShell: $env:DATABASE_URL = "..."
alembic upgrade head
uvicorn main:app --reload
```

Without `DATABASE_URL`, the app uses a local `finance.db` (SQLite). Do not run this container and the Compose `db` service at the same time on the same volume.

## 9. Security checklist

- Do not commit: `.env`, `auth/.jwt_secret`, `*.db`, `auth/faces/`.
- Use HTTPS in production: passwords and tokens travel in clear text otherwise, and browsers only allow the camera on `localhost` or HTTPS.
- Remove the published `8000:8000` port from `docker-compose.yml` in production; nginx is the only entry point needed.
