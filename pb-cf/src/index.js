// Don Punto · PocketBase en Cloudflare Containers (una sola instancia "main").
// Litestream replica data.db a R2 cada segundo; al arrancar restaura desde R2.
import { Container, getContainer } from '@cloudflare/containers';

export class DonPuntoPB extends Container {
  defaultPort = 8090;
  sleepAfter = '48h';           // el cron de abajo lo mantiene despierto siempre
  enableInternet = true;        // R2 (litestream + archivos) y SMTP
  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      LS_BUCKET: env.LS_BUCKET, LS_PATH: env.LS_PATH, LS_ENDPOINT: env.LS_ENDPOINT,
      LS_KEY: env.LS_KEY, LS_SECRET: env.LS_SECRET, TZ: 'America/Denver',
    };
  }
  onStart() { console.log('[donpunto-pb] contenedor arrancó'); }
  onStop(p) { console.log('[donpunto-pb] contenedor se detuvo', JSON.stringify(p || {})); }
  onError(e) { console.log('[donpunto-pb] error', String(e)); throw e; }
}

const pb = (env) => getContainer(env.PB, 'main');

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Reinicio controlado (prueba de restauración desde R2 / nueva imagen). Requiere OPS_SECRET.
    if (url.pathname === '/__ops/restart') {
      if (!env.OPS_SECRET || request.headers.get('x-ops-secret') !== env.OPS_SECRET) return new Response('Not found', { status: 404 });
      await pb(env).stop();
      return Response.json({ stopped: true });
    }
    if (url.pathname.startsWith('/__ops/')) return new Response('Not found', { status: 404 });
    // Panel admin de PocketBase bloqueado en público (igual que antes en el túnel)
    if (/^\/_(\/|$)/.test(url.pathname)) return new Response('Forbidden', { status: 403 });
    try {
      return await pb(env).fetch(request);
    } catch (e) {
      console.log('[donpunto-pb] fetch falló: ' + e);
      return new Response(JSON.stringify({ status: 503, message: 'Backend starting, retry.', data: {} }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '3' } });
    }
  },
  async scheduled(_evt, env, ctx) {
    ctx.waitUntil(pb(env).fetch(new Request('http://pb/api/health')).then((r) => console.log('[donpunto-pb] ping ' + r.status)).catch((e) => console.log('[donpunto-pb] ping falló ' + e)));
  },
};
