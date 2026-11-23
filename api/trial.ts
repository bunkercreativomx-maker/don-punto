import { getMember, adminToken, pbFetch, sendError, HttpError } from './_lib/server.js';
import { TRIAL_DAYS } from './_lib/membership.js';
import { notifyTeam, INTERNAL, who, fmtDay } from './_lib/notify.js';
import { capi, visitorFrom } from './_lib/capi.js';

// Meta CAPI: registro + prueba (mismos event_id que el navegador: reg_<uid>, trial_<uid>)
const metaTrial = (req: any, user: { id: string; email: string }) => {
  const base = { email: user.email, uid: user.id, visitor: visitorFrom(req) };
  return capi([
    { ...base, name: 'CompleteRegistration', eventId: 'reg_' + user.id },
    { ...base, name: 'StartTrial', eventId: 'trial_' + user.id, value: 0, custom: { predicted_ltv: 350 } },
  ]);
};

// Aviso al grupo de soporte en Telegram por cada prueba nueva (no bloquea si falla)
async function announce(user: { id: string; email: string }, trialEnd: string, token: string, ad = '') {
  if (INTERNAL.has(String(user.email).toLowerCase())) return;
  const [rest, u, count] = await Promise.all([
    pbFetch(`/api/collections/restaurants/records?perPage=1&fields=name&filter=${encodeURIComponent(`owner = "${user.id}"`)}`, { token }),
    pbFetch(`/api/collections/users/records/${user.id}?fields=name`, { token }),
    pbFetch(`/api/collections/subscriptions/records?perPage=1&fields=id&filter=${encodeURIComponent("status = 'trialing' && trial_end > @now")}`, { token }),
  ]).catch(() => [null, null, null] as any[]);
  const business = rest?.data?.items?.[0]?.name || '';
  const name = u?.data?.name || '';
  const n = count?.data?.totalItems;
  await notifyTeam(
    `🆕 <b>Prueba gratis nueva</b>\n${who({ business, name, email: user.email })}\nVence: ${fmtDay(new Date(trialEnd).getTime())}` +
    (ad ? `\nAnuncio: ${ad}` : '') +
    (n ? `\nEn prueba ahora: ${n}` : ''),
  );
}

// POST: arranca la prueba gratis de 15 días SIN tarjeta (una sola vez por cuenta).
// Solo si nunca tuvo Stripe ni prueba. El servidor fija la fecha; el cliente no puede escribir subscriptions.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const m = await getMember(req);
    const src = String(req.body?.src || '');
    const ad = /^a\d{2}$/.test(src) ? src : ''; // anuncio que trajo el registro (landing ?a=05)
    const s = m.subscription;
    const token = await adminToken();
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400 * 1000).toISOString();

    if (!s) {
      const r = await pbFetch('/api/collections/subscriptions/records', { method: 'POST', token, body: { owner: m.user.id, status: 'trialing', trial_end: trialEnd } });
      if (!r.ok) throw new HttpError(500, 'No se pudo iniciar la prueba.');
      await Promise.all([announce(m.user, trialEnd, token, ad).catch(() => {}), metaTrial(req, m.user)]);
      return res.status(200).json({ started: true, trial_end: trialEnd });
    }
    const eligible = s.status === 'inactive' && !s.stripe_customer_id && !s.stripe_subscription_id && !s.trial_end;
    if (!eligible) return res.status(200).json({ started: false, status: s.status, trial_end: s.trial_end || null });

    const r = await pbFetch(`/api/collections/subscriptions/records/${s.id}`, { method: 'PATCH', token, body: { status: 'trialing', trial_end: trialEnd } });
    if (!r.ok) throw new HttpError(500, 'No se pudo iniciar la prueba.');
    await Promise.all([announce(m.user, trialEnd, token, ad).catch(() => {}), metaTrial(req, m.user)]);
    return res.status(200).json({ started: true, trial_end: trialEnd });
  } catch (e) {
    return sendError(res, e);
  }
}
