"""SQLite : comptes, verrouillage anti brute-force, jetons révoqués, tentatives faciales."""
import os
import sqlite3
import time
from contextlib import contextmanager

DB_PATH = os.environ.get(
    "FINANCEIQ_AUTH_DB",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "auth.db"),
)

MAX_FAILURES = 5            # échecs (mot de passe OU visage) avant verrouillage
LOCK_SECONDS = 15 * 60      # durée du verrouillage, et fenêtre de comptage des échecs


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
                email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                face_enrolled INTEGER NOT NULL DEFAULT 0,
                created_at    INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS login_failures (
                username     TEXT PRIMARY KEY,
                count        INTEGER NOT NULL,
                locked_until INTEGER NOT NULL DEFAULT 0,
                last_failure INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS revoked_tokens (
                jti TEXT PRIMARY KEY,
                exp INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS face_attempts (
                jti   TEXT PRIMARY KEY,
                count INTEGER NOT NULL,
                exp   INTEGER NOT NULL
            );
            """
        )


# ── Utilisateurs ──────────────────────────────────────────────
def create_user(username: str, email: str, password_hash: str) -> int:
    with db() as c:
        cur = c.execute(
            "INSERT INTO users(username, email, password_hash, created_at) VALUES (?,?,?,?)",
            (username, email, password_hash, int(time.time())),
        )
        return cur.lastrowid


def get_user_by_username(username: str):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def get_user_by_id(user_id: int):
    with db() as c:
        return c.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def set_face_enrolled(user_id: int, enrolled: bool) -> None:
    with db() as c:
        c.execute("UPDATE users SET face_enrolled = ? WHERE id = ?", (1 if enrolled else 0, user_id))


# ── Anti brute-force ──────────────────────────────────────────
def lock_remaining(username: str) -> int:
    """Secondes restantes avant la fin du verrouillage (0 si le compte n'est pas verrouillé)."""
    now = int(time.time())
    with db() as c:
        row = c.execute("SELECT locked_until FROM login_failures WHERE username = ?", (username,)).fetchone()
    if row and row["locked_until"] > now:
        return row["locked_until"] - now
    return 0


def register_failure(username: str) -> None:
    now = int(time.time())
    with db() as c:
        row = c.execute(
            "SELECT count, last_failure FROM login_failures WHERE username = ?", (username,)
        ).fetchone()
        count = row["count"] + 1 if row and now - row["last_failure"] <= LOCK_SECONDS else 1
        locked_until = now + LOCK_SECONDS if count >= MAX_FAILURES else 0
        c.execute(
            """INSERT INTO login_failures(username, count, locked_until, last_failure)
               VALUES (?,?,?,?)
               ON CONFLICT(username) DO UPDATE SET
                   count = excluded.count,
                   locked_until = excluded.locked_until,
                   last_failure = excluded.last_failure""",
            (username, count, locked_until, now),
        )


def clear_failures(username: str) -> None:
    with db() as c:
        c.execute("DELETE FROM login_failures WHERE username = ?", (username,))


# ── Jetons révoqués (déconnexion, jetons à usage unique) ──────
def revoke(jti: str, exp: int) -> None:
    with db() as c:
        c.execute("INSERT OR IGNORE INTO revoked_tokens(jti, exp) VALUES (?,?)", (jti, int(exp)))
        # nettoyage des entrées expirées (elles seraient de toute façon rejetées par la signature)
        c.execute("DELETE FROM revoked_tokens WHERE exp < ?", (int(time.time()),))
        c.execute("DELETE FROM face_attempts WHERE exp < ?", (int(time.time()),))


def is_revoked(jti: str) -> bool:
    with db() as c:
        return c.execute("SELECT 1 FROM revoked_tokens WHERE jti = ?", (jti,)).fetchone() is not None


# ── Tentatives faciales par jeton de connexion ────────────────
def face_attempts(jti: str) -> int:
    with db() as c:
        row = c.execute("SELECT count FROM face_attempts WHERE jti = ?", (jti,)).fetchone()
    return row["count"] if row else 0


def bump_face_attempts(jti: str, exp: int) -> int:
    with db() as c:
        c.execute(
            """INSERT INTO face_attempts(jti, count, exp) VALUES (?,1,?)
               ON CONFLICT(jti) DO UPDATE SET count = count + 1""",
            (jti, int(exp)),
        )
        return c.execute("SELECT count FROM face_attempts WHERE jti = ?", (jti,)).fetchone()["count"]
