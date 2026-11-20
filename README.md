# DuoControl | Presupuesto Unificado Gil & Ale 🏡💳🛒
### Conectado a Neon PostgreSQL & Desplegado en Vercel (PWA)

Una Progressive Web App (PWA) móvil, moderna y táctil diseñada específicamente para el **presupuesto unificado de Gil & Ale** (un solo fondo común donde se suman todos los ingresos y se restan todos los gastos del hogar en pesos colombianos COP $), con lista de mercado sincronizada en tiempo real, escáner de tirillas térmicas de tiendas Ísimo con protección contra fotos borrosas, respaldada en **Neon Serverless PostgreSQL** y desplegable en **Vercel** o en servidor local.

---

## 🚀 Arquitectura Cloud & Local

- **Frontend:** PWA Mobile-First en HTML5, Tailwind CSS y JavaScript Vanilla táctil.
- **Service Worker PWA:** Blindado contra errores de redirección en Safari (iOS) y Android (`response.redirected`, `ignoreSearch: true`).
- **Backend:** Python con FastAPI (`/api/index.py`), compatible tanto con Vercel Serverless Functions como con servidor local Uvicorn.
- **Escáner OCR de Recibos:** Preprocesamiento térmico para facturas de tiendas Ísimo, cálculo de nitidez (varianza Laplaciana), normalización de moneda colombiana (`$45.800` ➔ `45800`) y respaldo ante fotos borrosas.
- **Base de Datos:** [Neon Serverless PostgreSQL](https://neon.tech) con auto-inicialización de esquema (`sql/schema.sql`) y espejo local SQLite automático para desarrollo offline.
- **Offline First:** Respaldo automático en `localStorage` si no hay internet o mientras viajas.

---

## 📁 Estructura del Proyecto

```text
Duo-control-main/
├── api/
│   └── index.py               # Endpoints FastAPI para Vercel Serverless y local
├── services/
│   ├── db.py                  # Conexión híbrida a Neon PostgreSQL y SQLite local
│   ├── budget_service.py      # Lógica de negocio (Fondo común, Mercado, Transacciones)
│   └── receipt_scanner.py     # OCR Ísimo, preprocesamiento de imagen y detección de borrosidad
├── sql/
│   └── schema.sql             # DDL idempotente para Neon PostgreSQL
├── static/
│   ├── css/                   # Estilos
│   ├── js/                    # Scripts cliente
│   ├── icons/                 # Íconos PWA para iOS y Android
│   └── sw.js                  # Service Worker
├── templates/
│   └── index.html             # UI de la aplicación
├── tests/
│   └── test_local_suite.py    # Suite de pruebas automatizadas
├── app.js                     # Controlador Frontend (sincronización, cámara y modales)
├── index.html                 # Punto de entrada raíz PWA
├── manifest.json              # Manifiesto de instalación PWA
├── sw.js                      # Service Worker en raíz de dominio
├── vercel.json                # Configuración de despliegue en Vercel
├── requirements.txt           # Dependencias Python
└── run_server.py              # Script de arranque local
```

---

## 🗄️ Base de Datos en Neon

El archivo [`sql/schema.sql`](./sql/schema.sql) contiene la estructura de tablas para Neon:
- `workspace`: Configuración del hogar de Gil & Ale (moneda COP, meta mensual de ahorro).
- `transactions`: Ingresos y gastos registrados en el fondo común con fecha, categoría, autor, soporte de foto y confianza OCR.
- `shopping_items`: Lista de compras con cantidades y estado de compra en tiempo real.

---

## 📦 Despliegue en Vercel (Paso a Paso)

### 1. Repositorio en GitHub
```bash
git add .
git commit -m "feat: DuoControl con FastAPI, Neon PostgreSQL y escáner de recibos"
git push origin main
```

### 2. Importar en Vercel
1. Ve a [https://vercel.com](https://vercel.com) e inicia sesión con tu cuenta de GitHub.
2. Haz clic en **"Add New..." > "Project"**.
3. Selecciona el repositorio **Control-de-gastos**.
4. En la sección **Environment Variables**, agrega:
   - **Key:** `DATABASE_URL`
   - **Value:** Tu cadena de conexión de Neon (`postgresql://neondb_owner:***@ep-***.aws.neon.tech/neondb?sslmode=require`)
5. Haz clic en **Deploy**.

¡Tu aplicación quedará en vivo con URL propia HTTPS, soporte PWA y conexión directa y segura a Neon!

---

## 📱 Instalar como App en Teléfonos (PWA)

- **iPhone (Safari):** Toca el botón Compartir (icono de caja con flecha arriba) y selecciona **"Agregar al inicio"**.
- **Android (Chrome):** Toca el menú de opciones (tres puntos) o el botón en la app y selecciona **"Instalar aplicación"**.

---

## 🧪 Pruebas Unitarias y Ejecución Local

Para correr las pruebas unitarias:
```bash
python tests/test_local_suite.py
```

Para correr el servidor en local:
```bash
python run_server.py
```
Accede a `http://localhost:8000` (Swagger docs en `http://localhost:8000/docs`).
