// Notificaciones push (Web Push / VAPID). Las llaves viven en PocketBase (app_kv, solo superusuario).
import { sendNotification, type Vapid } from './webpush.js';
import { adminToken, pbFetch } from './server.js';

let vapid: Vapid | null = null;

async function ensureVapid(token: string) {
  if (vapid) return vapid;
  const r = await pbFetch(`/api/collections/app_kv/records?perPage=1&filter=${encodeURIComponent('key = "vapid"')}`, { token });
  const v = r.data?.items?.[0]?.value;
  if (!v?.publicKey || !v?.privateKey) throw new Error('VAPID no configurado');
  vapid = { subject: v.subject || 'mailto:soporte@donpunto.com', publicKey: v.publicKey, privateKey: v.privateKey };
  return vapid;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
  sticky?: boolean;
}

/** Envía a todos los dispositivos del usuario; borra suscripciones vencidas (404/410). */
export async function sendToUser(uid: string, payload: PushPayload, opts: { onlyDailySummary?: boolean } = {}): Promise<number> {
  const token = await adminToken();
  const v = await ensureVapid(token);
  let filter = `owner = "${uid}"`;
  if (opts.onlyDailySummary) filter += ' && daily_summary = true';
  const r = await pbFetch(`/api/collections/push_subscriptions/records?perPage=50&filter=${encodeURIComponent(filter)}`, { token });
  const subs: any[] = r.data?.items || [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sendNotification(
          v,
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 60 * 12, urgency: 'normal' },
        );
        sent++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await pbFetch(`/api/collections/push_subscriptions/records/${s.id}`, { method: 'DELETE', token });
        } else {
          console.error('push error', e?.statusCode, e?.body);
        }
      }
    }),
  );
  return sent;
}

export async function kvGet(key: string): Promise<{ id: string; value: any } | null> {
  const token = await adminToken();
  const r = await pbFetch(`/api/collections/app_kv/records?perPage=1&filter=${encodeURIComponent(`key = "${key}"`)}`, { token });
  const it = r.data?.items?.[0];
  return it ? { id: it.id, value: it.value } : null;
}

export async function kvSet(key: string, value: unknown) {
  const token = await adminToken();
  const cur = await kvGet(key);
  if (cur) await pbFetch(`/api/collections/app_kv/records/${cur.id}`, { method: 'PATCH', token, body: { value } });
  else await pbFetch('/api/collections/app_kv/records', { method: 'POST', token, body: { key, value } });
}
