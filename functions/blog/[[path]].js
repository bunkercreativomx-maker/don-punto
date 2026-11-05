// Proxy /blog -> blog de Bunker Rank (corre en el servidor de casa).
// Si el blog no responde (servidor apagado), sirve la última copia guardada en KV (BLOG_CACHE).
// Los archivos de Next (/_next/...) se sirven por /blog/_bk/... para que también queden guardados.
const UPSTREAM = 'https://blog.bunkerank.com/s/86ix1a1thvb52ew/blog';
const ORIGIN = 'https://blog.bunkerank.com';
const PREFIX = '/blog/_bk';
const HTML_TTL = 30 * 60; // re-guardar una página como máximo cada 30 min

const isText = (ct) => /text\/|javascript|json|xml|svg/.test(ct || '');
const rewrite = (s) => s.split(ORIGIN + '/_next/').join(PREFIX + '/_next/');

async function fromCache(env, key) {
  if (!env.BLOG_CACHE) return null;
  const { value, metadata } = await env.BLOG_CACHE.getWithMetadata(key, 'arrayBuffer');
  if (!value) return null;
  return new Response(value, { status: 200, headers: { 'content-type': (metadata && metadata.ct) || 'text/html; charset=utf-8', 'x-blog-cache': 'stale', 'cache-control': 'no-store' } });
}

export async function onRequest({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const isAsset = url.pathname.startsWith(PREFIX + '/');
  const target = isAsset
    ? ORIGIN + url.pathname.slice(PREFIX.length) + url.search
    : UPSTREAM + (url.pathname.replace(/^\/blog\/?/, '') ? '/' + url.pathname.replace(/^\/blog\/?/, '') : '') + url.search;
  const cacheable = request.method === 'GET';
  const key = (isAsset ? 'a:' : 'p:') + url.pathname + url.search;
  const forceFail = env.OPS_SECRET && request.headers.get('x-blog-test-fail') === env.OPS_SECRET;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  const init = { method: request.method, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  let res;
  try {
    if (forceFail) throw new Error('test');
    res = await fetch(target, init);
  } catch (_) {
    res = null;
  }
  if (!res || res.status >= 500) {
    if (cacheable) {
      const c = await fromCache(env, key);
      if (c) return c;
    }
    return res ? new Response(res.body, res) : new Response('El blog no está disponible en este momento.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }

  const ct = res.headers.get('content-type') || '';
  if (res.status !== 200 || !isText(ct)) {
    // binarios (imágenes, fuentes): guardar una vez
    if (cacheable && res.status === 200 && env.BLOG_CACHE) {
      const [a, b] = res.body.tee();
      waitUntil((async () => { if (!(await env.BLOG_CACHE.get(key, 'stream'))) await env.BLOG_CACHE.put(key, b, { metadata: { ct } }); else await b.cancel(); })());
      return new Response(a, res);
    }
    return new Response(res.body, res);
  }
  const body = rewrite(await res.text());
  const out = new Response(body, res);
  out.headers.delete('content-length');
  if (cacheable && env.BLOG_CACHE) {
    waitUntil((async () => {
      const mark = 't:' + key;
      if (isAsset ? !(await env.BLOG_CACHE.get(key)) : !(await env.BLOG_CACHE.get(mark))) {
        await env.BLOG_CACHE.put(key, body, { metadata: { ct } });
        if (!isAsset) await env.BLOG_CACHE.put(mark, '1', { expirationTtl: HTML_TTL });
      }
    })());
  }
  return out;
}
