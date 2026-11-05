// donpunto.com -> Cloudflare Pages (donpunto.pages.dev); www -> 301 al apex
// donpunto-pb.bunkeragent.cloud -> PocketBase en Cloudflare (service binding PB), para apps instaladas viejas
const ORIGIN = 'https://donpunto.pages.dev';
const HOST = 'https://donpunto.com';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'donpunto-pb.bunkeragent.cloud') return env.PB.fetch(request);
    if (url.hostname !== 'donpunto.com') return Response.redirect(HOST + url.pathname + url.search, 301);
    const headers = new Headers(request.headers);
    const ip = request.headers.get('cf-connecting-ip');
    if (ip) headers.set('x-forwarded-for', ip);
    headers.set('x-forwarded-host', 'donpunto.com');
    const res = await fetch(ORIGIN + url.pathname + url.search, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual',
    });
    const out = new Response(res.body, res);
    const loc = out.headers.get('location');
    if (loc && loc.startsWith(ORIGIN)) out.headers.set('location', HOST + loc.slice(ORIGIN.length));
    return out;
  },
};
