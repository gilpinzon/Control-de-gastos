"""
==============================================================================
DUOCONTROL | LANZADOR LOCAL DEL SERVIDOR FASTAPI (run_server.py)
Presupuesto Unificado Gil & Ale (Hogar) con soporte para PWA y Escáner Ísimo
Ejecución: python run_server.py
==============================================================================
"""

import os
import sys
import uvicorn

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if __name__ == "__main__":
    print("\n" + "=" * 70)
    print(" 🏡 DUOCONTROL — PRESUPUESTO UNIFICADO GIL & ALE (HOGAR)")
    print(" 💳 Moneda por defecto: COP ($)")
    print(" 📱 PWA & Service Worker: Habilitado con soporte iOS y Android")
    print(" 🧾 Escáner OCR de Facturas: Ísimo Colombia y Comercios POS")
    print(" 🚀 Servidor local: http://127.0.0.1:8000")
    print("=" * 70 + "\n")

    uvicorn.run("api.index:app", host="127.0.0.1", port=8000, reload=True)
