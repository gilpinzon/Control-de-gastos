"""
==============================================================================
DUOCONTROL | SERVIDOR API FASTAPI (api/index.py)
Endpoints compatibles con Vercel Serverless Python & Lanzador Local:
- /api/status
- /api/settings
- /api/transactions
- /api/shopping
- /api/sync
- /api/scan-receipt (Escaneo de facturas Ísimo Colombia / OCR)
==============================================================================
"""

import os
import sys
import base64
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Request, Response, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

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
    process_receipt_image,
    parse_isimo_receipt_text,
    process_and_save_receipt
)

app = FastAPI(
    title="DuoControl API",
    description="Presupuesto Unificado Gil & Ale (COP $) con Neon PostgreSQL y Escáner de Facturas Ísimo",
    version="3.0.0"
)

# Configuración CORS permisiva para PWA móvil y Vercel
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------------------
# 1. ESTADO DEL SISTEMA
# ------------------------------------------------------------------------------
@app.get("/api/status")
def get_status():
    """Verifica la conectividad y el estado del backend."""
    ws = get_workspace()
    return {
        "ok": True,
        "provider": "Neon PostgreSQL / Resilient Engine",
        "currency": ws.get("currency", "COP"),
        "symbol": ws.get("symbol", "$"),
        "workspace": ws.get("name", "Hogar Gil & Ale")
    }


# ------------------------------------------------------------------------------
# 2. CONFIGURACIÓN DEL HOGAR / WORKSPACE
# ------------------------------------------------------------------------------
@app.get("/api/settings")
def get_settings():
    """Consulta las configuraciones del hogar de Gil & Ale."""
    ws = get_workspace()
    return {"success": True, "workspace": ws}


@app.post("/api/settings")
async def save_settings(request: Request):
    """Actualiza configuraciones (moneda COP, meta de ahorro, correos)."""
    data = await request.json()
    update_workspace(data)
    return {"success": True, "workspace": get_workspace()}


# ------------------------------------------------------------------------------
# 3. TRANSACCIONES DEL FONDO COMÚN UNIFICADO
# ------------------------------------------------------------------------------
@app.get("/api/transactions")
def list_transactions():
    """Lista todos los ingresos y gastos registrados."""
    rows = get_transactions()
    return {"success": True, "transactions": rows}


@app.post("/api/transactions")
async def add_transaction(request: Request):
    """Crea una nueva transacción."""
    data = await request.json()
    try:
        tx = create_transaction(data)
        return JSONResponse(status_code=201, content={"success": True, "transaction": tx})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/transactions")
def remove_transaction(id: Optional[str] = Query(None)):
    """Elimina una transacción del fondo común."""
    if not id:
        raise HTTPException(status_code=400, detail="ID de transacción requerido")
    success = delete_transaction(id)
    return {"success": success}


# ------------------------------------------------------------------------------
# 4. LISTA DE MERCADO EN TIEMPO REAL
# ------------------------------------------------------------------------------
@app.get("/api/shopping")
def list_shopping():
    """Lista todos los artículos del mercado."""
    items = get_shopping_items()
    return {"success": True, "items": items}


@app.post("/api/shopping")
async def add_shopping_item(request: Request):
    """Agrega un producto a la lista de compras."""
    data = await request.json()
    try:
        item = create_shopping_item(data)
        return JSONResponse(status_code=201, content={"success": True, "item": item})
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.patch("/api/shopping")
async def patch_shopping_item(request: Request, id: Optional[str] = Query(None)):
    """Marca como comprado o actualiza un producto."""
    data = await request.json()
    target_id = id or data.get("id")
    if not target_id:
        raise HTTPException(status_code=400, detail="ID de artículo requerido")
    item = update_shopping_item(target_id, data)
    if not item:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    return {"success": True, "item": item}


@app.delete("/api/shopping")
def remove_shopping_item(id: Optional[str] = Query(None)):
    """Elimina un producto del mercado."""
    if not id:
        raise HTTPException(status_code=400, detail="ID de artículo requerido")
    success = delete_shopping_item(id)
    return {"success": success}


