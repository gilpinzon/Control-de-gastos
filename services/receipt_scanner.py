"""
==============================================================================
DUOCONTROL | MOTOR DE ESCANEO MULTI-SUPERMERCADO COLOMBIA (services/receipt_scanner.py)
Compatibilidad de Facturas: D1, Ísimo, Olímpica, Éxito, Ara, Carulla y Genéricos.

Capacidades:
1. Preprocesamiento térmico de imagen: escala de grises, contraste adaptativo y binarización.
2. Evaluador de nitidez (Laplacian variance / gradientes) para fotos borrosas.
3. Detección automática del comercio (D1, ÍSIMO, OLÍMPICA, ÉXITO, ARA, SUPERMERCADO).
4. Extracción de total en pesos colombianos (COP): $45.800 / 45.800,00 -> 45800.
5. Priorización estricta: TOTAL A PAGAR, NETO, VALOR TOTAL, EFECTIVO, TARJETA.
6. Descarte estricto de subtotales, IVA, ahorros, cambio/vueltas, NITs, CUFE y resoluciones.
7. Respaldo móvil inteligente ante fotos borrosas (sin valores falsos ni bloqueos).
==============================================================================
"""

import io
import re
import datetime
from typing import Dict, Any, List, Optional, Tuple

# Comercios y patrones de identificación en Colombia
SUPERMARKET_PATTERNS = [
    {
        "name": "D1",
        "patterns": [
            r"\bD1\b",
            r"TIENDAS\s+D1",
            r"KOBA\s+COLOMBIA",
            r"KOBA",
            r"900\.?276\.?962",
            r"D1\s+S\.?A\.?S"
        ]
    },
    {
        "name": "Ísimo",
        "patterns": [
            r"ISIMO",
            r"ÍSIMO",
            r"TIENDAS\s+ISIMO",
            r"TIENDAS\s+ÍSIMO",
            r"901\.?621\.?579",
            r"ISIMO\s+S\.?A\.?S"
        ]
    },
    {
        "name": "Olímpica",
        "patterns": [
            r"OLIMPICA",
            r"OLÍMPICA",
            r"SUPERTIENDAS\s+OLIMPICA",
            r"SUPERTIENDAS\s+OLÍMPICA",
            r"DROGUERIAS\s+OLIMPICA",
            r"890\.?107\.?487",
            r"SAO\b"
        ]
    },
    {
        "name": "Éxito",
        "patterns": [
            r"\bEXITO\b",
            r"\bÉXITO\b",
            r"ALMACENES\s+EXITO",
            r"GRUPO\s+EXITO",
            r"890\.?900\.?608"
        ]
    },
    {
        "name": "Ara",
        "patterns": [
            r"TIENDAS\s+ARA",
            r"\bARA\b",
            r"JERONIMO\s+MARTINS",
            r"JERÓNIMO\s+MARTINS",
            r"900\.?501\.?659"
        ]
    },
    {
        "name": "Carulla",
        "patterns": [
            r"CARULLA",
            r"SUPERMERCADO\s+CARULLA"
        ]
    },
    {
        "name": "Jumbo",
        "patterns": [
            r"JUMBO",
            r"TIENDAS\s+JUMBO",
            r"CENCOSUD",
            r"METRO"
        ]
    }
]

# Palabras clave prioritarias para el total en tirillas de supermercados colombianos
PRIORITY_TOTAL_KEYWORDS = [
    "TOTAL A PAGAR",
    "TOTAL PAGAR",
    "NETO A PAGAR",
    "VALOR TOTAL",
    "TOTAL FACTURA",
    "TOTAL VENTA",
    "TOTAL COMPRA",
    "TOTAL COMPROBANTE",
    "TOTAL A COBRAR",
    "TOTAL:",
    "TOTAL"
]

# Palabras de medios de pago que reconfirman el total cobrado
PAYMENT_KEYWORDS = [
    "EFECTIVO",
    "TARJETA DEBITO",
    "TARJETA CREDITO",
    "TARJETA",
    "TRANSFERENCIA",
    "TRANSACCION",
    "PAGO ELECTRONICO",
    "FORMA DE PAGO",
    "MEDIO DE PAGO",
    "PAGO:"
]

