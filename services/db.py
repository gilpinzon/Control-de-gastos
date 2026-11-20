"""
==============================================================================
DUOCONTROL | GESTOR DE BASE DE DATOS (services/db.py)
Conexión híbrida resiliente:
1. Neon Serverless PostgreSQL (en producción / Vercel con DATABASE_URL)
2. SQLite Local Fallback (en desarrollo local / offline / sandbox)
==============================================================================
"""

import os
import re
import uuid
import sqlite3
import datetime
from typing import List, Dict, Any, Optional

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
LOCAL_DB_PATH = os.path.join(DATA_DIR, "duocontrol.db")
WORKSPACE_ID = "a0000000-0000-0000-0000-000000000001"

_initialized = False


def _get_database_url() -> str:
    """Obtiene la URL de Neon PostgreSQL desde entorno o .env."""
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        env_path = os.path.join(BASE_DIR, ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if line.startswith("DATABASE_URL="):
                            url = line.split("=", 1)[1].strip().strip('"').strip("'")
                            break
            except Exception:
                pass
    return url


def get_sqlite_connection() -> sqlite3.Connection:
    """Retorna una conexión a la base de datos local SQLite."""
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(LOCAL_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_tables():
    """Garantiza la creación y migración de tablas en el almacén de datos."""
    global _initialized
    if _initialized:
        return

    os.makedirs(DATA_DIR, exist_ok=True)
    conn = get_sqlite_connection()
    cursor = conn.cursor()

    # 1. Tabla workspaces
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL DEFAULT 'Hogar Gil & Ale',
        authorized_email_1 TEXT NOT NULL DEFAULT 'gil@ejemplo.com',
        authorized_email_2 TEXT NOT NULL DEFAULT 'ale@ejemplo.com',
        currency_code TEXT NOT NULL DEFAULT 'COP',
        currency_symbol TEXT NOT NULL DEFAULT '$',
        monthly_savings_goal REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 2. Tabla transactions (Fondo Unificado)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('gasto', 'ingreso')),
        amount REAL NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL,
        description TEXT DEFAULT '',
        date TEXT NOT NULL,
        recorded_by TEXT NOT NULL DEFAULT 'Gil',
        receipt_image_url TEXT DEFAULT '',
        vendor TEXT DEFAULT '',
        ocr_confidence REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migración de columnas de facturas si la base ya existía
    cursor.execute("PRAGMA table_info(transactions);")
    existing_cols = {col[1] for col in cursor.fetchall()}
    if "receipt_image_url" not in existing_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN receipt_image_url TEXT DEFAULT '';")
    if "vendor" not in existing_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN vendor TEXT DEFAULT '';")
    if "ocr_confidence" not in existing_cols:
        cursor.execute("ALTER TABLE transactions ADD COLUMN ocr_confidence REAL DEFAULT 0;")

    # 3. Tabla shopping_items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS shopping_items (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Mercado / Supermercado',
        quantity TEXT DEFAULT '1',
        is_purchased INTEGER NOT NULL DEFAULT 0,
        added_by TEXT NOT NULL DEFAULT 'Gil',
        purchased_by TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # 4. Sembrado inicial del espacio de Gil & Ale
    cursor.execute("SELECT COUNT(*) FROM workspaces WHERE id = ?;", (WORKSPACE_ID,))
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO workspaces (id, name, authorized_email_1, authorized_email_2, currency_code, currency_symbol, monthly_savings_goal)
        VALUES (?, 'Hogar Gil & Ale', 'gil@ejemplo.com', 'ale@ejemplo.com', 'COP', '$', 0);
        """, (WORKSPACE_ID,))

    conn.commit()
    conn.close()
    _initialized = True


# Inicializar automáticamente al importar
ensure_tables()