# ------------------------------------------------------------------------------
# 5. SINCRONIZACIÓN OFFLINE-TO-ONLINE
# ------------------------------------------------------------------------------
@app.get("/api/sync")
def get_sync_data():
    """Retorna el estado global completo para sincronización con el cliente."""
    return {
        "success": True,
        "transactions": get_transactions(),
        "shoppingList": get_shopping_items(),
        "workspace": get_workspace()
    }


@app.post("/api/sync")
async def sync_data(request: Request):
    """Sincroniza transacciones locales, compras y presupuesto en un solo paso."""
    payload = await request.json()
    result = sync_all(payload)
    return result


# ------------------------------------------------------------------------------
# 6. ESCANEO Y GUARDADO AUTOMÁTICO DE FACTURAS (D1, ÍSIMO, OLÍMPICA, ÉXITO, ETC.)
# ------------------------------------------------------------------------------
@app.post("/api/scan-receipt")
@app.post("/api/receipts/scan")
@app.post("/api/receipts/scan-and-save")
async def scan_receipt(
    file: Optional[UploadFile] = File(None),
    ocr_text: Optional[str] = Form(None),
    auto_save: Optional[str] = Form("true"),
    paid_by: Optional[str] = Form("Gil"),
    category: Optional[str] = Form("Mercado / Supermercado"),
    request: Request = None
):
    """
    Endpoint especializado para procesar y guardar facturas de supermercados (D1, Ísimo, Olímpica, etc.):
    - Aplica preprocesamiento térmico y detector de desenfoque.
    - Extrae el monto en COP descartando subtotales, impuestos y vueltas.
    - Si la foto es nítida y se leyó con confianza, GUARDA DIRECTAMENTE el gasto en Neon PostgreSQL / fondo común.
    - Si la foto es borrosa o el total no es claro, NO guarda datos falsos y devuelve estado de respaldo.
    """
    image_bytes = b""
    text_input = ocr_text
    should_auto_save = str(auto_save).lower() in ("true", "1", "yes")
    payer = paid_by or "Gil"
    cat = category or "Mercado / Supermercado"

    if file and hasattr(file, "read"):
        try:
            image_bytes = await file.read()
        except Exception:
            pass
    elif request and hasattr(request, "json"):
        try:
            body = await request.json()
            if "image_base64" in body:
                b64_data = body["image_base64"]
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                image_bytes = base64.b64decode(b64_data)
            if "ocr_text" in body and not text_input:
                text_input = body["ocr_text"]
            if "auto_save" in body:
                should_auto_save = bool(body["auto_save"])
            if "paid_by" in body:
                payer = body["paid_by"]
            if "category" in body:
                cat = body["category"]
        except Exception:
            pass

    return process_and_save_receipt(
        image_bytes=image_bytes,
        client_ocr_text=text_input,
        auto_save=should_auto_save,
        paid_by=payer,
        category=cat
    )


# ------------------------------------------------------------------------------
# 7. SERVIDO DE FRONTEND ESTÁTICO (INDEX.HTML, PWA, ASSETS) EN MODO LOCAL
# ------------------------------------------------------------------------------
@app.get("/")
@app.get("/index.html")
def serve_index():
    """Sirve la PWA Mobile de Gil & Ale."""
    index_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path, media_type="text/html")
    return Response(content="DuoControl App Ready", media_type="text/plain")


@app.get("/manifest.json")
def serve_manifest():
    """Sirve el manifiesto PWA con cabecera estricta."""
    path = os.path.join(BASE_DIR, "manifest.json")
    return FileResponse(path, media_type="application/manifest+json")


@app.get("/sw.js")
def serve_sw():
    """Sirve el Service Worker PWA con no-cache estricto."""
    path = os.path.join(BASE_DIR, "sw.js")
    response = FileResponse(path, media_type="application/javascript")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


@app.get("/app.js")
def serve_app_js():
    return FileResponse(os.path.join(BASE_DIR, "app.js"), media_type="application/javascript")


@app.get("/app.css")
def serve_app_css():
    return FileResponse(os.path.join(BASE_DIR, "app.css"), media_type="text/css")


# Montar carpetas estáticas para iconos y fotos
icons_dir = os.path.join(BASE_DIR, "icons")
if os.path.exists(icons_dir):
    app.mount("/icons", StaticFiles(directory=icons_dir), name="icons")
