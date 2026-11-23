// Meta Conversions API (CAPI): manda desde el servidor los mismos eventos que el píxel del navegador.
// Así no se pierden por bloqueadores / iOS y el cobro real (que solo ve el webhook de Stripe) llega a Meta.
// Deduplicación: el navegador y el servidor usan el MISMO event_id (ver src/lib/pixel.ts `eid`).
// Sin META_CAPI_TOKEN no hace nada. META_TEST_EVENT_CODE (opcional) manda a "Probar eventos".

export const PIXEL_ID = '1694005152257419';
const env = (k: string) => (process.env[k] || '').trim();
const INTERNAL = new Set(['pakovipteam@gmail.com', 'tgudino@me.com', 'demo@donpunto.com', 'webinar@donpunto.com', 'lasalitasdesiempre@gmail.com']);

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Datos del navegador que vienen en la petición (IP, navegador, cookies _fbp/_fbc, página). */
export interface Visitor { ip?: string; ua?: string; fbp?: string; fbc?: string; url?: string }

export function visitorFrom(req: any): Visitor {
  const h = req?.headers || {};
  const cookies: Record<string, string> = {};
  for (const part of String(h.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return {
    ip: String(h['cf-connecting-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || undefined,
    ua: String(h['user-agent'] || '') || undefined,
    fbp: cookies._fbp || undefined,
    fbc: cookies._fbc || undefined,
    url: String(h.referer || '') || undefined,
  };
}

/** Para guardar en metadata de Stripe (máx. 500 caracteres por valor) y usarlo en el webhook. */
export function visitorMeta(v: Visitor): Record<string, string> {
  const o: Record<string, string> = {};
  if (v.ip) o.v_ip = v.ip.slice(0, 64);
  if (v.ua) o.v_ua = v.ua.slice(0, 490);
  if (v.fbp) o.v_fbp = v.fbp.slice(0, 200);
  if (v.fbc) o.v_fbc = v.fbc.slice(0, 400);
  return o;
}
export function visitorFromMeta(m: any): Visitor {
  return { ip: m?.v_ip || undefined, ua: m?.v_ua || undefined, fbp: m?.v_fbp || undefined, fbc: m?.v_fbc || undefined };
}

export interface CapiEvent {
  name: string;           // CompleteRegistration, StartTrial, Subscribe, Purchase, Lead…
  eventId: string;        // igual al eventID del navegador para que Meta no lo cuente doble
  email?: string;
  uid?: string;           // external_id
  phone?: string;         // con lada de país, p.ej. +526561234567
  visitor?: Visitor;
  value?: number;         // MXN
  custom?: Record<string, unknown>;
  time?: number;          // epoch s (default ahora)
}

/** Envía uno o varios eventos. Nunca lanza: si falla, solo registra en consola. */
export async function capi(events: CapiEvent | CapiEvent[]): Promise<boolean> {
  const token = env('META_CAPI_TOKEN');
  if (!token) return false;
  const list = (Array.isArray(events) ? events : [events]).filter((e) => !INTERNAL.has(String(e.email || '').toLowerCase()));
  if (!list.length) return false;
  try {
    const data = await Promise.all(list.map(async (e) => {
      const v = e.visitor || {};
      const user_data: Record<string, unknown> = {};
      const em = String(e.email || '').trim().toLowerCase();
      if (em) user_data.em = [await sha256(em)];
      if (e.uid) user_data.external_id = [await sha256(e.uid)];
      const ph = String(e.phone || '').replace(/\D/g, '');
      if (ph) user_data.ph = [await sha256(ph)];
      user_data.country = [await sha256('mx')];
      if (v.ip) user_data.client_ip_address = v.ip;
      if (v.ua) user_data.client_user_agent = v.ua;
      if (v.fbp) user_data.fbp = v.fbp;
      if (v.fbc) user_data.fbc = v.fbc;
      const custom_data: Record<string, unknown> = { ...(e.custom || {}) };
      if (e.value !== undefined) { custom_data.value = e.value; custom_data.currency = 'MXN'; }
      return {
        event_name: e.name,
        event_time: e.time || Math.floor(Date.now() / 1000),
        event_id: e.eventId,
        action_source: 'website',
        event_source_url: v.url || 'https://donpunto.com/',
        user_data,
        ...(Object.keys(custom_data).length ? { custom_data } : {}),
      };
    }));
    const body: Record<string, unknown> = { data };
    const test = env('META_TEST_EVENT_CODE');
    if (test) body.test_event_code = test;
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL_ID}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) console.error('capi', r.status, (await r.text()).slice(0, 300));
    return r.ok;
  } catch (err: any) {
    console.error('capi error', err?.message);
    return false;
  }
}
