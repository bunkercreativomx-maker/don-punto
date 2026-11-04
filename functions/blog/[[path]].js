// Proxy /blog -> blog de Bunker Rank (reemplaza el rewrite de vercel.json)
const UPSTREAM = 'https://blog.bunkerank.com/s/86ix1a1thvb52ew/blog';

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const rest = url.pathname.replace(/^\/blog\/?/, '');
  const target = UPSTREAM + (rest ? '/' + rest : '') + url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', url.host);
  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  const res = await fetch(target, init);
  return new Response(res.body, res);
}
