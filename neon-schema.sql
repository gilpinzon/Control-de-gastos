-- ==============================================================================
-- DUOCONTROL | ESQUEMA POSTGRESQL PARA NEON
-- PRESUPUESTO UNIFICADO DEL HOGAR: GIL & ALE
-- ==============================================================================

-- 1. TABLA DE WORKSPACE (FONDO COMÚN & ESPACIO UNIFICADO DE GIL & ALE)
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

-- 2. TABLA DE TRANSACCIONES (FONDO COMÚN UNIFICADO)
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

-- 3. TABLA DE LISTA DE MERCADO (SUPERMERCADO EN TIEMPO REAL)
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

-- 4. ÍNDICES PARA ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_transactions_workspace ON transactions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_shopping_workspace ON shopping_items(workspace_id);

-- 5. ESPACIO INICIAL POR DEFECTO PARA GIL & ALE
INSERT INTO workspaces (id, name, authorized_email_1, authorized_email_2, currency_code, currency_symbol, monthly_savings_goal)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Hogar Gil & Ale',
    'gil@ejemplo.com',
    'ale@ejemplo.com',
    'COP',
    '$',
    0
) ON CONFLICT (id) DO NOTHING;

