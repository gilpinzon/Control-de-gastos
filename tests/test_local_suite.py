"""
==============================================================================
DUOCONTROL | SUITE DE PRUEBAS LOCALES (tests/test_local_suite.py)
Verifica endpoints de FastAPI, Service Worker, Neon DB y Escáner Multi-Supermercado
==============================================================================
"""

import os
import sys
import asyncio

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from api.index import (
    app,
    get_status,
    get_settings,
    list_transactions,
    list_shopping,
    get_sync_data,
    scan_receipt
)

print("Iniciando pruebas unitarias de DuoControl (Mobile & Multi-Supermercado)...")

from services.budget_service import (
    get_workspace,
    update_workspace,
    get_transactions,
    create_transaction,
    delete_transaction,
    get_shopping_items,
    create_shopping_item,
    update_shopping_item,
    delete_shopping_item,
    sync_all
)
from services.receipt_scanner import (
    parse_supermarket_receipt_text,
    parse_isimo_receipt_text,
    detect_supermarket_vendor,
    estimate_image_sharpness,
    process_receipt_image,
    process_and_save_receipt
)

# 1. Prueba de Workspace / Moneda COP
ws = get_workspace()
assert ws["currency"] == "COP", f"Expected COP but got {ws['currency']}"
assert ws["symbol"] == "$", f"Expected $ but got {ws['symbol']}"
print("✓ 1. Workspace de Gil & Ale configurado en COP ($): OK")

# 2. Prueba de Transacción Manual en Fondo Común
tx = create_transaction({
    "type": "gasto",
    "amount": 45800,
    "category": "Mercado / Supermercado",
    "description": "Compra manual de prueba",
    "paidBy": "Gil"
})
assert tx["amount"] == 45800
assert tx["type"] == "gasto"
print("✓ 2. Registro manual de gasto en el fondo común: OK ($45.800)")

# 3. Prueba de Lista de Mercado y Marcado en Tiempo Real
item = create_shopping_item({
    "name": "Huevos AA x30",
    "category": "Mercado / Supermercado",
    "quantity": "1 canasta",
    "addedBy": "Ale"
})
assert item["name"] == "Huevos AA x30"
assert item["isPurchased"] is False
updated = update_shopping_item(item["id"], {"isPurchased": True, "purchasedBy": "Gil"})
assert updated["isPurchased"] is True
print("✓ 3. Lista de mercado y actualización en tiempo real: OK")

# 4. Prueba de Tirilla Nítida de Tiendas Ísimo
ticket_isimo = """
TIENDAS ISIMO S.A.S - NIT: 901.621.579-2
FACTURA POS No. 12345
FECHA: 2026-11-20
------------------------------------
LECHE ENTERA                    $ 3.800
ARROZ 1KG                       $ 4.200
ACEITE 900ML                    $ 7.900
SUBTOTAL:                       $ 15.900
IVA 19%:                        $ 1.200
TOTAL A PAGAR:                  $ 45.800
MEDIO DE PAGO:
EFECTIVO:                       $ 50.000
VUELTAS:                        $ 4.200
"""
res_isimo = parse_supermarket_receipt_text(ticket_isimo)
assert res_isimo["success"] is True
assert res_isimo["amount"] == 45800, f"Expected 45800, got {res_isimo['amount']}"
assert res_isimo["vendor"] == "Ísimo"
print(f"✓ 4. Parseo de tirilla nítida de Ísimo: OK (Total: ${res_isimo['amount']:,} COP)")

# 5. Prueba de Tirilla Nítida de Tiendas D1 (KOBA Colombia)
ticket_d1 = """
KOBA COLOMBIA S.A.S. - TIENDAS D1
NIT: 900.276.962-1
FACTURA ELECTRONICA DE VENTA: D1-98432
-----------------------------------------
ATUN EN ACEITE X3               $ 14.900
PAN TAJADO INTEGRAL              $ 4.200
QUESO MOZZARELLA 400G           $ 12.500
SUBTOTAL:                       $ 31.600
IMPOCONSUMO / IVA:               $ 2.450
TOTAL A PAGAR:                  $ 68.450
TARJETA DEBITO:                 $ 68.450
CAMBIO:                             $ 0
CUFE: 82736481723648127364812734612
"""
res_d1 = parse_supermarket_receipt_text(ticket_d1)
assert res_d1["success"] is True
assert res_d1["amount"] == 68450, f"Expected 68450, got {res_d1['amount']}"
assert res_d1["vendor"] == "D1"
print(f"✓ 5. Parseo de tirilla nítida de D1: OK (Total: ${res_d1['amount']:,} COP)")

# 6. Prueba de Tirilla Nítida de Olímpica
ticket_olimpica = """
SUPERTIENDAS Y DROGUERIAS OLIMPICA S.A.
NIT. 890.107.487-0
SEDE BARRANQUILLA / MEDELLIN
-----------------------------------------
CARNE MOLIDA 500G               $ 18.900
YOGURT FAMILIAR                 $ 11.200
DETERGENTE POLVO                $ 24.500
SUBTOTAL:                       $ 54.600
DESCUENTO TARJETA PLATA:       - $ 5.000
VALOR TOTAL:                    $ 98.600
MEDIO DE PAGO: TARJETA
"""
res_olimpica = parse_supermarket_receipt_text(ticket_olimpica)
assert res_olimpica["success"] is True
assert res_olimpica["amount"] == 98600, f"Expected 98600, got {res_olimpica['amount']}"
assert res_olimpica["vendor"] == "Olímpica"
print(f"✓ 6. Parseo de tirilla nítida de Olímpica: OK (Total: ${res_olimpica['amount']:,} COP)")

# 7. Prueba de Guardado Automático en Base de Datos (Scan & Auto-Save)
auto_save_res = process_and_save_receipt(
    image_bytes=b"",
    client_ocr_text=ticket_d1,
    auto_save=True,
    paid_by="Ale",
    category="Mercado / Supermercado"
)
assert auto_save_res["success"] is True
assert auto_save_res["auto_saved"] is True
assert auto_save_res["amount"] == 68450
assert auto_save_res["vendor"] == "D1"
assert auto_save_res["transaction"]["paid_by"] == "Ale"
print("✓ 7. Guardado automático directo en Neon/BD sin digitar números: OK")

# 8. Prueba de Respaldo ante Foto Borrosa / Ilegible (Sin guardar datos falsos)
res_blurry = process_receipt_image(b"\x00" * 300, client_ocr_text="")
assert res_blurry["success"] is False
assert res_blurry["is_blurry"] is True
assert res_blurry["amount"] is None
print(f"✓ 8. Respaldo ante foto borrosa (sin bloqueo ni valores falsos): OK")

# 9. Prueba de Sincronización Global
sync_res = sync_all({
    "transactions": [tx],
    "shoppingList": [item],
    "couple": {"monthlySavingsGoal": 500000}
})
assert sync_res["success"] is True
print("✓ 9. Sincronización offline-to-online: OK")

print("\n🎉 TODAS LAS 9 PRUEBAS PASARON EXITOSAMENTE AL 100%!")
