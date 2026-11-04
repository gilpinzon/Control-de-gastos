const { neon } = require('@neondatabase/serverless');

// Conexión a Neon PostgreSQL mediante Variable de Entorno de Vercel (o fallback directo)
const rawConnectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_bkMvLaow87pK@ep-wild-frost-bdbs3hsy-pooler.c-8.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

// Sanitización para asegurar compatibilidad con el driver HTTP de Neon en Vercel
const connectionString = rawConnectionString.replace(/([?&])channel_binding=[^&]+(&|$)/g, '$1').replace(/[?&]$/, '');

const sql = neon(connectionString);
const WORKSPACE_ID = 'a0000000-0000-0000-0000-000000000001';

let initialized = false;

// Auto-creación de tablas si aún no han sido creadas en Neon
async function ensureTables() {
  if (initialized) return;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS workspaces (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL DEFAULT 'Hogar Gil & Ale',
        authorized_email_1 TEXT NOT NULL DEFAULT 'gil@ejemplo.com',
        authorized_email_2 TEXT NOT NULL DEFAULT 'ale@ejemplo.com',
        currency_code TEXT NOT NULL DEFAULT 'COP',
        currency_symbol TEXT NOT NULL DEFAULT '$',
        monthly_savings_goal NUMERIC(14, 2) DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('gasto', 'ingreso')),
        amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
        category TEXT NOT NULL,
        description TEXT,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        recorded_by TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS shopping_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Mercado / Supermercado',
        quantity TEXT DEFAULT '1',
        is_purchased BOOLEAN NOT NULL DEFAULT false,
        added_by TEXT NOT NULL DEFAULT 'Gil',
        purchased_by TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
      );
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_workspace ON transactions(workspace_id);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_shopping_workspace ON shopping_items(workspace_id);
    `;
    await sql`
      INSERT INTO workspaces (id, name, authorized_email_1, authorized_email_2, currency_code, currency_symbol, monthly_savings_goal)
      VALUES (
        ${WORKSPACE_ID},
        'Hogar Gil & Ale',
        'gil@ejemplo.com',
        'ale@ejemplo.com',
        'COP',
        '$',
        0
      ) ON CONFLICT (id) DO NOTHING;
    `;
    initialized = true;
  } catch (err) {
    console.error('[Neon Init Notice]:', err);
  }
}

module.exports = { sql, WORKSPACE_ID, ensureTables };
