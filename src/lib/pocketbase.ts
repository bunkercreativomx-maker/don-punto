import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL;

if (!PB_URL) {
  console.warn(
    "⚠️ [Don Punto] VITE_PB_URL no está definida. " +
    "Asegúrate de que el archivo .env.local existe y de reiniciar Vite (Ctrl+C y npm run dev)."
  );
}

export const pb = new PocketBase(PB_URL || 'https://donpunto-pb.bunkeragent.cloud');
