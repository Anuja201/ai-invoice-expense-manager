"""
utils/db.py - Database connection manager
Provides get_db() context manager for MySQL via PyMySQL
"""

import pymysql
import pymysql.cursors
from config import Config


def get_db():
    """
    Returns a new database connection with DictCursor
    Always use in a try/finally to ensure connection.close()
    """
    connection = pymysql.connect(
        host=Config.DB_HOST,
        port=Config.DB_PORT,
        user=Config.DB_USER,
        password=Config.DB_PASSWORD,
        database=Config.DB_NAME,
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False
    )
    return connection


def execute_query(query, params=None, fetch_one=False, fetch_all=False, commit=False):
    """
    Helper to run a query and optionally return results.
    Handles connection lifecycle internally.
    """
    conn = get_db()
    try:
        with conn.cursor() as cursor:
            cursor.execute(query, params or ())
            if commit:
                conn.commit()
                return cursor.lastrowid
            if fetch_one:
                return cursor.fetchone()
            if fetch_all:
                return cursor.fetchall()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()
