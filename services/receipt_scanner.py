"""
==============================================================================
DUOCONTROL | MOTOR DE ESCANEO MULTI-SUPERMERCADO COLOMBIA (services/receipt_scanner.py)
Compatibilidad de Facturas: D1, Ísimo, Olímpica, Éxito, Ara, Carulla, Jumbo y Genéricos.

Capacidades Avanzadas:
1. Preprocesamiento térmico: transposición EXIF (iPhone/Android), autocontraste, nitidez y binarización.
2. Estimador de nitidez relajado (Laplacian variance) sin falsos positivos en iPhone 13.
3. Extracción de productos por línea: descripción, unidad (UND, KG, PAQ...), cantidad y valor COP.
4. Extracción de Total Final de compra descartando bases de impuestos (IV=19%, EX=0%), ahorros y vueltas.
5. Guardado automático directo en BD con detalle de ítems de la compra.
6. Aviso de respaldo solo si la factura es verdaderamente ilegible o sin total.
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

# Palabras clave prioritarias para el total final en tirillas de supermercados colombianos
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
    "TOTAL GENERAL",
    "TOTAL:",
    "TOTAL"
]

# Palabras de medios de pago que reconfirman el total cobrado
PAYMENT_KEYWORDS = [
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

# Palabras que DEBEN descartarse para evitar totales erróneos (impuestos, vueltas, etc.)
DISCARD_TOTAL_KEYWORDS = [
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

# Unidades comunes en facturas colombianas
RECOGNIZED_UNITS = {"UND", "UN", "U", "KG", "KGS", "KILO", "KILOS", "GR", "G", "GRAMOS", "L", "LT", "LITRO", "PAQ", "PQ", "PAQUETE", "PZA", "BOLSA", "LATA", "BOTELLA"}


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

    # Descartar sufijos de impuestos como (EX), IV=19%, EX=0% si vienen pegados
    cleaned = re.sub(r'(?:IV|EX|IVA|ICO)\s*=?\s*[0-9]+%?', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\([A-Z0-9%=]+\)', '', cleaned, flags=re.IGNORECASE).strip()

    # Descartar decimales en ceros (,00 o .00)
    cleaned = re.sub(r'[,.]00$', '', cleaned)

    # Remover puntos o comas usados como separadores de miles
    digits_only = re.sub(r'[^0-9]', '', cleaned)

    if not digits_only:
        return None

    try:
        val = int(digits_only)
        # Rango válido para compras de hogar en Colombia: entre $500 y $20.000.000 COP
        if 500 <= val <= 20000000 and val not in SUPERMARKET_NITS:
            # Descartar si parece fecha AAAAMMDD (ej. 20261121)
            s_val = str(val)
            if len(s_val) == 8 and s_val.startswith("202"):
                return None
            return val
    except ValueError:
        pass

    return None


def preprocess_receipt_image(image_bytes: bytes) -> bytes:
    """
    Preprocesamiento especializado para tirillas térmicas (D1, Ísimo, Olímpica, etc.):
    - Corrige orientación EXIF (típica en iPhone 13 y Android).
    - Convierte a escala de grises y aplica autocontraste para compensar tinta térmica débil.
    - Incrementa contraste y nitidez sin saturar el fondo.
    """
    if not image_bytes or len(image_bytes) < 64:
        return image_bytes

    try:
        from PIL import Image, ImageOps, ImageEnhance

        img = Image.open(io.BytesIO(image_bytes))

        # 1. Corrección de rotación nativa EXIF (iPhone portrait/landscape)
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # 2. Redimensionar inteligentemente si es enorme (> 2000px) para acelerar sin perder nitidez de texto
        max_dim = 1920
        w, h = img.size
        if max(w, h) > max_dim:
            scale = max_dim / float(max(w, h))
            img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

        # 3. Escala de grises
        gray = img.convert("L")

        # 4. Normalización de sombras y contraste térmico
        try:
            contrasted = ImageOps.autocontrast(gray, cutoff=1)
        except Exception:
            contrasted = gray

        enhancer = ImageEnhance.Contrast(contrasted)
        boosted = enhancer.enhance(2.0)

        sharpener = ImageEnhance.Sharpness(boosted)
        sharpened = sharpener.enhance(1.8)

        out_buf = io.BytesIO()
        sharpened.save(out_buf, format="JPEG", quality=90)
        return out_buf.getvalue()

    except Exception:
        return image_bytes


def estimate_image_sharpness(image_bytes: bytes) -> Tuple[float, bool]:
    """
    Evalúa la nitidez de la imagen calculando la varianza de Laplace sobre un parche central.
    Calibrado para NO dar falsos positivos en iPhone 13 ni en papel térmico de bajo contraste.
    Retorna (score: 0..100, is_blurry: bool).
    """
    if not image_bytes or len(image_bytes) < 64:
        return (0.0, True)

    try:
        try:
            from PIL import Image, ImageOps

            img = Image.open(io.BytesIO(image_bytes))
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass

            gray = img.convert("L")
            w, h = gray.size

            if w < 20 or h < 20:
                return (10.0, True)

            # Tomar un parche central representativo de hasta 400x400 (sin encoger todo el recibo a 300x300)
            crop_w = min(w, 400)
            crop_h = min(h, 400)
            left = (w - crop_w) // 2
            top = (h - crop_h) // 2
            patch = gray.crop((left, top, left + crop_w, top + crop_h))

            pixels = list(patch.getdata())
            pw, ph = patch.size

            laplacian_vals = []
            # Muestrear píxeles con salto para rendimiento rápido
            step = 2
            for y in range(1, ph - 1, step):
                row_idx = y * pw
                for x in range(1, pw - 1, step):
                    center = pixels[row_idx + x]
                    up = pixels[(y - 1) * pw + x]
                    down = pixels[(y + 1) * pw + x]
                    left_p = pixels[row_idx + x - 1]
                    right_p = pixels[row_idx + x + 1]
                    lap = up + down + left_p + right_p - (4 * center)
                    laplacian_vals.append(lap)

            if not laplacian_vals:
                return (50.0, False)

            mean_lap = sum(laplacian_vals) / len(laplacian_vals)
            variance = sum((v - mean_lap) ** 2 for v in laplacian_vals) / len(laplacian_vals)

            # Score normalizado de nitidez
            score = min(100.0, round(variance / 12.0, 1))

            # Umbral permisivo: solo consideramos borrosa si la varianza es casi nula (< 8.0)
            is_blurry = score < 8.0
            return (score, is_blurry)

        except ImportError:
            sample = image_bytes[:min(10000, len(image_bytes))]
            diffs = [abs(sample[i] - sample[i - 1]) for i in range(1, len(sample))]
            if not diffs:
                return (0.0, True)
            avg_diff = sum(diffs) / len(diffs)
            score = min(100.0, round(avg_diff * 1.5, 1))
            return (score, score < 6.0)

    except Exception:
        return (0.0, True)


def extract_receipt_items(ocr_text: str) -> List[Dict[str, Any]]:
    """
    Extrae los productos/artículos individuales de la tirilla de supermercado:
    - Descripción del producto (nombre)
    - Cantidad y Unidad (ej. 2 UND, 1 KG, 3 PAQ...)
    - Valor unitario y valor total en COP de cada línea.
    - Filtra y descarta líneas de impuestos (IV=19%, EX=0%), cabeceras, subtotales y medios de pago.
    """
    if not ocr_text or not ocr_text.strip():
        return []

    lines = [l.strip() for l in ocr_text.splitlines() if l.strip()]
    items: List[Dict[str, Any]] = []

    # Regex para detectar precios en pesos COP
    price_pattern = re.compile(r'(?:\$\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{3,7})')

    # Regex para multiplicadores tipo: '2 UND X 4.200', '2 X 4.200', '1.5 KG X 8.000'
    qty_unit_mult_pattern = re.compile(
        r'(\d+(?:[.,]\d+)?)\s*(UND|UN|U|KG|KGS|GR|G|L|LT|PAQ|PQ|PZA|BOLSA)?\s*[xX*]\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{3,7})',
        re.IGNORECASE
    )

    # Palabras que descartan que una línea sea un producto de compra
    header_footer_filter = [
        "NIT", "TIENDAS", "SUPERTIENDAS", "ALMACENES", "FACTURA", "ELECTRONICA",
        "RESOLUCION", "AUTORIZACION", "DIAN", "CUFE", "FECHA", "HORA", "CAJA",
        "CAJERO", "TELEFONO", "DIRECCION", "SUBTOTAL", "TOTAL", "VALOR TOTAL",
        "NETO A PAGAR", "BASE", "GRAVABLE", "IVA", "ICO", "INC", "IMPUESTO",
        "EFECTIVO", "TARJETA", "CAMBIO", "VUELTAS", "AHORRO", "PUNTOS", "REGIMEN",
        "DESCRIPCION", "CANT", "VR.UNIT", "VALOR", "ARTICULO"
    ]

    i = 0
    total_lines = len(lines)

    while i < total_lines:
        line = lines[i]
        upper_line = line.upper()

        # Si llegamos a la sección de totales, detenemos la extracción de ítems
        if any(kw in upper_line for kw in ["SUBTOTAL", "TOTAL A PAGAR", "NETO A PAGAR", "VALOR TOTAL", "TOTAL GENERAL"]) or (upper_line.startswith("TOTAL") and len(upper_line) < 25):
            break

        # Descartar cabeceras, resoluciones o metadatos
        if any(f in upper_line for f in header_footer_filter):
            i += 1
            continue

        # Caso A: Estructura de 2 líneas (Línea 1 = Nombre producto, Línea 2 = 2 UND X 4.200 8.400)
        # Común en D1 e Ísimo
        if i + 1 < total_lines:
            next_line = lines[i + 1]
            next_upper = next_line.upper()
            mult_match = qty_unit_mult_pattern.search(next_line)

            if mult_match:
                prod_name = re.sub(r'^[0-9]{5,14}\s+', '', line).strip()  # Quitar código de barras inicial si viene
                # Quitar marcas de impuestos de la descripción
                prod_name = re.sub(r'\s*\([A-Z0-9%=]+\)', '', prod_name).strip()

                if len(prod_name) >= 3 and not any(f in prod_name.upper() for f in header_footer_filter):
                    qty_str = mult_match.group(1).replace(",", ".")
                    quantity = float(qty_str) if "." in qty_str else int(float(qty_str))
                    unit = (mult_match.group(2) or "UND").upper()
                    unit_price = normalize_cop_amount(mult_match.group(3)) or 0

                    # Buscar el total de la línea (último monto en la línea 2)
                    all_prices = price_pattern.findall(next_line)
                    line_total = 0
                    if all_prices:
                        line_total = normalize_cop_amount(all_prices[-1]) or 0
                    if line_total == 0 and unit_price > 0:
                        line_total = int(quantity * unit_price)

                    if line_total > 0:
                        items.append({
                            "name": prod_name.title(),
                            "quantity": quantity,
                            "unit": unit,
                            "unit_price": unit_price or int(line_total / max(1, quantity)),
                            "total_price": line_total
                        })
                        i += 2
                        continue

        # Caso B: Estructura de 1 sola línea (ej. 'LECHE ENTERA 2 UND 8.400' o 'ARROZ BLANCO 1 4.500')
        # Limpiar impuestos tipo (EX), (19%), IV=19%, EX=0% de la línea
        clean_line = re.sub(r'(?:IV|EX|IVA|ICO)\s*=?\s*[0-9]+%?', '', line, flags=re.IGNORECASE)
        clean_line = re.sub(r'\([A-Z0-9%=]+\)', '', clean_line).strip()

        all_amounts = price_pattern.findall(clean_line)
        if all_amounts:
            # Buscar si tiene unidad y cantidad explícita
            # e.g. "2 UND" o "1 KG"
            unit_match = re.search(r'\b(\d+(?:[.,]\d+)?)\s*(UND|UN|U|KG|KGS|GR|G|L|LT|PAQ|PQ|PZA|BOLSA)\b', clean_line, re.IGNORECASE)

            quantity = 1
            unit = "UND"
            if unit_match:
                q_val = unit_match.group(1).replace(",", ".")
                quantity = float(q_val) if "." in q_val else int(float(q_val))
                unit = unit_match.group(2).upper()

            # El total del ítem suele ser el último monto numérico de la línea
            line_total = normalize_cop_amount(all_amounts[-1])

            if line_total and line_total >= 500:
                # Extraer el texto antes del primer monto como nombre
                first_amt = all_amounts[0]
                idx_amt = clean_line.find(first_amt)
                name_part = clean_line[:idx_amt] if idx_amt > 2 else clean_line

                # Limpiar nombre
                name_clean = re.sub(r'^[0-9]{6,14}\s+', '', name_part)  # códigos de barras
                name_clean = re.sub(r'\b(\d+(?:[.,]\d+)?)\s*(UND|UN|U|KG|KGS|GR|G|L|LT|PAQ|PQ|PZA|BOLSA)\b', '', name_clean, flags=re.IGNORECASE).strip()
                name_clean = re.sub(r'[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s/%.-]', '', name_clean).strip()

                if len(name_clean) >= 3 and not any(f in name_clean.upper() for f in header_footer_filter):
                    unit_price = normalize_cop_amount(all_amounts[0]) if len(all_amounts) > 1 else int(line_total / max(1, quantity))

                    items.append({
                        "name": name_clean.title(),
                        "quantity": quantity,
                        "unit": unit,
                        "unit_price": unit_price or line_total,
                        "total_price": line_total
                    })

        i += 1

    return items


def parse_supermarket_receipt_text(ocr_text: str) -> Dict[str, Any]:
    """
    Analiza integralmente una tirilla de supermercado en Colombia:
    1. Extrae todos los productos con su unidad, cantidad y valor en COP.
    2. Extrae el TOTAL final a pagar de la compra, priorizando etiquetas oficiales y
       descartando subtotales, IVA/bases de impuestos (IV=19%/EX=0%) y vueltas/cambio.
    3. Reconfirma el total con la suma de los productos extraídos.
    """
    if not ocr_text or not ocr_text.strip():
        return {
            "success": False,
            "confidence": 0.0,
            "vendor": "Supermercado",
            "amount": None,
            "items": [],
            "items_count": 0,
            "message": "No se detectó texto en el comprobante."
        }

    lines = [l.strip() for l in ocr_text.splitlines() if l.strip()]
    upper_lines = [l.upper() for l in lines]
    vendor_name = detect_supermarket_vendor(ocr_text)

    # 1. Extraer desglose de productos y unidades
    extracted_items = extract_receipt_items(ocr_text)
    items_sum = sum(it["total_price"] for it in extracted_items) if extracted_items else 0

    # 2. Extracción del monto Total final de compra
    amount_regex = re.compile(r'(?:\$\s*)?([0-9]{1,3}(?:[.,][0-9]{3})+(?:[.,][0-9]{2})?|[0-9]{4,7})')
    candidates = []
    total_lines_count = len(upper_lines)

    # Recorrer de abajo hacia arriba (totales se ubican al final)
    for idx in reversed(range(total_lines_count)):
        line = upper_lines[idx]

        # Descartar líneas con palabras vetadas (subtotales, bases de impuestos, vueltas)
        if any(discard in line for discard in DISCARD_TOTAL_KEYWORDS):
            continue

        is_priority_total = any(k in line for k in PRIORITY_TOTAL_KEYWORDS)
        is_payment_line = any(k in line for k in PAYMENT_KEYWORDS)

        matches = amount_regex.findall(line)
        for m in matches:
            normalized = normalize_cop_amount(m)
            if normalized:
                weight = 15
                if is_priority_total:
                    weight += 60
                if is_payment_line:
                    weight += 35

                # Mayor peso para líneas ubicadas cerca del final
                weight += int((idx / max(1, total_lines_count)) * 25)

                # Gran bonificación si coincide exactamente con la sumatoria de productos
                if items_sum > 0 and abs(normalized - items_sum) <= 50:
                    weight += 50

                candidates.append({
                    "amount": normalized,
                    "weight": weight,
                    "line": lines[idx],
                    "is_priority": is_priority_total
                })

    selected_total = None
    confidence = 0.50

    if candidates:
        candidates.sort(key=lambda x: x["weight"], reverse=True)
        best = candidates[0]
        selected_total = best["amount"]
        confidence = min(0.99, round(best["weight"] / 80.0, 2))
        if best["is_priority"]:
            confidence = max(0.88, confidence)
    elif items_sum > 0:
        # Si no hubo línea explícita de 'TOTAL' pero se leyeron productos con total_price
        selected_total = items_sum
        confidence = 0.85

    if not selected_total:
        return {
            "success": False,
            "confidence": 0.20,
            "vendor": vendor_name,
            "amount": None,
            "items": extracted_items,
            "items_count": len(extracted_items),
            "message": "No se pudo confirmar con certeza el total del ticket. Escribe el valor manualmente."
        }

    formatted_amount = f"${selected_total:,} COP".replace(",", ".")
    items_desc = f" ({len(extracted_items)} productos)" if extracted_items else ""

    return {
        "success": confidence >= 0.70,
        "confidence": confidence,
        "vendor": vendor_name,
        "amount": selected_total,
        "items": extracted_items,
        "items_count": len(extracted_items),
        "category": "Mercado / Supermercado",
        "description": f"Compra {vendor_name}{items_desc}",
        "message": f"✓ Total {vendor_name}: {formatted_amount}{items_desc}"
    }


# Compatibilidad hacia atrás
parse_isimo_receipt_text = parse_supermarket_receipt_text


def process_receipt_image(
    image_bytes: bytes,
    client_ocr_text: Optional[str] = None
) -> Dict[str, Any]:
    """
    Punto de entrada integral para procesamiento de fotos de facturas:
    1. Preprocesa la imagen (EXIF, orientación, nitidez, contraste térmico).
    2. Evalúa nitidez con criterio permisivo (sin falsos positivos en iPhone 13).
    3. Extrae productos, unidades y monto total en COP.
    4. REGLA CLAVE: Solo muestra aviso de foto borrosa si NO se logró leer un total concluyente.
    """
    sharpness_score, is_blurry = estimate_image_sharpness(image_bytes)

    # 1. Si el cliente ya nos envió el texto OCR extraído
    text_to_parse = client_ocr_text or ""

    # 2. Si no vino texto del cliente, intentar preprocesamiento y OCR de servidor si está disponible
    if not text_to_parse and image_bytes:
        try:
            preprocessed_bytes = preprocess_receipt_image(image_bytes)
            try:
                from PIL import Image
                import pytesseract
                img = Image.open(io.BytesIO(preprocessed_bytes))
                text_to_parse = pytesseract.image_to_string(img, lang="spa")
            except Exception:
                pass
        except Exception:
            pass

    # 3. Si aún no hay texto de ninguna fuente
    if not text_to_parse:
        return {
            "success": False,
            "is_blurry": is_blurry,
            "sharpness_score": sharpness_score,
            "confidence": 0.30,
            "vendor": "Supermercado",
            "amount": None,
            "items": [],
            "items_count": 0,
            "message": "No se pudo extraer el texto de la tirilla térmica. Por favor reintenta con mejor iluminación o escribe el total manualmente."
        }

    # 4. Parsear las líneas del ticket
    result = parse_supermarket_receipt_text(text_to_parse)

    # REGLA FUNDAMENTAL: Si se logró extraer un total válido, la foto FUE LEGIBLE
    # Por lo tanto, forzamos is_blurry = False para no bloquear al usuario con falsos avisos.
    if result.get("success") and result.get("amount"):
        result["is_blurry"] = False
        result["sharpness_score"] = max(sharpness_score, 85.0)
    else:
        result["is_blurry"] = is_blurry
        result["sharpness_score"] = sharpness_score
        if is_blurry:
            result["message"] = "La foto salió borrosa o difícil de leer. Por favor reintenta con mejor iluminación o escribe el total manualmente."

    return result


def process_and_save_receipt(
    image_bytes: bytes = b"",
    client_ocr_text: Optional[str] = None,
    auto_save: bool = True,
    paid_by: str = "Gil",
    category: str = "Mercado / Supermercado"
) -> Dict[str, Any]:
    """
    Procesa la tirilla de compra y si la lectura es exitosa, guarda automáticamente
    el gasto en Neon PostgreSQL / SQLite junto con el detalle de productos y unidades.
    """
    from services.budget_service import create_transaction

    if client_ocr_text and not image_bytes:
        parsed = parse_supermarket_receipt_text(client_ocr_text)
        parsed["is_blurry"] = False
        parsed["sharpness_score"] = 95.0
        result = parsed
    else:
        result = process_receipt_image(image_bytes, client_ocr_text)

    # Si se detectó el total exitosamente
    if result.get("success") and result.get("amount"):
        result["is_blurry"] = False

        if auto_save:
            vendor = result.get("vendor", "Supermercado")
            items = result.get("items") or []
            items_desc = f" ({len(items)} productos)" if items else ""

            tx_data = {
                "description": f"Compra {vendor}{items_desc}",
                "amount": result["amount"],
                "type": "gasto",
                "category": category or "Mercado / Supermercado",
                "paid_by": paid_by or "Gil",
                "date": datetime.date.today().isoformat(),
                "vendor": vendor,
                "ocr_confidence": result.get("confidence", 0.92),
                "items": items
            }
            saved_tx = create_transaction(tx_data)
            result["auto_saved"] = True
            result["transaction"] = saved_tx
            formatted_amount = f"${result['amount']:,} COP".replace(",", ".")
            result["message"] = f"✓ Compra {vendor} guardada automáticamente por {formatted_amount} en el fondo común.{items_desc}"
        else:
            result["auto_saved"] = False
    else:
        result["auto_saved"] = False

    return result
