// Meta Pixel (base en index.html). No-op si no cargó (bloqueador, tienda pública).
declare global { interface Window { fbq?: (...a: unknown[]) => void } }

/** eventId = el mismo que manda el servidor por Conversions API (api/_lib/capi.ts) para que Meta no lo cuente doble. */
export function track(event: string, params?: Record<string, unknown>, eventId?: string) {
  try { window.fbq?.('track', event, params || {}, eventId ? { eventID: eventId } : undefined); } catch { /* sin pixel */ }
}

/** Eventos propios (clics en botones, qué tanto bajan): se ven en Meta → Administrador de eventos. */
export function trackCustom(event: string, params?: Record<string, unknown>) {
  try { window.fbq?.('trackCustom', event, params); } catch { /* sin pixel */ }
}
