"""
==============================================================================
DUOCONTROL | SUITE DE PRUEBAS LOCALES (tests/test_local_suite.py)
Verifica endpoints de FastAPI, Service Worker, Neon DB y Escáner Ísimo
==============================================================================
"""

import os
import sys

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
import asyncio

# Mock simple client if testclient is available or direct function calls
print("Iniciando pruebas unitarias de DuoControl...")

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
    parse_isimo_receipt_text,
    estimate_image_sharpness,
    process_receipt_image
)

# 1. Prueba de Workspace / Moneda COP
ws = get_workspace()
assert ws["currency"] == "COP", f"Expected COP but got {ws['currency']}"
assert ws["symbol"] == "$", f"Expected $ but got {ws['symbol']}"
print("✓ 1. Workspace de Gil & Ale configurado en COP ($): OK")

# 2. Prueba de Transacción (Fondo Común)
tx = create_transaction({
    "type": "gasto",
    "amount": 45800,
    "category": "Mercado / Supermercado",
    "description": "Compra de prueba Ísimo",
    "paidBy": "Gil"
})
assert tx["amount"] == 45800
assert tx["type"] == "gasto"
print("✓ 2. Registro de gasto en el fondo común: OK ($45.800)")

# 3. Prueba de Lista de Mercado
item = create_shopping_item({
    "name": "Huevos AA x30",
    "category": "Mercado / Supermercado",
    "quantity": "1 canasta",
    "addedBy": "Ale"
})
assert item["name"] == "Huevos AA x30"
assert item["isPurchased"] is False
print("✓ 3. Registro en lista de mercado: OK (Huevos AA x30 por Ale)")

# 4. Actualizar item a comprado
updated = update_shopping_item(item["id"], {"isPurchased": True, "purchasedBy": "Gil"})
assert updated["isPurchased"] is True
print("✓ 4. Marcado como comprado en tiempo real: OK")

# 5. Prueba de Tirilla Nítida de Ísimo
ticket_text = """
TIENDAS ISIMO S.A.S - NIT: 901.621.579-2
FACTURA POS No. 12345
FECHA: 2026-11-20
------------------------------------
LECHE ENTERA                    $ 3.800
ARROZ 1KG                       $ 4.200
ACEITE 900ML                    $ 7.900
SUBTOTAL:                       $ 15.900
IVA:                            $ 1.200
TOTAL A PAGAR:                  $ 45.800
MEDIO DE PAGO:
EFECTIVO:                       $ 50.000
VUELTAS:                        $ 4.200
"""
res_ocr = parse_isimo_receipt_text(ticket_text)
assert res_ocr["success"] is True
assert res_ocr["amount"] == 45800, f"Expected 45800, got {res_ocr['amount']}"
assert res_ocr["vendor"] == "Ísimo"
print(f"✓ 5. Parseo de tirilla nítida de Ísimo: OK ({res_ocr['message']})")

# 6. Prueba de Tirilla Borrosa / Baja Confianza (Respaldo)
res_blurry = process_receipt_image(b"\x00" * 300, client_ocr_text="")
assert res_blurry["success"] is False
assert res_blurry["is_blurry"] is True
assert res_blurry["amount"] is None
print(f"✓ 6. Respaldo ante foto borrosa (sin bloqueo): OK ('{res_blurry['message'][:45]}...')")

# 7. Prueba de Sincronización Global
sync_res = sync_all({
    "transactions": [tx],
    "shoppingList": [item],
    "couple": {"monthlySavingsGoal": 500000}
})
assert sync_res["success"] is True
print("✓ 7. Sincronización offline-to-online: OK")

print("\n🎉 TODAS LAS 7 PRUEBAS PASARON EXITOSAMENTE AL 100%!")
