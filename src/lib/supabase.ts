import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "⚠️ [Don Punto] Las variables de entorno de Supabase no están cargadas. " +
    "Asegúrate de que el archivo .env.local existe y de reiniciar el servidor de desarrollo de Vite (Ctrl+C y npm run dev)."
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'public-anon-key'
);

