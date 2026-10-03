# SmartFinanceDashboard (FinanceIQ)

An AI-powered personal finance dashboard. It tracks income and expenses, **forecasts spending with Prophet**, **flags unusual transactions**, suggests budgets, and protects every account with a **two-step login: password, then face verification**.

Angular frontend, FastAPI backend, PostgreSQL database, and a one-command Docker setup.

---

## Why it stands out

### Smart finance
- **Spending forecast** with Facebook Prophet, trained on each user's own history
- **Anomaly detection** that flags unusual transactions as they are added or imported
- **Automatic transaction categorization**
- **Budget suggestions and alerts** per category and month
- **CSV import** of transactions (the data model also supports Kaggle datasets and demo seed data)

### Strong authentication
- **Two-step login:** username and password first, then **face verification** (DeepFace, VGG-Face)
- Passwords hashed with **scrypt**
- **Brute-force lockout:** 5 failed attempts lock the account for 15 minutes
- **JWT access tokens** with logout and single-use token revocation
- Face attempts are tracked per login

### Private by design
- **Every user only sees their own data.** The user comes from the signed token, never from a client-supplied id
- Cascade deletes: removing a user removes their transactions and budgets
- `/ml/train` retrains a shared model, so it is restricted to admin usernames
- Isolation is covered by regression tests (`tests/test_isolation.py`)

### Production-minded engineering
- **PostgreSQL 16** with **SQLAlchemy 2** and versioned **Alembic** migrations (applied automatically at startup)
- **Docker Compose** with three services: `db`, `backend`, `frontend`
- SQLite fallback for zero-setup local development
- One-off migration script from the legacy SQLite databases

---

## Architecture

```
browser ──► nginx :3000 ──► /          Angular app (static files)
                       └──► /api/*     FastAPI :8000 ──► PostgreSQL
```

nginx forwards `/api/...` to the backend, so the browser only talks to a single origin.

| Layer | Technology |
|---|---|
| Frontend | Angular (Create Angular App), served by nginx |
| Backend | FastAPI, Python 3.11, uvicorn |
| Database | PostgreSQL 16 (SQLite fallback for dev) |
| ORM / migrations | SQLAlchemy 2, Alembic |
| ML | Prophet (forecasting), scikit-learn (anomalies and categorization) |
| Face recognition | DeepFace (VGG-Face), TensorFlow |
| Orchestration | Docker Compose |

---

## Quick start (Docker)

Requirements: Docker Desktop (or Docker Engine with Compose).

```bash
# 1. Create your settings file
cp .env.example .env          # PowerShell: Copy-Item .env.example .env

# 2. Generate a JWT secret and paste it after FINANCEIQ_JWT_SECRET= in .env
python -c "import secrets; print(secrets.token_urlsafe(48))"

# 3. Create the PostgreSQL data volume (once)
docker volume create financeiq_pgdata

# 4. Build and start
docker compose up --build
```

Then open:
- App: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>

Create an account with **Sign up**, enroll your face, and log in.

> The first build is long (TensorFlow, Prophet) and the first face verification is slow while the model weights download. Both happen only once.

Stop with `docker compose down` (your data is kept).

---

## Local development (without Docker)

```bash
# Database (optional, otherwise SQLite finance.db is used)
docker run --name financeiq-db -e POSTGRES_USER=financeiq -e POSTGRES_PASSWORD=change_me \
  -e POSTGRES_DB=financeiq -p 5432:5432 -v financeiq_pgdata:/var/lib/postgresql/data -d postgres:16
export DATABASE_URL=postgresql://financeiq:change_me@localhost:5432/financeiq

# Backend
python -m venv venv && source venv/bin/activate   # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload

# Frontend (in another terminal)
cd frontend
npm install
npm start
```

---

## Configuration

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Database connection. Default: `sqlite:///./finance.db` |
| `FINANCEIQ_JWT_SECRET` | Token signing key, 32+ characters (required in Docker) |
| `FINANCEIQ_FACES_DIR` | Where face photos are stored |
| `FINANCEIQ_ADMINS` | Usernames allowed to call `/ml/train` |
| `CORS_ORIGINS` | Allowed browser origins |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials for Compose |
| `Angular_APP_API_URL` | API base URL used by the frontend build |

Never commit `.env`. See [`.env.example`](.env.example).

---

## Tests

```bash
python -m pytest tests/test_isolation.py -q
```

The tests run on a temporary SQLite file and never touch your real database.

---

## Project structure

```
.
├── main.py                  # FastAPI application
├── db.py                    # Engine and session
├── models/                  # SQLAlchemy models
├── auth/                    # Authentication, tokens, face verification
├── migrations/              # Alembic migrations
├── scripts/                 # One-off scripts (legacy data migration)
├── tests/                   # Regression tests (user isolation)
├── frontend/                # Angular app and its Dockerfile
├── seed_data.py             # Demo data generator
├── Dockerfile               # Backend image
├── docker-compose.yml       # db + backend + frontend
├── requirements.txt
├── .env.example
└── DATABASE_AND_DOCKER.md   # Detailed database and Docker guide
```

More details on the data model, migrations and deployment: [DATABASE_AND_DOCKER.md](DATABASE_AND_DOCKER.md).

---

## Security notes

- Use **HTTPS** in production. Browsers only allow camera access on `localhost` or HTTPS, so face login needs it.
- Remove the published `8000:8000` port from `docker-compose.yml` in production. nginx should be the only entry point.
- Do not commit `.env`, `auth/.jwt_secret`, `*.db` or `auth/faces/`.

---

## Context

Built during a summer internship as a full-stack and applied-AI project.
