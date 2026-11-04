-- ==============================================================================
-- DUOCONTROL | ESQUEMA DE BASE DE DATOS SUPABASE
-- PRESUPUESTO UNIFICADO DEL HOGAR: GIL & ALE
-- ==============================================================================
-- 1. Base de datos completamente limpia (en ceros, sin registros de prueba).
-- 2. Presupuesto unificado: sin deudas individuales ni divisiones 50/50.
-- 3. Row Level Security (RLS) estricto: Acceso exclusivo para Gil y Ale.
-- ==============================================================================

-- 1. EXTENSIÓN PARA GENERAR UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABLA DE WORKSPACE (FONDO COMÚN & ESPACIO UNIFICADO DE GIL & ALE)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL DEFAULT 'Hogar Gil & Ale',
    authorized_email_1 TEXT NOT NULL,
    authorized_email_2 TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'COP',
    currency_symbol TEXT NOT NULL DEFAULT '$',
    monthly_savings_goal NUMERIC(14, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. TABLA DE PERFILES DE USUARIO
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#10B981',
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. TABLA DE TRANSACCIONES (FONDO COMÚN UNIFICADO)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('gasto', 'ingreso')),
    amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    description TEXT,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by TEXT NOT NULL, -- Gil, Ale o Ambos (bitácora informativa)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. TABLA DE LISTA DE MERCADO (SUPERMERCADO EN TIEMPO REAL)
CREATE TABLE IF NOT EXISTS public.shopping_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Mercado / Supermercado',
    quantity TEXT DEFAULT '1',
    is_purchased BOOLEAN NOT NULL DEFAULT false,
    added_by TEXT NOT NULL DEFAULT 'Gil',
    purchased_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ==============================================================================
-- 🔒 POLÍTICAS DE SEGURIDAD ESTRICTA (ROW LEVEL SECURITY - RLS)
-- ==============================================================================

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA WORKSPACES
CREATE POLICY "Acceso a Workspace exclusivo para Gil y Ale"
ON public.workspaces
FOR ALL
USING (
    lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
)
WITH CHECK (
    lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
);

-- POLÍTICAS PARA PROFILES
CREATE POLICY "Ver perfiles de Gil y Ale"
ON public.profiles
FOR ALL
USING (
    workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
    )
);

-- POLÍTICAS PARA TRANSACCIONES DEL FONDO COMÚN
CREATE POLICY "Gil y Ale gestionan transacciones del fondo común"
ON public.transactions
FOR ALL
USING (
    workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
    )
)
WITH CHECK (
    workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
    )
);

-- POLÍTICAS PARA LISTA DE MERCADO
CREATE POLICY "Gil y Ale gestionan lista de mercado en tiempo real"
ON public.shopping_items
FOR ALL
USING (
    workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
    )
)
WITH CHECK (
    workspace_id IN (
        SELECT id FROM public.workspaces 
        WHERE lower(auth.jwt() ->> 'email') IN (lower(authorized_email_1), lower(authorized_email_2))
    )
);

-- ==============================================================================
-- ⚡ TIEMPO REAL: HABILITAR SUPABASE REALTIME
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'shopping_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_items;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
    END IF;
END $$;

-- ==============================================================================
-- 🛡️ TRIGGER DE SEGURIDAD: CONTROL DE ACCESO ESTRICTO (WHITELIST DE GIL & ALE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.check_user_whitelist()
RETURNS TRIGGER AS $$
DECLARE
    matched_workspace UUID;
    user_display_name TEXT;
BEGIN
    SELECT id INTO matched_workspace 
    FROM public.workspaces 
    WHERE lower(NEW.email) = lower(authorized_email_1) 
       OR lower(NEW.email) = lower(authorized_email_2)
    LIMIT 1;

    IF matched_workspace IS NULL THEN
        RAISE EXCEPTION 'Acceso denegado: El correo % no está en la lista autorizada de Gil y Ale.', NEW.email;
    END IF;

    user_display_name := coalesce(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

    INSERT INTO public.profiles (id, email, display_name, workspace_id)
    VALUES (NEW.id, NEW.email, user_display_name, matched_workspace)
    ON CONFLICT (id) DO UPDATE 
    SET display_name = EXCLUDED.display_name,
        workspace_id = EXCLUDED.workspace_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.check_user_whitelist();

-- ==============================================================================
-- 🚀 CONFIGURACIÓN INICIAL (SIN REGISTROS DE PRUEBA / COMPLETAMENTE EN CEROS)
-- ==============================================================================
INSERT INTO public.workspaces (id, name, authorized_email_1, authorized_email_2, currency_code, currency_symbol, monthly_savings_goal)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'Hogar Gil & Ale',
    'gil@ejemplo.com',
    'ale@ejemplo.com',
    'COP',
    '$',
    0
) ON CONFLICT (id) DO UPDATE 
SET name = 'Hogar Gil & Ale';

COMMENT ON TABLE public.workspaces IS 'Espacio privado para el presupuesto unificado de Gil & Ale';
