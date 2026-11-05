// Monitor de Don Punto en Cloudflare (no depende del servidor de casa). Cada 5 min.
// Avisa por Telegram cuando algo falla 2 revisiones seguidas y cuando se recupera. Estado en KV.
const UA = 'Mozilla/5.0 (DonPunto-Monitor) Chrome/130';
const CHECKS = [
  { id: 'site', name: 'Sitio donpunto.com', url: 'https://donpunto.com/' },
  { id: 'pb', name: 'Base de datos (PocketBase)', url: 'https://donpunto.com/pb/api/health' },
  { id: 'api', name: 'Funciones /api', url: 'https://donpunto.com/api/support?status=1' },
  { id: 'blog', name: 'Blog donpunto.com/blog', url: 'https://donpunto.com/blog' },
];
// Servidor de casa: se considera caído si fallan TODOS estos (pasan por el túnel de casa)
const HOME = ['https://solace-pb.bunkeragent.cloud/api/health', 'https://creditos-pb.bunkeragent.cloud/api/health'];

async function ok(url) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000), cf: { cacheTtl: 0 } });
      if (r.status === 200) return null;
      if (i === 1) return 'HTTP ' + r.status;
    } catch (e) {
      if (i === 1) return String(e && e.name || e);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function tg(env, text) {
  await fetch(`https://api.telegram.org/bot${env.TG_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT, text }),
  });
}

async function run(env) {
  const results = await Promise.all(CHECKS.map(async (c) => [c, await ok(c.url)]));
  const homeErrs = await Promise.all(HOME.map(ok));
  results.push([{ id: 'home', name: 'Tu servidor de casa (túnel)' }, homeErrs.every(Boolean) ? homeErrs[0] : null]);
  const msgs = [];
  for (const [c, err] of results) {
    const key = 'st:' + c.id;
    const st = (await env.KV.get(key, 'json')) || { fails: 0, alerted: false };
    if (err) {
      st.fails++;
      if (!st.since) st.since = new Date().toISOString();
      if (st.fails >= 2 && !st.alerted) {
        const hora = new Date(st.since).toLocaleTimeString('es-MX', { timeZone: 'America/Denver', hour: '2-digit', minute: '2-digit' });
        msgs.push(`🔴 ${c.name}: falla (${err}) desde las ${hora} (hora Juárez).`);
        st.alerted = true;
      }
      await env.KV.put(key, JSON.stringify(st));
    } else if (st.fails || st.alerted) {
      if (st.alerted) msgs.push(`🟢 ${c.name}: ya se recuperó.`);
      await env.KV.put(key, JSON.stringify({ fails: 0, alerted: false }));
    }
  }
  if (msgs.length) await tg(env, 'Monitor Don Punto\n' + msgs.join('\n'));
  return results.map(([c, e]) => ({ id: c.id, err: e || null }));
}

// Una vez por hora: visita todas las páginas del blog para que su copia de respaldo esté al día
async function warmBlog() {
  try {
    const sm = await (await fetch('https://donpunto.com/blog/sitemap.xml', { headers: { 'user-agent': UA } })).text();
    const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith('https://donpunto.com/blog'));
    for (const u of urls.slice(0, 40)) {
      const html = await (await fetch(u, { headers: { 'user-agent': UA } })).text();
      for (const a of new Set(html.match(/\/blog\/_bk\/_next\/[^"'\\ )]+/g) || [])) await fetch('https://donpunto.com' + a, { headers: { 'user-agent': UA } });
    }
  } catch (_) {}
}

export default {
  async scheduled(e, env, ctx) {
    ctx.waitUntil(run(env));
    if (new Date(e.scheduledTime).getUTCMinutes() < 5) ctx.waitUntil(warmBlog());
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/__run' && request.headers.get('x-ops-secret') === env.OPS_SECRET) {
      if (url.searchParams.get('test')) await tg(env, '✅ Prueba: el monitor de Don Punto ahora corre en Cloudflare (sigue avisando aunque tu servidor esté apagado).');
      return Response.json(await run(env));
    }
    return new Response('Not found', { status: 404 });
  },
};
