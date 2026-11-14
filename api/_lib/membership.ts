// Reglas de membresía compartidas por las funciones /api.
// Prueba gratis SIN tarjeta: PocketBase guarda status 'trialing' + trial_end; vence sola por fecha
// (las reglas de user_items también revisan trial_end > @now). Stripe trialing se guarda como 'active'.

export const TRIAL_DAYS = 15;

// Precio de fundador: los primeros 100 negocios que se suscriben, congelado de por vida (centavos MXN)
export const FOUNDER_LIMIT = 100;
export const FOUNDER_PRICES: Record<'basico' | 'pro', number> = { basico: 29900, pro: 69900 };

export const pbDate = (s?: string | null): number => {
  if (!s) return 0;
  const t = new Date(String(s).replace(' ', 'T')).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** ¿La suscripción da acceso ahora? (pagada o en prueba vigente) */
export function subActive(s: any): boolean {
  if (!s) return false;
  if (s.status === 'active') return true;
  if (s.status === 'trialing') return pbDate(s.trial_end) > Date.now();
  return false;
}

/** Prueba sin tarjeta vigente (no pagada) */
export function inFreeTrial(s: any): boolean {
  return s?.status === 'trialing' && pbDate(s.trial_end) > Date.now();
}
