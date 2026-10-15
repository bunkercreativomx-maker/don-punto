import { getMember, stripe, stripeConfigured, sendError, HttpError, APP_URL } from './_lib/server.js';

// Portal de cliente de Stripe: cambiar tarjeta, cambiar de plan, cancelar
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!stripeConfigured()) throw new HttpError(503, 'El pago en línea aún no está activo.', 'stripe_not_configured');
    const m = await getMember(req);
    const customer = m.subscription?.stripe_customer_id;
    if (!customer) throw new HttpError(404, 'Tu cuenta no tiene pagos en línea. Contacta a soporte para cambios en tu plan.', 'no_customer');
    const portal = await stripe('POST', '/billing_portal/sessions', { customer, return_url: APP_URL + '/' });
    return res.status(200).json({ url: portal.url });
  } catch (e) {
    return sendError(res, e);
  }
}
