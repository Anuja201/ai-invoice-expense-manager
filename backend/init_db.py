"""
init_db.py - Apply PostgreSQL migrations (non-destructive).

Runs every migrations/*.sql file that has not been applied yet, in filename
order, and records it in the schema_migrations table. Migrations only create
missing objects; they never drop tables or modify existing rows.

Usage:
    python init_db.py              # apply pending migrations
    python init_db.py --seed-demo  # also load the optional demo user + sample data
"""

import os
import sys
import glob

from utils.db import get_db

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MIGRATIONS_DIR = os.path.join(BASE_DIR, "migrations")
DEMO_SEED_FILE = os.path.join(BASE_DIR, "seeds", "demo_data.sql")


def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def apply_migrations():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            # Serialize concurrent runs (e.g. two instances starting at once)
            cursor.execute("SELECT pg_advisory_xact_lock(726354)")
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    filename VARCHAR(255) PRIMARY KEY,
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("SELECT filename FROM schema_migrations")
            applied = {row["filename"] for row in cursor.fetchall()}

            pending = [
                p for p in sorted(glob.glob(os.path.join(MIGRATIONS_DIR, "*.sql")))
                if os.path.basename(p) not in applied
            ]
            for path in pending:
                name = os.path.basename(path)
                print(f"[init_db] applying {name}", flush=True)
                cursor.execute(_read(path))
                cursor.execute(
                    "INSERT INTO schema_migrations (filename) VALUES (%s)", (name,)
                )
        conn.commit()
        print(f"[init_db] done ({len(pending)} migration(s) applied)", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def seed_demo():
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(_read(DEMO_SEED_FILE))
        conn.commit()
        print("[init_db] demo data loaded", flush=True)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    try:
        apply_migrations()
        if "--seed-demo" in sys.argv:
            seed_demo()
    except Exception as exc:
        print(f"[init_db] FAILED: {exc}", file=sys.stderr, flush=True)
        sys.exit(1)
