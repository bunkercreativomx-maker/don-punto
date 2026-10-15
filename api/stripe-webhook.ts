import crypto from 'node:crypto';
import { adminToken, pbFetch, stripe } from './_lib/server.js';
import { sendToUser } from './_lib/push.js';

// Webhook de Stripe: ÚNICA vía para activar/desactivar membresías (firma verificada)
export const config = { api: { bodyParser: false } };

async function rawBody(req: any): Promise<string> {
  // Leer el stream ANTES de tocar req.body (el getter de Vercel lo parsea y la firma dejaría de cuadrar)
  const chunks: Buffer[] = [];
  if (req.readable !== false && typeof req[Symbol.asyncIterator] === 'function') {
    for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  }
  if (chunks.length) return Buffer.concat(chunks).toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  return '';
}

function verify(payload: string, header: string, secret: string): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=') as [string, string]).filter((p) => p.length === 2 && p[0] !== 'v1'),
  );
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

function mapStatus(s: string): string {
  if (s === 'active' || s === 'trialing') return 'active';
  if (s === 'past_due') return 'past_due';
  if (s === 'incomplete') return 'incomplete';
  return 'canceled'; // canceled, unpaid, incomplete_expired, paused
}

async function planId(token: string, plan?: string): Promise<string> {
  if (!plan) return '';
  const name = plan === 'pro' ? 'Pro' : 'Basico';
  const r = await pbFetch(`/api/collections/plans/records?perPage=1&filter=${encodeURIComponent(`name = "${name}"`)}`, { token });
  return r.data?.items?.[0]?.id || '';
}

async function upsertSubscription(uid: string, sub: any) {
  const token = await adminToken();
  const periodEnd = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  const fields: Record<string, unknown> = {
    status: mapStatus(sub.status),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    stripe_subscription_id: sub.id,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : '',
  };
  const pid = await planId(token, sub.metadata?.plan);
  if (pid) fields.plan = pid;

  // Buscar por suscripción de Stripe primero, luego por dueño
  let existing = await pbFetch(`/api/collections/subscriptions/records?perPage=1&filter=${encodeURIComponent(`stripe_subscription_id = "${sub.id}"`)}`, { token });
  let rec = existing.data?.items?.[0];
  if (!rec && uid) {
    existing = await pbFetch(`/api/collections/subscriptions/records?perPage=1&filter=${encodeURIComponent(`owner = "${uid}"`)}`, { token });
    rec = existing.data?.items?.[0];
    // No pisar una suscripción vigente distinta con un evento de otra suscripción ya cancelada
    if (rec && rec.stripe_subscription_id && rec.stripe_subscription_id !== sub.id && fields.status !== 'active') return;
  }
  const prevStatus = rec?.status;
  const owner = rec?.owner || uid;
  if (rec) {
    const r = await pbFetch(`/api/collections/subscriptions/records/${rec.id}`, { method: 'PATCH', token, body: fields });
    if (!r.ok) throw new Error('PB update ' + JSON.stringify(r.data));
  } else if (uid) {
    const r = await pbFetch('/api/collections/subscriptions/records', { method: 'POST', token, body: { owner: uid, ...fields } });
    if (!r.ok) throw new Error('PB create ' + JSON.stringify(r.data));
  } else {
    console.warn('Webhook sin uid para suscripción', sub.id);
    return;
  }
  // Aviso al dueño cuando cambia el estado de su membresía
  if (owner && prevStatus !== fields.status) {
    const msg: Record<string, [string, string]> = {
      active: ['Tu membresía está activa', 'Gracias por tu pago. Don Punto ya está listo para cobrar.'],
      past_due: ['No pudimos cobrar tu membresía', 'Actualiza tu tarjeta en "Mi plan" para no perder el acceso.'],
      canceled: ['Tu membresía terminó', 'Tus datos siguen guardados. Puedes reactivar cuando quieras.'],
    };
    const m = msg[String(fields.status)];
    if (m) await sendToUser(owner, { title: m[0], body: m[1], url: '/', tag: 'membresia' }).catch(() => 0);
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return res.status(503).json({ error: 'STRIPE_WEBHOOK_SECRET no configurado' });

  const payload = await rawBody(req);
  const sig = String(req.headers['stripe-signature'] || '');
  if (!verify(payload, sig, secret)) return res.status(400).json({ error: 'Firma inválida' });

  const event = JSON.parse(payload);
  try {
    const obj = event.data?.object || {};
    switch (event.type) {
      case 'checkout.session.completed': {
        if (obj.mode !== 'subscription' || !obj.subscription) break;
        const sub = await stripe('GET', `/subscriptions/${obj.subscription}`);
        sub.metadata = { ...(obj.metadata || {}), ...(sub.metadata || {}) };
        await upsertSubscription(obj.client_reference_id || sub.metadata?.uid, sub);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await upsertSubscription(obj.metadata?.uid, obj);
        break;
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error('webhook error', event.type, e?.message);
    return res.status(500).json({ error: 'No se pudo procesar' }); // Stripe reintenta
  }
}
