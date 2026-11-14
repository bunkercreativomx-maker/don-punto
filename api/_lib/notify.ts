import { adminToken, pbFetch, stripe, stripeConfigured } from './server.js';
import { kvGet, kvSet } from './push.js';
import { pbDate } from './membership.js';

// Avisos internos para el equipo (grupo de Telegram "Soporte Don-punto", mismo bot del chat de soporte:
// app_kv support_tg = { token, chat_id }). Nunca truena la llamada que lo usa.

export const INTERNAL = new Set([
  'pakovipteam@gmail.com', 'tgudino@me.com', 'demo@donpunto.com', 'webinar@donpunto.com',
  'lasalitasdesiempre@gmail.com', 'kabuki@donpunto.com',
]);

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

export async function notifyTeam(html: string): Promise<boolean> {
  try {
    const it = await kvGet('support_tg');
    const cfg = it?.value;
    if (!cfg?.token || !cfg?.chat_id) return false;
    const send = (chat_id: string) => fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(6000),
    }).then((r) => r.json()).catch(() => null) as Promise<any>;
    let d = await send(String(cfg.chat_id));
    const moved = d?.parameters?.migrate_to_chat_id;
    if (!d?.ok && moved) {
      await kvSet('support_tg', { ...cfg, chat_id: String(moved) });
      d = await send(String(moved));
    }
    if (!d?.ok) console.error('notifyTeam', d?.description);
    return !!d?.ok;
  } catch (e: any) {
    console.error('notifyTeam', e?.message);
    return false;
  }
}

const q = encodeURIComponent;
const DAY = 86400000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'America/Ciudad_Juarez' });

async function all(path: string, token: string): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await pbFetch(`${path}${path.includes('?') ? '&' : '?'}perPage=500&page=${page}`, { token });
    const items = r.data?.items || [];
    out.push(...items);
    if (page >= (r.data?.totalPages || 1)) break;
  }
  return out;
}

export interface TrialRow {
  uid: string; email: string; name: string; business: string;
  trialEnd: number; daysLeft: number; created: number;
  state: 'vigente' | 'vencida' | 'tarjeta' | 'pagando' | 'cancelada';
  stripeNote?: string;
}

/** Todas las cuentas reales (sin internas ni huérfanas) que alguna vez arrancaron la prueba sin tarjeta. */
export async function trialRows(): Promise<TrialRow[]> {
  const token = await adminToken();
  const subs = await all(`/api/collections/subscriptions/records?expand=owner&filter=${q("trial_end != ''")}`, token);
  const rests = await all('/api/collections/restaurants/records?fields=owner,name', token);
  const biz = new Map<string, string>();
  for (const r of rests) if (!biz.has(r.owner)) biz.set(r.owner, r.name);
  const now = Date.now();
  const rows: TrialRow[] = [];
  for (const s of subs) {
    const u = s.expand?.owner;
    if (!u?.email || INTERNAL.has(String(u.email).toLowerCase())) continue;
    const trialEnd = pbDate(s.trial_end);
    const row: TrialRow = {
      uid: u.id, email: u.email, name: u.name || '', business: biz.get(u.id) || '',
      trialEnd, daysLeft: Math.ceil((trialEnd - now) / DAY), created: pbDate(u.created),
      state: s.status === 'trialing' ? (trialEnd > now ? 'vigente' : 'vencida') : 'cancelada',
    };
    if (s.stripe_subscription_id) {
      row.state = 'tarjeta';
      if (stripeConfigured()) {
        try {
          const st = await stripe('GET', `/v1/subscriptions/${s.stripe_subscription_id}`);
          if (st?.status === 'active') row.state = 'pagando';
          else if (st?.status === 'trialing') { row.state = 'tarjeta'; row.stripeNote = `primer cobro ${fmtDay(st.trial_end * 1000)}`; }
          else { row.state = 'cancelada'; row.stripeNote = `Stripe: ${st?.status}`; }
        } catch { /* deja 'tarjeta' */ }
      }
    }
    rows.push(row);
  }
  return rows.sort((a, b) => b.created - a.created);
}

export function who(r: { business?: string; name?: string; email: string }) {
  const label = r.business || r.name;
  return label ? `<b>${esc(label)}</b> · ${esc(r.email)}` : esc(r.email);
}

export { fmtDay };
