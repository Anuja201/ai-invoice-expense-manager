"""
utils/db.py - Database connection manager
Provides get_db() for PostgreSQL via psycopg2 (rows returned as dicts).

Connection settings come from DATABASE_URL (Railway / production), or the
individual DB_* variables as a fallback for local development.
"""

import psycopg2
import psycopg2.extras
from config import Config


def get_db():
    """
    Returns a new database connection whose cursors return dict rows.
    Always use in a try/finally to ensure connection.close()
    """
    if Config.DATABASE_URL:
        connection = psycopg2.connect(
            Config.DATABASE_URL,
            sslmode=Config.DB_SSLMODE,
            connect_timeout=10,
            gssencmode="disable",
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    else:
        connection = psycopg2.connect(
            host=Config.DB_HOST,
            port=Config.DB_PORT,
            user=Config.DB_USER,
            password=Config.DB_PASSWORD,
            dbname=Config.DB_NAME,
            sslmode=Config.DB_SSLMODE,
            connect_timeout=10,
            gssencmode="disable",
            cursor_factory=psycopg2.extras.RealDictCursor,
        )
    connection.autocommit = False
    return connection


def execute_query(query, params=None, fetch_one=False, fetch_all=False, commit=False):
    """
    Helper to run a query and optionally return results.
    Handles connection lifecycle internally.

    With commit=True, returns the "id" column of the first returned row when
    the query has a RETURNING clause (e.g. INSERT ... RETURNING id).
    """
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            if commit:
                row = cursor.fetchone() if cursor.description else None
                conn.commit()
                return row.get("id") if row else None
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