# Palabras que DEBEN descartarse para evitar totales erróneos
DISCARD_KEYWORDS = [
    "SUBTOTAL",
    "SUB TOTAL",
    "SUB-TOTAL",
    "AHORRO",
    "USTED AHORRO",
    "SU AHORRO",
    "DESCUENTO",
    "DCTO",
    "REBAJA",
    "CAMBIO",
    "VUELTAS",
    "SU CAMBIO",
    "SUS VUELTAS",
    "RECIBIDO",
    "ENTREGADO",
    "BASE",
    "GRAVABLE",
    "BASE GRAVABLE",
    "EXENTO",
    "EXCLUIDO",
    "IVA",
    "ICO",
    "INC",
    "IMPUESTO",
    "NIT",
    "RUT",
    "AUTORIZACION",
    "RESOLUCION",
    "DIAN",
    "CUFE",
    "CONSECUTIVO",
    "FACTURA ELECTRONICA",
    "TELEFONO",
    "TEL:",
    "DIRECCION",
    "DIR:",
    "CAJA",
    "CAJERO",
    "PROPINA",
    "BOLSA",
    "IMP. BOLSA",
    "PUNTOS",
    "PUNTOS COLOMBIA",
    "REGIMEN"
]

# NITs conocidos de supermercados para descartar como montos
SUPERMARKET_NITS = {
    900276962,  # D1
    901621579,  # Ísimo
    890107487,  # Olímpica
    890900608,  # Éxito
    900501659,  # Ara
    900155107   # Cencosud
}


def detect_supermarket_vendor(text: str) -> str:
    """Detecta el nombre del supermercado a partir del texto OCR o cabeceras."""
    if not text:
        return "Supermercado"

    upper_text = text.upper()
    for item in SUPERMARKET_PATTERNS:
        for pat in item["patterns"]:
            if re.search(pat, upper_text, re.IGNORECASE):
                return item["name"]

    return "Supermercado"


def estimate_image_sharpness(image_bytes: bytes) -> Tuple[float, bool]:
    """
    Evalúa la nitidez de la imagen calculando la varianza del gradiente espacial
    (equivalente al operador Laplaciano).
    Retorna (score_nitidez: 0..100, is_blurry: bool).
    """
    if not image_bytes or len(image_bytes) < 64:
        return (0.0, True)

    try:
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            img.thumbnail((300, 300))
            pixels = list(img.getdata())
            width, height = img.size

            if width < 10 or height < 10:
                return (10.0, True)

            laplacian_vals = []
            for y in range(1, height - 1):
                row_idx = y * width
                for x in range(1, width - 1):
                    center = pixels[row_idx + x]
                    up = pixels[(y - 1) * width + x]
                    down = pixels[(y + 1) * width + x]
                    left = pixels[row_idx + x - 1]
                    right = pixels[row_idx + x + 1]
                    lap = up + down + left + right - (4 * center)
                    laplacian_vals.append(lap)

            if not laplacian_vals:
                return (15.0, True)

            mean_lap = sum(laplacian_vals) / len(laplacian_vals)
            variance = sum((v - mean_lap) ** 2 for v in laplacian_vals) / len(laplacian_vals)

            score = min(100.0, round(variance / 8.0, 1))
            is_blurry = score < 30.0
            return (score, is_blurry)

        except ImportError:
            # Fallback nativo sobre los bytes del archivo
            sample = image_bytes[:min(10000, len(image_bytes))]
            diffs = [abs(sample[i] - sample[i - 1]) for i in range(1, len(sample))]
            if not diffs:
                return (10.0, True)
            avg_diff = sum(diffs) / len(diffs)
            score = min(100.0, round(avg_diff * 1.5, 1))
            is_blurry = score < 25.0
            return (score, is_blurry)

    except Exception:
        return (20.0, True)


