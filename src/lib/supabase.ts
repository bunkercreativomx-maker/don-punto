import { createClient } from '@supabase/supabase-js';

// Reemplazar con las credenciales reales de Supabase
// En producción, esto debería venir de variables de entorno (.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'public-anon-key';

// Se inicializa el cliente (si las llaves son los placeholders, las llamadas a la BD fallarán pero la app no se romperá)
export const supabase = createClient(supabaseUrl, supabaseKey);
