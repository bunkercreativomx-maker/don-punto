// Cloudflare Pages: ejecuta los handlers estilo Vercel de /api/*.ts sin reescribirlos.
import combos from '../../api/combos';
import cronDaily from '../../api/cron-daily';
import factura from '../../api/factura';
import order from '../../api/order';
import promoImage from '../../api/promo-image';
import push from '../../api/push';
import scanMenu from '../../api/scan-menu';
import stripeCheckout from '../../api/stripe-checkout';
import stripePortal from '../../api/stripe-portal';
import stripeWebhook from '../../api/stripe-webhook';
import support from '../../api/support';

const ROUTES: Record<string, (req: any, res: any) => any> = {
  combos, 'cron-daily': cronDaily, factura, order, 'promo-image': promoImage, push,
  'scan-menu': scanMenu, 'stripe-checkout': stripeCheckout, 'stripe-portal': stripePortal,
  'stripe-webhook': stripeWebhook, support,
};
const RAW_BODY = new Set(['stripe-webhook']); // firma de Stripe sobre el body exacto

export async function onRequest(ctx: any): Promise<Response> {
  const { request, env } = ctx;
  // Variables/secretos de Pages -> process.env (lo que leen los handlers)
  const pe = ((globalThis as any).process ||= { env: {} }).env ||= {};
  for (const [k, v] of Object.entries(env || {})) if (typeof v === 'string' && pe[k] === undefined) pe[k] = v;

  const url = new URL(request.url);
  const name = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const handler = ROUTES[name];
  if (!handler) return Response.json({ error: 'Not found' }, { status: 404 });

  const headers: Record<string, string> = {};
  request.headers.forEach((v: string, k: string) => { headers[k.toLowerCase()] = v; });
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { if (!(k in query)) query[k] = v; });

  let body: any = undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const text = await request.text();
    if (RAW_BODY.has(name)) body = text;
    else if ((headers['content-type'] || '').includes('application/json')) {
      try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
    } else body = text;
  }
  const req = { method: request.method, headers, query, body, url: url.pathname + url.search, readable: false };

  let status = 200;
  const outHeaders = new Headers();
  let resolve!: (r: Response) => void;
  const done = new Promise<Response>((r) => { resolve = r; });
  let sent = false;
  const finish = (payload: BodyInit | null) => {
    if (sent) return;
    sent = true;
    resolve(new Response(status === 204 || status === 304 ? null : payload, { status, headers: outHeaders }));
  };
  const res: any = {
    status(c: number) { status = c; return res; },
    setHeader(k: string, v: any) { outHeaders.set(k, Array.isArray(v) ? v.join(', ') : String(v)); return res; },
    getHeader(k: string) { return outHeaders.get(k); },
    json(o: any) { if (!outHeaders.has('content-type')) outHeaders.set('content-type', 'application/json; charset=utf-8'); finish(JSON.stringify(o)); return res; },
    send(b: any) {
      if (b !== null && typeof b === 'object' && !(b instanceof Uint8Array) && !(b instanceof ArrayBuffer)) return res.json(b);
      if (typeof b === 'string' && !outHeaders.has('content-type')) outHeaders.set('content-type', 'text/html; charset=utf-8');
      finish(b ?? null); return res;
    },
    end(b?: any) { finish(b ?? null); return res; },
    redirect(a: any, b?: any) { const [c, loc] = typeof a === 'number' ? [a, b] : [302, a]; status = c; outHeaders.set('location', loc); finish(null); return res; },
  };

  try {
    await handler(req, res);
  } catch (e: any) {
    console.error('api error', name, e?.message, e?.stack);
    if (!sent) { status = 500; res.json({ error: 'Error interno. Intenta de nuevo.' }); }
  }
  if (!sent) { finish(null); }
  return done;
}
