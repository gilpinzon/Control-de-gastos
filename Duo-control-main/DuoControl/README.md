# DuoControl | PWA de Presupuesto Unificado y Mercado del Hogar 🏡💳🛒

Una Progressive Web App (PWA) moderna, responsiva y diseñada para parejas que manejan un **presupuesto unificado** (un solo fondo común donde se suman todos los ingresos familiares y se restan todos los gastos del hogar), con lista de mercado sincronizada en tiempo real y desplegable en **GitHub Pages**.

---

## 🌟 Novedades y Ajustes Clave

1. **Presupuesto Unificado (Fondo Común):**
   - **Sin deudas ni liquidaciones 50/50:** No se calculan saldos pendientes ni pagos compensatorios.
   - Todos los ingresos suman a una misma bolsa familiar.
   - Todos los gastos del hogar restan directamente del fondo común.
   - **Meta de Ahorro Mensual Conjunta:** Permite definir un objetivo (ej. $1.000.000/mes) y visualizar en una barra de progreso el ahorro acumulado neto del mes.

2. **Alojamiento en GitHub Pages:**
   - Frontend PWA 100% estático, ultra-ligero y optimizado para **GitHub Pages**.
   - Despliegue automatizado mediante el flujo de **GitHub Actions** (`.github/workflows/deploy.yml`).
   - Rutas relativas (`./`) que garantizan compatibilidad tanto con dominios personalizados como con subdirectorios de repositorios (`https://usuario.github.io/nombre-repo/`).

3. **Persistencia y Base de Datos Cloud (Supabase + RLS Whitelist):**
   - Sincronización multi-dispositivo y en tiempo real para la lista de compras del mercado y las transacciones.
   - **Row Level Security (RLS) Estricto:** Solo las 2 cuentas de correo autorizadas pueden leer o escribir en la base de datos PostgreSQL.

---

## 🚀 Despliegue en GitHub Pages (Paso a Paso)

### Paso 1: Subir el proyecto a GitHub
1. Crea un nuevo repositorio en [https://github.com/new](https://github.com/new) (puede ser público o privado). Nómbralo por ejemplo `duocontrol` o `finanzas-pareja`.
2. Sube los archivos de este proyecto al repositorio:
   - Si tienes Git instalado:
     ```bash
     git init
     git add .
     git commit -m "Initial commit DuoControl PWA"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
     git push -u origin main
     ```
   - O sin comandos: en la página de tu repositorio en GitHub, haz clic en **Add file > Upload files**, arrastra los archivos de esta carpeta y confirma (**Commit changes**).

### Paso 2: Activar GitHub Pages con GitHub Actions
1. En tu repositorio de GitHub, haz clic en la pestaña **Settings** (Ajustes).
2. En el menú lateral izquierdo, selecciona **Pages**.
3. En la sección **Build and deployment > Source**, cambia de *Deploy from a branch* a **GitHub Actions**.
4. ¡Listo! El archivo de flujo `.github/workflows/deploy.yml` ya incluido se ejecutará automáticamente.
5. En 1 minuto tendrás tu enlace activo:
   `https://TU_USUARIO.github.io/TU_REPOSITORIO/`

---

## 🗄️ Configuración de la Base de Datos Cloud (Supabase con RLS)

1. Crea un proyecto gratuito en [https://supabase.com](https://supabase.com).
2. En el panel izquierdo de Supabase, ve a **SQL Editor**.
3. Abre el archivo [`supabase-schema.sql`](./supabase-schema.sql) de este proyecto, copia su contenido y reemplaza al final los correos de ejemplo por los dos correos reales que usarán tú y tu pareja:
   ```sql
   'pareja1@ejemplo.com', 'pareja2@ejemplo.com'
   ```
4. Haz clic en **Run**. Esto creará:
   - Las tablas `workspaces`, `profiles`, `transactions` y `shopping_items`.
   - Las políticas RLS de acceso exclusivo para la pareja.
   - El canal de publicación en tiempo real (`supabase_realtime`).
   - El trigger de seguridad en `auth.users` que bloquea cualquier acceso ajeno.
5. Ve a **Project Settings > API** en Supabase y copia la **Project URL** y el **anon key**.
6. Abre tu aplicación DuoControl (en GitHub Pages o local), ve a la pestaña **Ajustes ⚙️**, pega ambos valores y pulsa **"Probar y Conectar a la Nube"**.

---

## 📱 Módulos de la Aplicación

### 1. 📊 Dashboard & Finanzas del Fondo Común
- Resumen mensual del Fondo Común: **Ingresos Totales Familiares**, **Gastos Totales del Hogar** y **Balance Neto Disponible (Ahorro del Mes)**.
- **Gráfico de Dona (Chart.js):** Distribución de gastos del hogar por categoría con porcentajes y montos.
- Barra de progreso presupuestaria que indica el porcentaje de ingresos consumidos.
- Formulario de registro rápido (Gasto / Ingreso) con selector de quién realizó el movimiento solo como bitácora informativa (sin deudas ni divisiones).

### 2. 🛒 Lista de Mercado en Tiempo Real
- Sincronización instantánea entre ambos teléfonos mediante Supabase Realtime (`postgres_changes`).
- Separación entre *Pendientes por comprar* y *Ya en el carrito (Comprados)*.
- Chips de categorías rápidas (Frutas, Lácteos, Carnes, Despensa, Aseo, Snacks).
- Feedback háptico (`navigator.vibrate`) y animación de confetti al completar el 100% de la lista.

### 3. 🏦 Fondo Común & Metas de Ahorro
- Tarjeta de **Meta Mensual de Ahorro Conjunta** con porcentaje alcanzado y monto restante para cumplir el objetivo familiar.
- Gráfico de barras comparativo de Ingresos familiares vs Gastos del hogar de los últimos 6 meses.
- Registro informativo de aportes de cada integrante a la bolsa común.

### 4. 🤖 Smart Insights del Hogar
- Banner inteligente con recomendaciones dinámicas:
  - Estado del cumplimiento de la meta de ahorro mensual.
  - Alertas de concentración de gastos (ej. *"Comida & Salidas absorbe el 35% del presupuesto"*).
  - Recordatorio de artículos pendientes en el supermercado.

### 5. ⚙️ Ajustes, Seguridad y Copia de Seguridad
- Nombres de los integrantes y meta mensual de ahorro editable.
- Whitelist de los 2 correos autorizados.
- Moneda configurable (COP `$`, USD `$`, EUR `€`, MXN `$`, etc.).
- Botón de instalación PWA (con instrucciones para iOS Safari y botón nativo para Android).
- Exportación e importación de copias de seguridad en archivo JSON.

---

## 📱 Instalación PWA en tu Teléfono

- **En iPhone (Safari):** Abre el enlace de GitHub Pages en Safari, toca el botón **Compartir ⎙** (abajo) y selecciona **"Añadir a la pantalla de inicio" ➕**.
- **En Android (Chrome):** Abre el enlace en Chrome, pulsa el botón **"Instalar"** en la parte superior o en el modal de la app.
