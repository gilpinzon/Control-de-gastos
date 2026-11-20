"""
==============================================================================
DUOCONTROL | MOTOR DE ESCANEO DE FACTURAS ÍSIMO COLOMBIA (services/receipt_scanner.py)
Capacidades:
1. Preprocesamiento de imagen: escala de grises, realce de contraste térmico y umbralización.
2. Detección y evaluación de nitidez (Laplacian variance / Blur score) para fotos borrosas.
3. Extracción y normalización de moneda colombiana (COP): $45.800 -> 45800 entero.
4. Priorización estricta de líneas finales (TOTAL A PAGAR, TOTAL, NETO, EFECTIVO, TARJETA).
5. Descarte de subtotales, IVA, ahorros, vueltas, NIT, CUFE y códigos de resolución.
6. Manejo de respaldo ante fotos borrosas sin bloquear el flujo del usuario.
==============================================================================
"""

import io
import re
import math
import struct
from typing import Dict, Any, List, Optional, Tuple

# Palabras clave prioritarias para el total en tirillas de Ísimo y POS colombiano
PRIORITY_TOTAL_KEYWORDS = [
    "TOTAL A PAGAR",
    "TOTAL PAGAR",
    "NETO A PAGAR",
    "VALOR TOTAL",
    "TOTAL COMPRA",
    "TOTAL FACTURA",
    "TOTAL VENTA",
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
    "PAGO:",
    "FORMA DE PAGO",
    "MEDIO DE PAGO"
]

# Palabras que DEBEN descartarse para no confundir con el total real
DISCARD_KEYWORDS = [
    "SUBTOTAL",
    "SUB TOTAL",
    "AHORRO",
    "DESCUENTO",
    "REBAJA",
    "CAMBIO",
    "VUELTAS",
    "RECIBIDO",
    "BASE",
    "GRAVABLE",
    "IVA",
    "ICO",
    "INC",
    "EXENTO",
    "NIT",
    "AUTORIZACION",
    "RESOLUCION",
    "DIAN",
    "CUFE",
    "CONSECUTIVO",
    "TELEFONO",
    "TEL:",
    "CAJA",
    "CAJERO",
    "PROPINA",
    "REGIMEN"
]

# Identificadores de tiendas Ísimo
ISIMO_IDENTIFIERS = [
    "ISIMO",
    "TIENDAS ISIMO",
    "ISIMO S.A.S",
    "901621579",
    "901.621.579"
]


def estimate_image_sharpness(image_bytes: bytes) -> Tuple[float, bool]:
    """
    Evalúa la nitidez de la imagen calculando la varianza del gradiente espacial
    (equivalente al operador Laplaciano).
    Retorna (score_nitidez: 0..100, is_blurry: bool).
    """
    if not image_bytes or len(image_bytes) < 64:
        return (0.0, True)

    try:
        # Intentar con PIL si estuviera disponible en el entorno
        try:
            from PIL import Image
            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            # Reducir tamaño para cálculo rápido y representativo
            img.thumbnail((300, 300))
            pixels = list(img.getdata())
            width, height = img.size

            if width < 10 or height < 10:
                return (10.0, True)

            # Cálculo de la varianza del Laplaciano en escala de grises
            laplacian_vals = []
            for y in range(1, height - 1):
                row_idx = y * width
                for x in range(1, width - 1):
                    # Kernel [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
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
            
            # Normalización del score de nitidez a escala 0..100
            score = min(100.0, round(variance / 8.0, 1))
            is_blurry = score < 35.0
            return (score, is_blurry)

        except ImportError:
            # Análisis nativo de bytes de imagen (gradientes de compresión / entropía de frecuencias)
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

    # Si trae decimales en ceros (,00 o .00), descartarlos
    cleaned = re.sub(r'[,.]00$', '', cleaned)

    # Remover puntos o comas usados como separadores de miles
    digits_only = re.sub(r'[^0-9]', '', cleaned)

    if not digits_only:
        return None

    try:
        val = int(digits_only)
        # Rango válido para compras de hogar en Colombia: entre $1.000 y $15.000.000 COP
        # Descarta NITs (ej. 901621579), fechas (20261120) o códigos de barras
        if 800 <= val <= 10000000 and val != 901621579:
            return val
    except ValueError:
        pass

    return None