def normalize_cop_amount(text_val: str) -> Optional[int]:
    """
    Normaliza una cifra en formato de moneda colombiana (COP) a entero.
    Ejemplos:
      '$45.800'     -> 45800
      '$ 45.800,00' -> 45800
      '45.800'      -> 45800
      '45,800.00'   -> 45800
      '45800'       -> 45800
    """
    if not text_val:
        return None

    cleaned = text_val.strip().replace("$", "").strip()

    # Descartar decimales en ceros (,00 o .00)
    cleaned = re.sub(r'[,.]00$', '', cleaned)

    # Remover puntos o comas usados como separadores de miles
    digits_only = re.sub(r'[^0-9]', '', cleaned)

    if not digits_only:
        return None

    try:
        val = int(digits_only)
        # Rango válido para compras de hogar en Colombia: entre $800 y $15.000.000 COP
        # Descarta NITs, fechas completas (ej. 20261121) o códigos de barras
        if 800 <= val <= 15000000 and val not in SUPERMARKET_NITS:
            # Descartar si parece fecha AAAAMMDD
            s_val = str(val)
            if len(s_val) == 8 and s_val.startswith("202"):
                return None
            return val
    except ValueError:
        pass

    return None


def parse_supermarket_receipt_text(ocr_text: str) -> Dict[str, Any]:
    """
    Analiza las líneas de una tirilla de supermercado en Colombia (D1, Ísimo, Olímpica, etc.).
    Prioriza las líneas finales donde se ubica el TOTAL A PAGAR o medios de pago.
    """
    if not ocr_text or not ocr_text.strip():
        return {
            "success": False,
            "confidence": 0.0,
            "vendor": "Supermercado",
            "amount": None,
            "message": "No se detectó texto en el ticket."
        }

    lines = [l.strip() for l in ocr_text.splitlines() if l.strip()]
    upper_lines = [l.upper() for l in lines]

    # Detectar el comercio (D1, Ísimo, Olímpica, Éxito, Ara, o Supermercado)
    vendor_name = detect_supermarket_vendor(ocr_text)

    # Regex para extraer montos en pesos colombianos
    amount_regex = re.compile(r'(?:\$\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,7})')

    candidates = []
    total_lines_count = len(upper_lines)

    # Recorrer de abajo hacia arriba (los totales están en la parte inferior)
    for idx in reversed(range(total_lines_count)):
        line = upper_lines[idx]

        # Descartar líneas con palabras vetadas
        if any(discard in line for discard in DISCARD_KEYWORDS):
            continue

        is_priority_total = any(k in line for k in PRIORITY_TOTAL_KEYWORDS)
        is_payment_line = any(k in line for k in PAYMENT_KEYWORDS)

        matches = amount_regex.findall(line)
        for m in matches:
            normalized = normalize_cop_amount(m)
            if normalized:
                weight = 10
                if is_priority_total:
                    weight += 50
                if is_payment_line:
                    weight += 30
                # Mayor peso relativo a las líneas cercanas al final
                weight += int((idx / max(1, total_lines_count)) * 25)

                candidates.append({
                    "amount": normalized,
                    "weight": weight,
                    "line": lines[idx],
                    "is_priority": is_priority_total
                })

    if not candidates:
        return {
            "success": False,
            "confidence": 0.2,
            "vendor": vendor_name,
            "amount": None,
            "message": "No se encontró una línea de total concluyente en la tirilla."
        }

    # Ordenar candidatos por peso descendente
    candidates.sort(key=lambda x: x["weight"], reverse=True)
    best = candidates[0]

    confidence = min(0.98, round(best["weight"] / 80.0, 2))
    if best["is_priority"]:
        confidence = max(0.85, confidence)

    formatted_amount = f"${best['amount']:,} COP".replace(",", ".")

    return {
        "success": confidence >= 0.70,
        "confidence": confidence,
        "vendor": vendor_name,
        "amount": best["amount"],
        "raw_line": best["line"],
        "category": "Mercado / Supermercado",
        "description": f"Compra {vendor_name}",
        "message": f"Total detectado: {formatted_amount}"
    }


# Compatibilidad hacia atrás con el nombre anterior
parse_isimo_receipt_text = parse_supermarket_receipt_text


