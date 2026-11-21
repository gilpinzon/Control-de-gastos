"""
==============================================================================
DUOCONTROL | SERVICIO DE PRESUPUESTO Y MERCADO (services/budget_service.py)
Reglas de Negocio:
1. Moneda por defecto: Peso Colombiano (COP, $)
2. Whitelist y Privacidad: Gil & Ale (gil@ejemplo.com / ale@ejemplo.com)
3. Fondo común unificado (sin deudas cruzadas ni división individual)
4. Sincronización en tiempo real de transacciones y lista de compras
==============================================================================
"""

import uuid
import datetime
from typing import List, Dict, Any, Optional
from services.db import get_sqlite_connection, WORKSPACE_ID, ensure_tables


def get_workspace() -> Dict[str, Any]:
    """Obtiene la configuración del hogar de Gil & Ale."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT name, currency_code as currency, currency_symbol as symbol,
               monthly_savings_goal as monthlySavingsGoal,
               authorized_email_1 as email1, authorized_email_2 as email2
        FROM workspaces WHERE id = ?;
    """, (WORKSPACE_ID,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return dict(row)
    return {
        "name": "Hogar Gil & Ale",
        "currency": "COP",
        "symbol": "$",
        "monthlySavingsGoal": 0.0,
        "email1": "gil@ejemplo.com",
        "email2": "ale@ejemplo.com"
    }


def update_workspace(data: Dict[str, Any]) -> bool:
    """Actualiza la configuración del hogar (meta de ahorro, emails, moneda)."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()

    monthly_goal = data.get("monthlySavingsGoal")
    currency = data.get("currency")
    symbol = data.get("symbol")
    email1 = data.get("email1")
    email2 = data.get("email2")
    name1 = data.get("name1")
    name2 = data.get("name2")

    current = get_workspace()
    new_goal = float(monthly_goal) if monthly_goal is not None else current.get("monthlySavingsGoal", 0.0)
    new_currency = currency if currency else current.get("currency", "COP")
    new_symbol = symbol if symbol else current.get("symbol", "$")
    new_email1 = email1 if email1 else current.get("email1", "gil@ejemplo.com")
    new_email2 = email2 if email2 else current.get("email2", "ale@ejemplo.com")
    new_name = f"Hogar {name1} & {name2 or 'Ale'}" if name1 else current.get("name", "Hogar Gil & Ale")

    cursor.execute("""
        UPDATE workspaces
        SET monthly_savings_goal = ?, currency_code = ?, currency_symbol = ?,
            authorized_email_1 = ?, authorized_email_2 = ?, name = ?
        WHERE id = ?;
    """, (new_goal, new_currency, new_symbol, new_email1, new_email2, new_name, WORKSPACE_ID))

    conn.commit()
    conn.close()
    return True


def get_transactions() -> List[Dict[str, Any]]:
    """Retorna el listado completo de movimientos del fondo común con sus productos desglosados."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, type, amount, category, coalesce(description, '') as description,
               date, recorded_by as paidBy, coalesce(vendor, '') as vendor,
               coalesce(ocr_confidence, 0) as ocrConfidence,
               coalesce(items_count, 0) as itemsCount,
               created_at as createdAt
        FROM transactions
        WHERE workspace_id = ?
        ORDER BY date DESC, created_at DESC;
    """, (WORKSPACE_ID,))
    rows = [dict(r) for r in cursor.fetchall()]

    # Obtener ítems asociados a las transacciones
    if rows:
        cursor.execute("""
            SELECT id, transaction_id as transactionId, name, quantity, unit,
                   unit_price as unitPrice, total_price as totalPrice
            FROM transaction_items
            ORDER BY created_at ASC;
        """)
        items_by_tx: Dict[str, List[Dict[str, Any]]] = {}
        for item in cursor.fetchall():
            d_item = dict(item)
            t_id = d_item["transactionId"]
            if t_id not in items_by_tx:
                items_by_tx[t_id] = []
            items_by_tx[t_id].append(d_item)

        for row in rows:
            tx_id = row["id"]
            row["items"] = items_by_tx.get(tx_id, [])
            if not row.get("itemsCount"):
                row["itemsCount"] = len(row["items"])

    conn.close()
    return rows


def get_transaction_items(tx_id: str) -> List[Dict[str, Any]]:
    """Obtiene los productos desglosados de una transacción específica."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, transaction_id as transactionId, name, quantity, unit,
               unit_price as unitPrice, total_price as totalPrice
        FROM transaction_items
        WHERE transaction_id = ?
        ORDER BY created_at ASC;
    """, (str(tx_id),))
    items = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return items


def create_transaction(data: Dict[str, Any]) -> Dict[str, Any]:
    """Registra un nuevo gasto o ingreso en el fondo común con desglose opcional de productos."""
    ensure_tables()
    tx_type = data.get("type", "gasto")
    amount = float(data.get("amount", 0))
    if amount <= 0:
        raise ValueError("El monto debe ser superior a cero.")

    category = data.get("category") or "Otros"
    description = data.get("description") or ""
    date_val = data.get("date") or datetime.date.today().isoformat()
    paid_by = data.get("paidBy") or data.get("paid_by") or "Gil"
    vendor = data.get("vendor") or ""
    ocr_confidence = float(data.get("ocrConfidence") or data.get("ocr_confidence") or 0)
    receipt_image_url = data.get("receiptImageUrl") or data.get("receipt_image_url") or ""
    items = data.get("items") or []

    tx_id = data.get("id")
    if not tx_id or len(str(tx_id)) < 10:
        tx_id = str(uuid.uuid4())

    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO transactions (id, workspace_id, type, amount, category, description,
                                 date, recorded_by, receipt_image_url, vendor, ocr_confidence, items_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (tx_id, WORKSPACE_ID, tx_type, amount, category, description,
          date_val, paid_by, receipt_image_url, vendor, ocr_confidence, len(items)))

    # Guardar productos/ítems detallados de la factura si están presentes
    saved_items = []
    if items and isinstance(items, list):
        for it in items:
            it_name = (it.get("name") or "").strip()
            if not it_name:
                continue
            it_id = str(uuid.uuid4())
            it_qty = float(it.get("quantity") or 1.0)
            it_unit = str(it.get("unit") or "UND").upper()
            it_unit_price = float(it.get("unit_price") or it.get("unitPrice") or 0.0)
            it_total_price = float(it.get("total_price") or it.get("totalPrice") or (it_qty * it_unit_price) or 0.0)

            cursor.execute("""
                INSERT INTO transaction_items (id, transaction_id, name, quantity, unit, unit_price, total_price)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """, (it_id, tx_id, it_name, it_qty, it_unit, it_unit_price, it_total_price))
            saved_items.append({
                "id": it_id,
                "transactionId": tx_id,
                "name": it_name,
                "quantity": it_qty,
                "unit": it_unit,
                "unitPrice": it_unit_price,
                "totalPrice": it_total_price
            })

    conn.commit()
    cursor.execute("""
        SELECT id, type, amount, category, description, date,
               recorded_by as paidBy, vendor, ocr_confidence as ocrConfidence,
               items_count as itemsCount, created_at as createdAt
        FROM transactions WHERE id = ?;
    """, (tx_id,))
    row = dict(cursor.fetchone())
    row["paid_by"] = row.get("paidBy")
    row["items"] = saved_items
    row["itemsCount"] = len(saved_items)
    conn.close()
    return row


def delete_transaction(tx_id: str) -> bool:
    """Elimina una transacción por su identificador."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transactions WHERE id = ? AND workspace_id = ?;", (str(tx_id), WORKSPACE_ID))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def get_shopping_items() -> List[Dict[str, Any]]:
    """Obtiene los artículos de la lista de mercado en tiempo real."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, name, category, quantity, is_purchased as isPurchased,
               added_by as addedBy, coalesce(purchased_by, '') as purchasedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM shopping_items
        WHERE workspace_id = ?
        ORDER BY is_purchased ASC, created_at DESC;
    """, (WORKSPACE_ID,))
    rows = []
    for r in cursor.fetchall():
        d = dict(r)
        d["isPurchased"] = bool(d["isPurchased"])
        rows.append(d)
    conn.close()
    return rows