def parse_isimo_receipt_text(ocr_text: str) -> Dict[str, Any]:
    """
    Analiza las líneas del ticket de compra de Ísimo con reglas colombianas POS.
    Prioriza las líneas finales donde se ubica el TOTAL A PAGAR.
    """
    if not ocr_text or not ocr_text.strip():
        return {
            "success": False,
            "confidence": 0.0,
            "vendor": "Ísimo",
            "amount": None,
            "message": "No se detectó texto en el ticket."
        }

    lines = [l.strip() for l in ocr_text.splitlines() if l.strip()]
    upper_lines = [l.upper() for l in lines]

    # Verificar si es un ticket de Ísimo
    is_isimo = any(any(ident in l for ident in ISIMO_IDENTIFIERS) for l in upper_lines)
    vendor_name = "Ísimo" if is_isimo else "Supermercado"

    # Regex para extraer montos en pesos colombianos
    amount_regex = re.compile(r'(?:\$\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,7})')

    candidates = []

    # Recorrer de abajo hacia arriba (las líneas finales contienen los totales)
    total_lines_count = len(upper_lines)
    for idx in reversed(range(total_lines_count)):
        line = upper_lines[idx]

        # Verificar si la línea contiene palabras de descarte
        if any(discard in line for discard in DISCARD_KEYWORDS):
            continue

        # Prioridad 1: Línea con etiqueta de TOTAL A PAGAR
        is_priority_total = any(k in line for k in PRIORITY_TOTAL_KEYWORDS)
        is_payment_line = any(k in line for k in PAYMENT_KEYWORDS)

        # Buscar cifras en la línea
        matches = amount_regex.findall(line)
        for m in matches:
            normalized = normalize_cop_amount(m)
            if normalized:
                # Calcular peso / confianza según posición y etiqueta
                weight = 10
                if is_priority_total:
                    weight += 50
                if is_payment_line:
                    weight += 30
                # Líneas más cercanas al final tienen mayor peso
                weight += int((idx / max(1, total_lines_count)) * 20)

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

    return {
        "success": confidence >= 0.70,
        "confidence": confidence,
        "vendor": vendor_name,
        "amount": best["amount"],
        "raw_line": best["line"],
        "category": "Mercado / Supermercado",
        "description": f"Compra {vendor_name}",
        "message": f"Total detectado: ${best['amount']:,} COP".replace(",", ".")
    }


def process_receipt_image(
    image_bytes: bytes,
    client_ocr_text: Optional[str] = None
) -> Dict[str, Any]:
    """
    Punto de entrada integral:
    1. Evalúa nitidez y detecta si está borrosa.
    2. Aplica preprocesamiento para compensar el contraste débil del papel térmico.
    3. Extrae y normaliza el total de Ísimo en pesos colombianos (COP).
    4. Si es borrosa o dudosa, retorna respuesta de respaldo para reintento o ingreso manual.
    """
    sharpness_score, is_blurry = estimate_image_sharpness(image_bytes)

    # Si la foto es excesivamente borrosa y no vino texto de alta confianza, activar respaldo
    if is_blurry and (not client_ocr_text or len(client_ocr_text.strip()) < 15):
        return {
            "success": False,
            "is_blurry": True,
            "sharpness_score": sharpness_score,
            "confidence": 0.30,
            "vendor": "Ísimo",
            "amount": None,
            "message": "La foto salió borrosa o difícil de leer. Por favor reintenta con mejor iluminación o escribe el total manualmente."
        }

    # Texto a analizar: priorizar OCR provisto o heurístico
    text_to_parse = client_ocr_text or ""

    # Si no se pasó texto desde el cliente, intentar extracción con Tesseract si está disponible
    if not text_to_parse:
        try:
            import pytesseract
            from PIL import Image, ImageEnhance, ImageOps

            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            # Preprocesamiento térmico: aumentar contraste y nitidez
            enhancer = ImageEnhance.Contrast(img)
            img_contrast = enhancer.enhance(2.0)
            sharpener = ImageEnhance.Sharpness(img_contrast)
            img_sharp = sharpener.enhance(1.8)

            text_to_parse = pytesseract.image_to_string(img_sharp, lang="spa")
        except Exception:
            pass

    # Si aún no hay texto, simular lectura básica para pruebas o pedir ingreso manual
    if not text_to_parse:
        return {
            "success": False,
            "is_blurry": is_blurry,
            "sharpness_score": sharpness_score,
            "confidence": 0.40,
            "vendor": "Ísimo",
            "amount": None,
            "message": "No se pudo extraer el texto de la tirilla térmica. Por favor escribe el total manualmente."
        }

    # Analizar el texto con el parser especializado de Ísimo
    result = parse_isimo_receipt_text(text_to_parse)
    result["is_blurry"] = is_blurry
    result["sharpness_score"] = sharpness_score

    # Ajustar mensaje si la confianza es media o baja
    if not result["success"]:
        result["message"] = "No se pudo confirmar con certeza el total del ticket. Verifica el valor o ingrésalo manualmente."

    return result
