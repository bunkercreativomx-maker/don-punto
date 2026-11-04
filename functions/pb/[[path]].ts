// /pb/* -> PocketBase (reemplaza el rewrite de vercel.json)
const UPSTREAM = 'https://donpunto-pb.bunkeragent.cloud';
export async function onRequest({ request }: any) {
  const url = new URL(request.url);
  const target = UPSTREAM + url.pathname.replace(/^\/pb/, '') + url.search;
  const headers = new Headers(request.headers);
  headers.delete('host');
  if (!/Mozilla/.test(headers.get('user-agent') || '')) headers.set('user-agent', 'Mozilla/5.0 (DonPunto-Proxy) Chrome/130');
  const init: RequestInit = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;
  const res = await fetch(target, init);
  return new Response(res.body, res);
}
