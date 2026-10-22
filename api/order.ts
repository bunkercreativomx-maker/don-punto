import { randomBytes } from 'node:crypto';
import { adminToken, pbFetch, PB_URL, HttpError, sendError, rateLimit, readJsonBody } from './_lib/server.js';
import { sendToUser } from './_lib/push.js';

// Pedidos en línea (página pública donpunto.com/<tienda>), incluido en todos los planes.
//  GET  ?slug=x       → página pública de la tienda (menú publicado + formas de entrega/cobro)
//  GET  ?check=x      → ¿está libre esa dirección?
//  GET  ?t=token      → seguimiento del pedido (cliente)
//  POST {action:'create', ...} → crea el pedido; el total lo calcula el servidor
//  POST {action:'paid', t}     → el cliente avisa que ya pagó por CoDi
// El cliente nunca escribe directo en PocketBase: stores y web_orders son solo del dueño.

const RESERVED = new Set([
  'login', 'restablecer', 'blog', 'privacidad', 'terminos', 'webinar', 'api', 'assets', 'brand', 'admin', 'app',
  'pedidos', 'pedido', 'tienda', 'tiendas', 'donpunto', 'don-punto', 'soporte', 'ayuda', 'precios', 'planes',
  'registro', 'cuenta', 'mi-cuenta', 'dashboard', 'pos', 'menu', 'sw', 'manifest', 'robots', 'sitemap', 'favicon',
  'www', 'mail', 'static', 'public', 'contacto', 'legal',
]);
const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const q = (s: string) => encodeURIComponent(s);
const esc = (s: string) => s.replace(/["\\]/g, '');
const fileUrl = (col: string, id: string, name?: string) => (name ? `${PB_URL}/api/files/${col}/${id}/${encodeURIComponent(name)}` : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

interface OMod { id: string; name: string; price: number }
interface OGroup { id: string; name: string; type: 'single' | 'multiple'; min?: number; max?: number; options: OMod[] }
interface OProduct { id: string; name: string; description?: string; price: number; categoryId?: string; groups?: string[]; photo?: string; hidden?: boolean; soldOut?: boolean }
interface OMenu { categories?: { id: string; name: string }[]; groups?: OGroup[]; products?: OProduct[] }

async function storeBySlug(token: string, slug: string) {
  const r = await pbFetch(`/api/collections/stores/records?perPage=1&filter=${q(`slug = "${esc(slug)}"`)}`, { token });
  return r.data?.items?.[0] || null;
}

async function ownerActive(token: string, owner: string) {
  const r = await pbFetch(`/api/collections/subscriptions/records?perPage=1&filter=${q(`owner = "${esc(owner)}"`)}`, { token });
  const s = r.data?.items?.[0];
  return s?.status === 'active' || s?.status === 'trialing';
}

function publicStore(s: any, active: boolean) {
  const menu: OMenu = s.menu || {};
  const products = (menu.products || []).filter((p) => !p.hidden).map((p) => ({
    id: p.id, name: p.name, description: p.description || '', price: p.price, categoryId: p.categoryId || '',
    groups: p.groups || [], soldOut: !!p.soldOut, photo: fileUrl('stores', s.id, p.photo),
  }));
  const usedCats = new Set(products.map((p) => p.categoryId));
  const usedGroups = new Set(products.flatMap((p) => p.groups));
  return {
    slug: s.slug, name: s.name || 'Mi restaurante', tagline: s.tagline || '', phone: s.phone || '', address: s.address || '',
    hours: s.hours || '', color: s.color || '#16803C',
    logo: fileUrl('stores', s.id, s.logo), cover: fileUrl('stores', s.id, s.cover),
    open: active && !!s.accepting, pickup: !!s.pickup, delivery: !!s.delivery,
    deliveryFee: Number(s.delivery_fee) || 0, minOrder: Number(s.min_order) || 0, deliveryArea: s.delivery_area || '',
    prepMinutes: Number(s.prep_minutes) || 0,
    payCash: !!s.pay_cash, payCodi: !!s.pay_codi && !!(s.codi_clabe || s.codi_qr),
    categories: (menu.categories || []).filter((c) => usedCats.has(c.id)),
    groups: (menu.groups || []).filter((g) => usedGroups.has(g.id)),
    products,
  };
}

function codiInfo(s: any) {
  return { clabe: s.codi_clabe || '', bank: s.codi_bank || '', holder: s.codi_holder || '', qr: fileUrl('stores', s.id, s.codi_qr) };
}

function publicOrder(o: any, s: any) {
  return {
    number: o.number, status: o.status, reason: o.reason || '', type: o.type, payment: o.payment, paymentStatus: o.payment_status,
    subtotal: o.subtotal, deliveryFee: o.delivery_fee, total: o.total, created: o.created, customerName: o.customer_name,
    items: (o.items || []).map((i: any) => ({ name: i.name, quantity: i.quantity, line: i.line, mods: (i.selectedModifiers || []).flatMap((g: any) => g.modifiers.map((m: any) => m.name)), note: i.customerNote || '' })),
    store: { slug: s.slug, name: s.name, phone: s.phone || '', address: s.address || '', color: s.color || '#16803C', logo: fileUrl('stores', s.id, s.logo), prepMinutes: Number(s.prep_minutes) || 0 },
    codi: o.payment === 'codi' ? codiInfo(s) : null,
  };
}

async function orderByToken(token: string, t: string) {
  if (!/^[a-f0-9]{32}$/.test(t)) throw new HttpError(404, 'Pedido no encontrado');
  const r = await pbFetch(`/api/collections/web_orders/records?perPage=1&expand=store&filter=${q(`token = "${t}"`)}`, { token });
  const o = r.data?.items?.[0];
  if (!o) throw new HttpError(404, 'Pedido no encontrado');
  return o;
}

async function createOrder(token: string, body: any, ip: string) {
  if (body.website) throw new HttpError(400, 'Solicitud inválida'); // honeypot
  rateLimit('order:' + ip, 6, 10 * 60 * 1000);
  const slug = str(body.slug, 40).toLowerCase();
  const s = SLUG_RE.test(slug) ? await storeBySlug(token, slug) : null;
  if (!s || !s.published) throw new HttpError(404, 'Este restaurante no está disponible.');
  if (!s.accepting || !(await ownerActive(token, s.owner))) throw new HttpError(409, 'El restaurante no está recibiendo pedidos en este momento.', 'closed');

  const type = body.type === 'delivery' ? 'delivery' : 'pickup';
  if (type === 'delivery' && !s.delivery) throw new HttpError(400, 'Este restaurante no hace entregas a domicilio.');
  if (type === 'pickup' && !s.pickup) throw new HttpError(400, 'Este restaurante solo hace entregas a domicilio.');
  const payment = body.payment === 'codi' ? 'codi' : 'cash';
  if (payment === 'codi' && !(s.pay_codi && (s.codi_clabe || s.codi_qr))) throw new HttpError(400, 'El pago por CoDi no está disponible.');
  if (payment === 'cash' && !s.pay_cash) throw new HttpError(400, 'Este restaurante solo acepta pago por CoDi.');

  const name = str(body.name, 80);
  const phone = str(body.phone, 30).replace(/[^\d+ ]/g, '');
  const address = str(body.address, 300);
  if (name.length < 2) throw new HttpError(400, 'Escribe tu nombre.');
  if (phone.replace(/\D/g, '').length < 10) throw new HttpError(400, 'Escribe un teléfono de 10 dígitos.');
  if (type === 'delivery' && address.length < 8) throw new HttpError(400, 'Escribe tu dirección completa.');

  // Total calculado aquí con el menú publicado del restaurante (nunca con precios del navegador)
  const menu: OMenu = s.menu || {};
  const prods = new Map((menu.products || []).filter((p) => !p.hidden).map((p) => [p.id, p]));
  const groups = new Map((menu.groups || []).map((g) => [g.id, g]));
  const raw: any[] = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
  if (!raw.length) throw new HttpError(400, 'Tu carrito está vacío.');
  let subtotal = 0;
  const items = raw.map((it) => {
    const p = prods.get(String(it?.id));
    if (!p) throw new HttpError(409, 'Un platillo de tu carrito ya no está disponible. Actualiza la página.', 'stale');
    if (p.soldOut) throw new HttpError(409, `"${p.name}" se agotó por hoy.`, 'sold_out');
    const quantity = Math.max(1, Math.min(50, Math.floor(Number(it.qty) || 1)));
    const selectedModifiers: { groupId: string; modifiers: { id: string; name: string; extraPrice: number }[] }[] = [];
    let unit = Number(p.price) || 0;
    for (const gid of p.groups || []) {
      const g = groups.get(gid);
      if (!g) continue;
      const picked: string[] = Array.isArray(it.mods?.[gid]) ? it.mods[gid].map(String) : [];
      const opts = g.options.filter((o) => picked.includes(o.id));
      const max = g.type === 'single' ? 1 : g.max || g.options.length;
      if (opts.length > max) throw new HttpError(400, `Elige máximo ${max} en "${g.name}".`);
      if (opts.length < (g.min || 0)) throw new HttpError(400, `Elige al menos ${g.min} en "${g.name}" (${p.name}).`);
      if (opts.length) {
        selectedModifiers.push({ groupId: gid, modifiers: opts.map((o) => ({ id: o.id, name: o.name, extraPrice: Number(o.price) || 0 })) });
        unit += opts.reduce((a, o) => a + (Number(o.price) || 0), 0);
      }
    }
    const line = round2(unit * quantity);
    subtotal += line;
    return { rowId: p.id, name: p.name, quantity, unit: round2(unit), line, customerNote: str(it.note, 120) || undefined, selectedModifiers };
  });
  subtotal = round2(subtotal);
  const minOrder = Number(s.min_order) || 0;
  if (type === 'delivery' && minOrder && subtotal < minOrder) throw new HttpError(400, `El pedido mínimo a domicilio es de $${minOrder}.`);
  const deliveryFee = type === 'delivery' ? Number(s.delivery_fee) || 0 : 0;
  const total = round2(subtotal + deliveryFee);

  const count = await pbFetch(`/api/collections/web_orders/records?perPage=1&fields=id&filter=${q(`store = "${s.id}"`)}`, { token });
  const number = (count.data?.totalItems || 0) + 1;
  const t = randomBytes(16).toString('hex');
  const created = await pbFetch('/api/collections/web_orders/records', {
    method: 'POST', token,
    body: {
      store: s.id, owner: s.owner, number, token: t, customer_name: name, customer_phone: phone, type,
      address: type === 'delivery' ? address : '', notes: str(body.notes, 300), items, subtotal, delivery_fee: deliveryFee, total,
      payment, payment_status: 'pending', status: 'new',
    },
  });
  if (!created.ok) {
    console.error('web_orders create', created.status, created.data);
    throw new HttpError(500, 'No se pudo enviar tu pedido. Intenta de nuevo.');
  }
  try {
    await sendToUser(s.owner, {
      title: `🛎️ Pedido en línea #${number}`,
      body: `${name} · ${type === 'delivery' ? 'A domicilio' : 'Para recoger'} · $${total}${payment === 'codi' ? ' · CoDi' : ''}`,
      url: '/?tab=online', tag: 'order-' + created.data.id, sticky: true,
    });
  } catch (e) { console.error('push pedido', e); }
  return { token: t, number };
}

export default async function handler(req: any, res: any) {
  try {
    const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
    const token = await adminToken();
    if (req.method === 'GET') {
      const { slug, check, t } = req.query || {};
      if (check !== undefined) {
        rateLimit('check:' + ip, 60, 60 * 1000);
        const c = String(check).toLowerCase();
        if (!SLUG_RE.test(c)) return res.status(200).json({ available: false, reason: 'Solo letras minúsculas, números y guiones (3 a 40).' });
        if (RESERVED.has(c)) return res.status(200).json({ available: false, reason: 'Esa dirección está reservada.' });
        const s = await storeBySlug(token, c);
        return res.status(200).json({ available: !s, reason: s ? 'Ya la usa otro restaurante.' : '' });
      }
      if (t) {
        const o = await orderByToken(token, String(t));
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(publicOrder(o, o.expand?.store || {}));
      }
      const sl = String(slug || '').toLowerCase();
      const s = SLUG_RE.test(sl) && !RESERVED.has(sl) ? await storeBySlug(token, sl) : null;
      if (!s || !s.published) throw new HttpError(404, 'Este restaurante no existe o aún no publica su página.');
      const active = await ownerActive(token, s.owner);
      res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return res.status(200).json(publicStore(s, active));
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body.action === 'paid') {
        rateLimit('paid:' + ip, 20, 10 * 60 * 1000);
        const o = await orderByToken(token, String(body.t || ''));
        if (o.payment === 'codi' && o.payment_status === 'pending' && o.status !== 'rejected') {
          await pbFetch(`/api/collections/web_orders/records/${o.id}`, { method: 'PATCH', token, body: { payment_status: 'reported' } });
          try {
            await sendToUser(o.owner, { title: `💸 Pago CoDi reportado · #${o.number}`, body: `${o.customer_name} dice que ya pagó $${o.total}. Revisa tu banco.`, url: '/?tab=online', tag: 'pay-' + o.id });
          } catch (e) { console.error('push pago', e); }
        }
        return res.status(200).json({ ok: true });
      }
      const out = await createOrder(token, body, ip);
      return res.status(200).json(out);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return sendError(res, e);
  }
}