def create_shopping_item(data: Dict[str, Any]) -> Dict[str, Any]:
    """Agrega un producto a la lista de mercado."""
    ensure_tables()
    name = (data.get("name") or "").strip()
    if not name:
        raise ValueError("Nombre de producto requerido.")

    category = data.get("category") or "Mercado / Supermercado"
    quantity = str(data.get("quantity") or "1")
    is_purchased = 1 if data.get("isPurchased") else 0
    added_by = data.get("addedBy") or "Gil"

    item_id = data.get("id")
    if not item_id or len(str(item_id)) < 10:
        item_id = str(uuid.uuid4())

    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO shopping_items (id, workspace_id, name, category, quantity, is_purchased, added_by)
        VALUES (?, ?, ?, ?, ?, ?, ?);
    """, (item_id, WORKSPACE_ID, name, category, quantity, is_purchased, added_by))
    conn.commit()

    cursor.execute("""
        SELECT id, name, category, quantity, is_purchased as isPurchased,
               added_by as addedBy, coalesce(purchased_by, '') as purchasedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM shopping_items WHERE id = ?;
    """, (item_id,))
    row = dict(cursor.fetchone())
    row["isPurchased"] = bool(row["isPurchased"])
    conn.close()
    return row


def update_shopping_item(item_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Modifica el estado o cantidad de un producto del mercado."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()

    is_purchased = data.get("isPurchased")
    purchased_by = data.get("purchasedBy")
    quantity = data.get("quantity")
    name = data.get("name")

    updates = []
    params = []

    if is_purchased is not None:
        updates.append("is_purchased = ?")
        params.append(1 if is_purchased else 0)
    if purchased_by is not None:
        updates.append("purchased_by = ?")
        params.append(purchased_by)
    if quantity is not None:
        updates.append("quantity = ?")
        params.append(str(quantity))
    if name is not None:
        updates.append("name = ?")
        params.append(name.strip())

    if not updates:
        conn.close()
        return None

    updates.append("updated_at = CURRENT_TIMESTAMP")
    sql_str = f"UPDATE shopping_items SET {', '.join(updates)} WHERE id = ? AND workspace_id = ?;"
    params.extend([str(item_id), WORKSPACE_ID])

    cursor.execute(sql_str, params)
    conn.commit()

    cursor.execute("""
        SELECT id, name, category, quantity, is_purchased as isPurchased,
               added_by as addedBy, coalesce(purchased_by, '') as purchasedBy,
               created_at as createdAt, updated_at as updatedAt
        FROM shopping_items WHERE id = ?;
    """, (str(item_id),))
    row = cursor.fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["isPurchased"] = bool(d["isPurchased"])
        return d
    return None


def delete_shopping_item(item_id: str) -> bool:
    """Elimina un artículo de la lista de compras."""
    ensure_tables()
    conn = get_sqlite_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM shopping_items WHERE id = ? AND workspace_id = ?;", (str(item_id), WORKSPACE_ID))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def sync_all(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Sincroniza en una sola llamada transacciones, compras y configuración."""
    ensure_tables()
    tx_list = payload.get("transactions") or []
    shopping_list = payload.get("shoppingList") or []
    couple_info = payload.get("couple") or {}

    conn = get_sqlite_connection()
    cursor = conn.cursor()

    # Sincronizar transacciones con UPSERT
    for tx in tx_list:
        tid = tx.get("id") or str(uuid.uuid4())
        ttype = tx.get("type", "gasto")
        tamount = float(tx.get("amount", 0))
        if tamount <= 0:
            continue
        tcat = tx.get("category", "Otros")
        tdesc = tx.get("description", "")
        tdate = tx.get("date") or datetime.date.today().isoformat()
        tby = tx.get("paidBy") or "Gil"

        cursor.execute("""
            INSERT INTO transactions (id, workspace_id, type, amount, category, description, date, recorded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                type = excluded.type,
                amount = excluded.amount,
                category = excluded.category,
                description = excluded.description,
                date = excluded.date,
                recorded_by = excluded.recorded_by;
        """, (tid, WORKSPACE_ID, ttype, tamount, tcat, tdesc, tdate, tby))

    # Sincronizar artículos de mercado con UPSERT
    for item in shopping_list:
        iid = item.get("id") or str(uuid.uuid4())
        iname = (item.get("name") or "").strip()
        if not iname:
            continue
        icat = item.get("category", "Mercado / Supermercado")
        iqty = str(item.get("quantity", "1"))
        ipurchased = 1 if item.get("isPurchased") else 0
        iadded = item.get("addedBy", "Gil")
        ipurchased_by = item.get("purchasedBy", "")

        cursor.execute("""
            INSERT INTO shopping_items (id, workspace_id, name, category, quantity, is_purchased, added_by, purchased_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                category = excluded.category,
                quantity = excluded.quantity,
                is_purchased = excluded.is_purchased,
                purchased_by = excluded.purchased_by,
                updated_at = CURRENT_TIMESTAMP;
        """, (iid, WORKSPACE_ID, iname, icat, iqty, ipurchased, iadded, ipurchased_by))

    conn.commit()
    conn.close()

    # Sincronizar couple / workspace
    if couple_info:
        update_workspace(couple_info)

    return {
        "success": True,
        "transactions": get_transactions(),
        "shoppingList": get_shopping_items(),
        "workspace": get_workspace()
    }
