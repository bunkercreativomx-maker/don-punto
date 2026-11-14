import { getMember, adminToken, pbFetch, sendError, HttpError } from './_lib/server.js';
import { TRIAL_DAYS } from './_lib/membership.js';

// POST: arranca la prueba gratis de 15 días SIN tarjeta (una sola vez por cuenta).
// Solo si nunca tuvo Stripe ni prueba. El servidor fija la fecha; el cliente no puede escribir subscriptions.
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const m = await getMember(req);
    const s = m.subscription;
    const token = await adminToken();
    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 86400 * 1000).toISOString();

    if (!s) {
      const r = await pbFetch('/api/collections/subscriptions/records', { method: 'POST', token, body: { owner: m.user.id, status: 'trialing', trial_end: trialEnd } });
      if (!r.ok) throw new HttpError(500, 'No se pudo iniciar la prueba.');
      return res.status(200).json({ started: true, trial_end: trialEnd });
    }
    const eligible = s.status === 'inactive' && !s.stripe_customer_id && !s.stripe_subscription_id && !s.trial_end;
    if (!eligible) return res.status(200).json({ started: false, status: s.status, trial_end: s.trial_end || null });

    const r = await pbFetch(`/api/collections/subscriptions/records/${s.id}`, { method: 'PATCH', token, body: { status: 'trialing', trial_end: trialEnd } });
    if (!r.ok) throw new HttpError(500, 'No se pudo iniciar la prueba.');
    return res.status(200).json({ started: true, trial_end: trialEnd });
  } catch (e) {
    return sendError(res, e);
  }
}
