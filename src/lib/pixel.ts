// Meta Pixel (base en index.html). No-op si no cargó (bloqueador, tienda pública).
declare global { interface Window { fbq?: (...a: unknown[]) => void } }

export function track(event: string, params?: Record<string, unknown>) {
  try { window.fbq?.('track', event, params); } catch { /* sin pixel */ }
}
