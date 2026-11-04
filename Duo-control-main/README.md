# DuoControl | Presupuesto Unificado Gil & Ale 🏡💳🛒
### Conectado a Neon PostgreSQL & Desplegado en Vercel

Una Progressive Web App (PWA) móvil, moderna y táctil diseñada específicamente para el **presupuesto unificado de Gil & Ale** (un solo fondo común donde se suman todos los ingresos y se restan todos los gastos del hogar), con lista de mercado en tiempo real, respaldada en **Neon Serverless PostgreSQL** y desplegable en **Vercel**.

---

## 🚀 Arquitectura Cloud (Neon + Vercel)

- **Frontend:** PWA Mobile-First en HTML5, Tailwind CSS y JavaScript Vanilla.
- **Backend:** Vercel Serverless Functions (`/api/sync`, `/api/transactions`, `/api/shopping`, `/api/settings`, `/api/status`).
- **Base de Datos:** [Neon Serverless PostgreSQL](https://neon.tech) con auto-inicialización de tablas.
- **Offline First:** Respaldo automático en `localStorage` si no hay internet o mientras viajas.

---

## 🗄️ Base de Datos en Neon

1. El archivo [`neon-schema.sql`](./neon-schema.sql) contiene la estructura de tablas para Neon:
   - `workspaces`: Configuración del hogar de Gil & Ale (moneda, meta mensual de ahorro).
   - `transactions`: Ingresos y gastos registrados en el fondo común con fecha, categoría y autor.
   - `shopping_items`: Lista de compras con cantidades y estado de compra en tiempo real.
2. La API Serverless cuenta con **auto-creación de tablas**, por lo que se configuran automáticamente desde la primera petición.

---

## 📦 Despliegue en Vercel (Paso a Paso)

### 1. Subir a GitHub
Sube tu proyecto a un repositorio de GitHub:
```bash
git init
git add .
git commit -m "feat: DuoControl con Neon PostgreSQL y Vercel API"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

### 2. Importar en Vercel
1. Ve a [https://vercel.com](https://vercel.com) e inicia sesión.
2. Haz clic en **"Add New..." > "Project"**.
3. Selecciona tu repositorio de GitHub.
4. En la sección **Environment Variables**, agrega:
   - **Key:** `DATABASE_URL`
   - **Value:** `postgresql://neondb_owner:npg_bkMvLaow87pK@ep-wild-frost-bdbs3hsy-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require`
5. Haz clic en **Deploy**.

¡Tu aplicación quedará en vivo con URL propia, HTTPS, soporte PWA y conexión directa y segura a Neon!

---

## 📱 Instalar como App en Teléfonos (PWA)

- **iPhone (Safari):** Toca el botón Compartir (icono de caja con flecha arriba) y selecciona **"Agregar al inicio"**.
- **Android (Chrome):** Toca el menú de opciones (tres puntos) o el botón en la app y selecciona **"Instalar aplicación"**.
