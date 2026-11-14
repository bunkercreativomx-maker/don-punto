import { getMember, stripe, stripeConfigured, readJsonBody, sendError, pbFetch, HttpError, APP_URL, adminToken } from './_lib/server.js';
import { TRIAL_DAYS, FOUNDER_LIMIT, FOUNDER_PRICES, inFreeTrial, pbDate } from './_lib/membership.js';
import { foundersTaken } from './founders.js';

const PLANS: Record<string, { name: string; amount: number; pbName: string }> = {
  basico: { name: 'Don Punto Básico', amount: 35000, pbName: 'Basico' },
  pro: { name: 'Don Punto Pro', amount: 79900, pbName: 'Pro' },
};

// Crea la sesión de pago de Stripe (suscripción mensual en MXN)
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!stripeConfigured()) throw new HttpError(503, 'El pago en línea aún no está activo.', 'stripe_not_configured');
    const m = await getMember(req);
    const { plan } = await readJsonBody(req);
    const p = PLANS[plan];
    if (!p) throw new HttpError(400, 'Plan inválido');

    // ¿Ya tiene suscripción de Stripe activa? → mandarlo al portal para cambiar de plan
    if (m.subscription?.status === 'active' && m.subscription?.stripe_subscription_id && m.subscription?.stripe_customer_id) {
      const portal = await stripe('POST', '/billing_portal/sessions', { customer: m.subscription.stripe_customer_id, return_url: APP_URL + '/' });
      return res.status(200).json({ url: portal.url });
    }

    // Precio desde la colección plans (stripe_price_id) si existe; si no, precio en línea
    const planRec = await pbFetch(`/api/collections/plans/records?perPage=1&filter=${encodeURIComponent(`name = "${p.pbName}"`)}`);
    // Precio de fundador (primeros 100 negocios, congelado de por vida): precio en línea con el monto de fundador
    const founder = (await foundersTaken(await adminToken()).catch(() => FOUNDER_LIMIT)) < FOUNDER_LIMIT;
    const priceId: string = founder ? '' : planRec.data?.items?.[0]?.stripe_price_id || '';
    const amount = founder ? FOUNDER_PRICES[plan as 'basico' | 'pro'] : p.amount;
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: amount,
            recurring: { interval: 'month' },
            product_data: { name: founder ? `${p.name} · Precio de fundador` : p.name },
          },
        };

    // La prueba gratis ya corre SIN tarjeta (api/trial). Si se suscribe antes de que termine,
    // Stripe respeta los días que le quedan (trial_end ≥ 48 h, mínimo de Stripe); si ya terminó, cobra hoy.
    // Cuentas viejas que nunca tuvieron prueba ni Stripe conservan los 15 días.
    const s = m.subscription;
    const firstTime = !s?.stripe_customer_id && !s?.stripe_subscription_id;
    const endMs = inFreeTrial(s) ? pbDate(s.trial_end) : 0;
    const trial = endMs > Date.now() + 48 * 3600 * 1000
      ? { trial_end: Math.floor(endMs / 1000) }
      : firstTime && !s?.trial_end
        ? { trial_period_days: TRIAL_DAYS }
        : null;
    const meta = { uid: m.user.id, plan, founder: founder ? '1' : '0' };

    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription',
      locale: 'es',
      client_reference_id: m.user.id,
      ...(m.subscription?.stripe_customer_id ? { customer: m.subscription.stripe_customer_id } : { customer_email: m.user.email }),
      line_items: { 0: lineItem },
      allow_promotion_codes: 'true',
      metadata: meta,
      payment_method_collection: 'always',
      subscription_data: { metadata: meta, ...(trial ? { ...trial, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } } : {}) },
      success_url: `${APP_URL}/?pago=ok&plan=${plan}&trial=${trial ? 1 : 0}`,
      cancel_url: `${APP_URL}/?pago=cancelado`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return sendError(res, e);
  }
}
