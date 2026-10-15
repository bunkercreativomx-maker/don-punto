// Datos de contacto/soporte (se configuran en Vercel → Settings → Environment Variables)
// VITE_SUPPORT_WHATSAPP: solo dígitos con lada de país, ej. 5216561234567
// VITE_SUPPORT_EMAIL: correo de soporte
export const SUPPORT_WHATSAPP = (import.meta.env.VITE_SUPPORT_WHATSAPP || '').replace(/\D/g, '');
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@donpunto.com';

export function whatsappLink(message: string): string | null {
  if (!SUPPORT_WHATSAPP) return null;
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

export function supportLink(message: string): string | null {
  return whatsappLink(message) || (SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Don Punto')}&body=${encodeURIComponent(message)}` : null);
}

export const PLANS = {
  basico: { name: 'Básico', price: 350 },
  pro: { name: 'Pro', price: 799 },
} as const;
export type PlanKey = keyof typeof PLANS;

// Llave pública VAPID (es pública por diseño; la privada vive en el servidor)
export const VAPID_PUBLIC_KEY = 'BFAmuE_BQLFG8j_QfAoueV7dfqz7s_XS3xCvO8e-z84XTrDU7FNuu9ksBlnWvcYcjtiOGkQ7T9AAvmf8bx6kTv0';
