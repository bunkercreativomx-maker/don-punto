// Utilidades de servidor compartidas por las funciones /api (los archivos con "_" no son rutas en Vercel)

// .trim(): las variables pegadas en Vercel a veces traen espacios o tabuladores invisibles
const env = (k: string) => (process.env[k] || '').trim();
export const PB_URL = (env('PB_URL') || 'https://donpunto-pb.bunkeragent.cloud').replace(/\/$/, '');
export const APP_URL = (env('APP_URL') || 'https://donpunto.com').replace(/\/$/, '');
// El WAF de Cloudflare frente a PocketBase bloquea agentes que no parecen navegador
const UA = 'Mozilla/5.0 (DonPunto-Server) Chrome/130';

export class HttpError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(res: any, err: unknown) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  console.error(err);
  return res.status(500).json({ error: 'Error interno. Intenta de nuevo.' });
}

export async function pbFetch(path: string, init: { method?: string; token?: string; body?: unknown } = {}) {
  const r = await fetch(PB_URL + path, {
    method: init.method || 'GET',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      ...(init.token ? { Authorization: init.token } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await r.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}

const q = (s: string) => encodeURIComponent(s);

export interface Member {
  user: { id: string; email: string };
  token: string;
  subscription: any | null;
  active: boolean;
  plan: 'basico' | 'pro' | 'cortesia';
}

/** Valida el token de PocketBase del usuario y lee su membresía */
export async function getMember(req: any): Promise<Member> {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Inicia sesión para usar esta función.', 'auth_required');

  const me = await pbFetch('/api/collections/users/auth-refresh', { method: 'POST', token });
  if (!me.ok || !me.data?.record?.id) throw new HttpError(401, 'Tu sesión expiró. Vuelve a iniciar sesión.', 'auth_required');
  const user = { id: me.data.record.id, email: me.data.record.email };
  const fresh = me.data.token || token;

  const subs = await pbFetch(`/api/collections/subscriptions/records?perPage=1&filter=${q(`owner = "${user.id}"`)}&expand=plan`, { token: fresh });
  const subscription = subs.ok ? subs.data?.items?.[0] ?? null : null;
  const active = subscription?.status === 'active' || subscription?.status === 'trialing';
  const planName = String(subscription?.expand?.plan?.name || '').toLowerCase();
  const plan = planName.startsWith('b') ? 'basico' : planName.startsWith('p') ? 'pro' : 'cortesia';
  return { user, token: fresh, subscription, active, plan };
}

/** Exige membresía activa (y opcionalmente plan Pro) */
export async function requireMember(req: any, opts: { pro?: boolean } = {}): Promise<Member> {
  const m = await getMember(req);
  if (!m.active) throw new HttpError(402, 'Tu membresía no está activa.', 'inactive');
  if (opts.pro && m.plan === 'basico') {
    throw new HttpError(403, 'Esta función es del plan Pro. Cámbiate a Pro desde "Mi plan".', 'plan_pro');
  }
  return m;
}

// Límite simple por usuario (por instancia) para proteger la clave de IA
const hits = new Map<string, number[]>();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) throw new HttpError(429, 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.', 'rate_limited');
  arr.push(now);
  hits.set(key, arr);
}

// ---------------------------------------------------------------- superusuario (solo webhook)
let adminCache: { token: string; at: number } | null = null;
export async function adminToken(): Promise<string> {
  if (adminCache && Date.now() - adminCache.at < 30 * 60 * 1000) return adminCache.token;
  const email = env('PB_ADMIN_EMAIL');
  const password = env('PB_ADMIN_PASSWORD');
  if (!email || !password) throw new HttpError(503, 'PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD no configurados', 'pb_admin_missing');
  const r = await pbFetch('/api/collections/_superusers/auth-with-password', { method: 'POST', body: { identity: email, password } });
  if (!r.ok) {
    // Diagnóstico sin exponer secretos: estado HTTP y forma de las variables
    const detail = `HTTP ${r.status}`;
    console.error('pb admin auth failed', detail);
    throw new HttpError(503, 'No se pudo autenticar el servidor con PocketBase: ' + detail, 'pb_admin_auth');
  }
  adminCache = { token: r.data.token, at: Date.now() };
  return adminCache.token;
}

// ---------------------------------------------------------------- Stripe (sin SDK)
function formEncode(obj: any, prefix = ''): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') out.push(...formEncode(v, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export function stripeConfigured() {
  return !!env('STRIPE_SECRET_KEY');
}

export async function stripe(method: 'GET' | 'POST', path: string, params?: any): Promise<any> {
  const key = env('STRIPE_SECRET_KEY');
  if (!key) throw new HttpError(503, 'El pago en línea aún no está activo.', 'stripe_not_configured');
  const body = params ? formEncode(params).join('&') : undefined;
  const url = 'https://api.stripe.com/v1' + path + (method === 'GET' && body ? `?${body}` : '');
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'POST' ? body : undefined,
  });
  const data = await r.json();
  if (!r.ok) {
    console.error('Stripe error', path, data?.error?.message);
    throw new HttpError(502, 'No se pudo conectar con el procesador de pagos.', 'stripe_error');
  }
  return data;
}

export async function readJsonBody(req: any): Promise<any> {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new HttpError(400, 'Body inválido'); }
  }
  return body || {};
}