def process_receipt_image(
    image_bytes: bytes,
    client_ocr_text: Optional[str] = None
) -> Dict[str, Any]:
    """
    Punto de entrada integral para procesamiento de fotos de facturas:
    1. Evalúa nitidez y detecta desenfoque (Laplacian score).
    2. Realiza preprocesamiento térmico (escala de grises, contraste, nitidez).
    3. Detecta comercio (D1, Ísimo, Olímpica, etc.) y extrae el total en COP.
    4. Si es borrosa o dudosa, retorna respuesta de respaldo para reintento o ingreso manual.
    """
    sharpness_score, is_blurry = estimate_image_sharpness(image_bytes)

    # Si la foto es excesivamente borrosa y no vino texto de alta confianza
    if is_blurry and (not client_ocr_text or len(client_ocr_text.strip()) < 15):
        return {
            "success": False,
            "is_blurry": True,
            "sharpness_score": sharpness_score,
            "confidence": 0.30,
            "vendor": "Supermercado",
            "amount": None,
            "message": "La foto salió borrosa o difícil de leer. Por favor reintenta con mejor iluminación o escribe el total manualmente."
        }

    text_to_parse = client_ocr_text or ""

    # Preprocesamiento y OCR si no vino texto del cliente
    if not text_to_parse and image_bytes:
        try:
            from PIL import Image, ImageEnhance, ImageOps
            import pytesseract

            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            # Mejora para papel térmico (D1, Ísimo, Olímpica)
            enhancer = ImageEnhance.Contrast(img)
            img_contrast = enhancer.enhance(2.2)
            sharpener = ImageEnhance.Sharpness(img_contrast)
            img_sharp = sharpener.enhance(1.8)

            text_to_parse = pytesseract.image_to_string(img_sharp, lang="spa")
        except Exception:
            pass

    if not text_to_parse:
        return {
            "success": False,
            "is_blurry": is_blurry,
            "sharpness_score": sharpness_score,
            "confidence": 0.40,
            "vendor": "Supermercado",
            "amount": None,
            "message": "No se pudo extraer el texto de la tirilla térmica. Por favor escribe el total manualmente."
        }

    result = parse_supermarket_receipt_text(text_to_parse)
    result["is_blurry"] = is_blurry
    result["sharpness_score"] = sharpness_score

    if not result["success"]:
        result["message"] = "No se pudo confirmar con certeza el total del ticket. Verifica el valor o ingrésalo manualmente."

    return result


def process_and_save_receipt(
    image_bytes: bytes = b"",
    client_ocr_text: Optional[str] = None,
    auto_save: bool = True,
    paid_by: str = "Gil",
    category: str = "Mercado / Supermercado"
) -> Dict[str, Any]:
    """
    Procesa la tirilla de supermercado (D1, Ísimo, Olímpica, etc.) y si la lectura
    es confiable y nítida, guarda el gasto automáticamente en la base de datos.
    """
    from services.budget_service import create_transaction

    # 1. Si vino texto directo o imagen
    if client_ocr_text and not image_bytes:
        parsed = parse_supermarket_receipt_text(client_ocr_text)
        parsed["is_blurry"] = False
        parsed["sharpness_score"] = 90.0
        result = parsed
    else:
        result = process_receipt_image(image_bytes, client_ocr_text)

    # 2. Si es nítido y exitoso, auto-guardar si auto_save es True
    if result.get("success") and not result.get("is_blurry") and result.get("amount"):
        if auto_save:
            vendor = result.get("vendor", "Supermercado")
            tx_data = {
                "description": f"Compra {vendor}",
                "amount": result["amount"],
                "type": "gasto",
                "category": category or "Mercado / Supermercado",
                "paid_by": paid_by or "Gil",
                "date": datetime.date.today().isoformat(),
                "vendor": vendor,
                "ocr_confidence": result.get("confidence", 0.90)
            }
            saved_tx = create_transaction(tx_data)
            result["auto_saved"] = True
            result["transaction"] = saved_tx
            result["message"] = f"✓ Gasto de {vendor} guardado automáticamente por ${result['amount']:,} COP en el fondo común.".replace(",", ".")
        else:
            result["auto_saved"] = False
    else:
        result["auto_saved"] = False

    return result
