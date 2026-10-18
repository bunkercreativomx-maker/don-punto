import { getMember, stripe, stripeConfigured, readJsonBody, sendError, pbFetch, HttpError, APP_URL } from './_lib/server.js';

const PLANS: Record<string, { name: string; amount: number; pbName: string }> = {
  basico: { name: 'Don Punto Básico', amount: 35000, pbName: 'Basico' },
  pro: { name: 'Don Punto Pro', amount: 79900, pbName: 'Pro' },
};

const TRIAL_DAYS = 15;

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
    if (m.active && m.subscription?.stripe_subscription_id && m.subscription?.stripe_customer_id) {
      const portal = await stripe('POST', '/billing_portal/sessions', { customer: m.subscription.stripe_customer_id, return_url: APP_URL + '/' });
      return res.status(200).json({ url: portal.url });
    }

    // Precio desde la colección plans (stripe_price_id) si existe; si no, precio en línea
    const planRec = await pbFetch(`/api/collections/plans/records?perPage=1&filter=${encodeURIComponent(`name = "${p.pbName}"`)}`);
    const priceId: string = planRec.data?.items?.[0]?.stripe_price_id || '';
    const lineItem = priceId
      ? { price: priceId, quantity: 1 }
      : {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: p.amount,
            recurring: { interval: 'month' },
            product_data: { name: p.name },
          },
        };

    // Prueba gratis de 15 días solo la primera vez (quien nunca ha tenido cliente en Stripe).
    // Se pide tarjeta desde el inicio y Stripe cobra solo al terminar la prueba.
    const firstTime = !m.subscription?.stripe_customer_id && !m.subscription?.stripe_subscription_id;
    const trial = firstTime
      ? { trial_period_days: TRIAL_DAYS, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } } }
      : {};

    const session = await stripe('POST', '/checkout/sessions', {
      mode: 'subscription',
      locale: 'es',
      client_reference_id: m.user.id,
      ...(m.subscription?.stripe_customer_id ? { customer: m.subscription.stripe_customer_id } : { customer_email: m.user.email }),
      line_items: { 0: lineItem },
      allow_promotion_codes: 'true',
      metadata: { uid: m.user.id, plan },
      payment_method_collection: 'always',
      subscription_data: { metadata: { uid: m.user.id, plan }, ...trial },
      success_url: `${APP_URL}/?pago=ok`,
      cancel_url: `${APP_URL}/?pago=cancelado`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    return sendError(res, e);
  }
}
