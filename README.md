# 💸 SmartFinanceDashboard (FinanceIQ)

**An AI-powered personal finance dashboard with biometric two-step login.**

Track income and expenses, forecast future spending, catch unusual transactions, and get budget suggestions, all behind a password + face verification login.

![Angular](https://img.shields.io/badge/Angular-frontend-DD0031?logo=angular&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)

> **Naming:** the project is called *SmartFinanceDashboard*; *FinanceIQ* is the short name used in code, environment variables and Docker volumes.

---

## 📸 Screenshots

<!-- Replace with real images, e.g. docs/screenshots/dashboard.png -->
| Dashboard | Forecast | Face login |
|---|---|---|
| _add screenshot_ | _add screenshot_ | _add screenshot_ |

---

## 📑 Table of contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Quick start (Docker)](#-quick-start-docker)
- [Local development](#-local-development-without-docker)
- [Configuration](#-configuration)
- [Machine learning](#-machine-learning)
- [Tests](#-tests)
- [Project structure](#-project-structure)
- [Security](#-security)
- [License](#-license)

---

## ✨ Features

### 📊 Smart finance
- **Spending forecast** with Facebook Prophet, trained on each user's own history
- **Anomaly detection** that flags unusual transactions when they are added or imported
- **Automatic categorization** of transactions
- **Budget suggestions and alerts** per category and month
- **CSV import** (the data model also supports Kaggle datasets and demo seed data)

### 🔐 Strong authentication
- **Two-step login:** username + password, then **face verification** (DeepFace, VGG-Face)
- Passwords hashed with **scrypt**
- **Brute-force lockout:** 5 failed attempts lock the account for 15 minutes
- **JWT access tokens**, with logout and token revocation (a revoked token cannot be reused)
- Face attempts are tracked per login

### 🛡️ Private by design
- **Each user only sees their own data.** The user identity comes from the signed token, never from a client-supplied id
- Cascade deletes: removing a user removes their transactions and budgets
- `/ml/train` retrains a shared model, so it is restricted to admin usernames
- Isolation is covered by regression tests (`tests/test_isolation.py`)

### 🏗️ Engineering
- **PostgreSQL 16** with **SQLAlchemy 2** and versioned **Alembic** migrations
- **Docker Compose** with three services: `db`, `backend`, `frontend`
- SQLite fallback for zero-setup local development
- One-off migration script from the legacy SQLite databases

---

## 🧱 Architecture

```
browser ──► nginx :3000 ──► /          Angular app (static files)
                       └──► /api/*     FastAPI  ──► PostgreSQL
```

nginx forwards `/api/...` to the backend, so the browser only talks to a single origin.

| Layer | Technology |
|---|---|
| Frontend | Angular, served by nginx |
| Backend | FastAPI, Python 3.11, uvicorn |
| Database | PostgreSQL 16 (SQLite fallback for dev) |
| ORM / migrations | SQLAlchemy 2, Alembic |
| ML | Prophet (forecasting), scikit-learn (anomalies, categorization) |
| Face recognition | DeepFace (VGG-Face), TensorFlow |
| Orchestration | Docker Compose |

---

## 🛠️ Local development (without Docker)

**Prerequisites:** Python 3.11, Node.js (current LTS) and npm. Docker is optional, only for PostgreSQL.

```bash
# Database (optional, otherwise SQLite finance.db is used)
docker run --name financeiq-db -e POSTGRES_USER=financeiq -e POSTGRES_PASSWORD=change_me \
  -e POSTGRES_DB=financeiq -p 5432:5432 -v financeiq_pgdata:/var/lib/postgresql/data -d postgres:16
export DATABASE_URL=postgresql://financeiq:change_me@localhost:5432/financeiq

# Backend
python -m venv venv && source venv/bin/activate   # Windows: .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
alembic upgrade head      # manual step: only needed outside Docker
uvicorn main:app --reload

# Frontend (in another terminal)
cd frontend
npm install
npm start
```

---

## ⚙️ Configuration

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Database connection. Default: `sqlite:///./finance.db` |
| `FINANCEIQ_JWT_SECRET` | Token signing key, 32+ characters (required in Docker) |
| `FINANCEIQ_FACES_DIR` | Where face photos are stored |
| `FINANCEIQ_ADMINS` | Usernames allowed to call `/ml/train` |
| `CORS_ORIGINS` | Allowed browser origins |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials for Compose |

**Frontend API URL:** in Docker, the frontend calls `/api` on the same origin through nginx, so nothing needs to be set. For local development, point the frontend to your backend in the Angular environment file (`frontend/src/environments/`).

⚠️ Never commit `.env`. See [`.env.example`](.env.example).

---

## 🤖 Machine learning

| Task | Approach | Notes |
|---|---|---|
| Spending forecast | Prophet, one model per user | Needs enough transaction history to be reliable |
| Anomaly detection | scikit-learn | Flags outliers for review, not proof of fraud |
| Categorization | scikit-learn | Suggestions can be corrected by the user |

<!-- Add your real evaluation here, e.g. forecast MAPE on a hold-out period, anomaly contamination rate. -->

---

## 🧪 Tests

```bash
python -m pytest tests/test_isolation.py -q
```

Tests run on a temporary SQLite file and never touch your real database.

---

## 📁 Project structure

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

More on the data model, migrations and deployment: [DATABASE_AND_DOCKER.md](DATABASE_AND_DOCKER.md).

---

## 🔒 Security

- Use **HTTPS** in production. Browsers only allow camera access on `localhost` or HTTPS, so face login requires it.
- Remove the published `8000:8000` port from `docker-compose.yml` in production. nginx should be the only entry point.
- Do not commit `.env`, `auth/.jwt_secret`, `*.db` or `auth/faces/`.
- **Face verification limits:** the current setup has no liveness detection, so a printed photo or screen replay could fool it. Treat it as a second factor, not a replacement for a strong password.
- **Biometric data:** face photos are stored in `FINANCEIQ_FACES_DIR`. Protect that directory, and obtain user consent and follow applicable data-protection rules (e.g. GDPR) before deploying publicly.

---

## 📄 License

Add a license file (for example MIT) and reference it here: `This project is licensed under the MIT License. See [LICENSE](LICENSE).`

---

## 👤 Author

Built by **Chadha**, 5th-year engineering student at ENSI (University of Manouba), as a full-stack and applied-AI project.
