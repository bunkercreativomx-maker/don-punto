-- Esquema Inicial para Supabase (SaaS Multi-Tenant)
-- Ejecutar esto en el SQL Editor de Supabase

-- ==========================================
-- 1. Tabla de Inquilinos (Restaurantes)
-- ==========================================
CREATE TABLE public.restaurants (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
    stripe_customer_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seguridad de Nivel de Fila (RLS)
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dueños pueden ver sus propios restaurantes" 
ON public.restaurants FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Dueños pueden editar sus propios restaurantes" 
ON public.restaurants FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Dueños pueden crear restaurantes" 
ON public.restaurants FOR INSERT WITH CHECK (auth.uid() = owner_id);


-- ==========================================
-- 2. Configuraciones del POS
-- ==========================================
CREATE TABLE public.pos_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE UNIQUE,
    admin_pin TEXT DEFAULT '1234',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dueños gestionan sus configuraciones" ON public.pos_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.restaurants WHERE id = restaurant_id AND owner_id = auth.uid())
);


-- ==========================================
-- 3. Productos (Ejemplo de tabla hija)
-- ==========================================
CREATE TABLE public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sale_price NUMERIC NOT NULL,
    cost_price NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dueños gestionan sus productos" ON public.products FOR ALL USING (
    EXISTS (SELECT 1 FROM public.restaurants WHERE id = restaurant_id AND owner_id = auth.uid())
);
