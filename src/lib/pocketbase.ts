import PocketBase from 'pocketbase';

const PB_URL = import.meta.env.VITE_PB_URL;

if (!PB_URL) {
  console.warn(
    "⚠️ [Don Punto] VITE_PB_URL no está definida. " +
    "Asegúrate de que el archivo .env.local existe y de reiniciar Vite (Ctrl+C y npm run dev)."
  );
}

// En donpunto.com el navegador habla con PocketBase por el MISMO dominio (/pb → rewrite de Vercel).
// Mandar la contraseña a otro dominio (*.bunkeragent.cloud) hacía que antivirus marcaran el login como phishing.
const SAME_ORIGIN = typeof location !== 'undefined' && /(^|\.)donpunto\.com$/.test(location.hostname);
export const pb = new PocketBase(SAME_ORIGIN ? `${location.origin}/pb` : PB_URL || 'https://donpunto-pb.bunkeragent.cloud');
