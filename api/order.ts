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
const num = (v: unknown) => (v === null || v === undefined || v === '' ? NaN : Number(v));
/** Distancia en línea recta (km) */
function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const hasLoc = (s: any) => Number.isFinite(num(s.lat)) && Number.isFinite(num(s.lng)) && !(Number(s.lat) === 0 && Number(s.lng) === 0);
const radiusOf = (s: any) => Number(s.radius_km) > 0 ? Number(s.radius_km) : 3;

// Geocodificación con OpenStreetMap (Nominatim): máx. ~1 petición/seg, con caché en memoria
const geoCache = new Map<string, { at: number; data: any }>();
async function nominatim(path: string) {
  const hit = geoCache.get(path);
  if (hit && Date.now() - hit.at < 24 * 3600 * 1000) return hit.data;
  const r = await fetch('https://nominatim.openstreetmap.org' + path, { headers: { 'User-Agent': 'DonPunto/1.0 (soporte@donpunto.com)', 'Accept-Language': 'es-MX' } });
  if (!r.ok) throw new HttpError(502, 'No se pudo buscar la dirección. Intenta de nuevo o usa tu ubicación.');
  const data = await r.json();
  geoCache.set(path, { at: Date.now(), data });
  return data;
}
const shortAddr = (a: any, fallback: string) => {
  if (!a) return fallback;
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  return [street, a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village].filter(Boolean).join(', ') || fallback;
};
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
    open: active && !!s.accepting, pickup: !!s.pickup,
    // A domicilio solo si hay ubicación del negocio y forma de pago válida (CoDi o efectivo con aprobación)
    delivery: !!s.delivery && hasLoc(s) && ((!!s.pay_codi && !!(s.codi_clabe || s.codi_qr)) || !!s.cash_delivery),
    deliveryFee: Number(s.delivery_fee) || 0, minOrder: Number(s.min_order) || 0, deliveryArea: s.delivery_area || '',
    prepMinutes: Number(s.prep_minutes) || 0,
    payCash: !!s.pay_cash, payCodi: !!s.pay_codi && !!(s.codi_clabe || s.codi_qr), cashDelivery: !!s.cash_delivery,
    lat: hasLoc(s) ? Number(s.lat) : null, lng: hasLoc(s) ? Number(s.lng) : null, radiusKm: radiusOf(s),
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
    number: o.number, status: o.status, reason: o.reason || '', type: o.type, payment: o.payment, paymentStatus: o.payment_status, payChanged: !!o.pay_changed,
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
  // Recoger: efectivo al recoger. A domicilio: CoDi; efectivo solo como solicitud si el restaurante lo permite.
  if (payment === 'cash' && type === 'pickup' && !s.pay_cash) throw new HttpError(400, 'Este restaurante solo acepta pago por CoDi.');
  if (payment === 'cash' && type === 'delivery' && !s.cash_delivery) throw new HttpError(400, 'Para entregas a domicilio el pago es por CoDi.');
  let lat = NaN, lng = NaN, distance = NaN;
  if (type === 'delivery') {
    if (!hasLoc(s)) throw new HttpError(400, 'El restaurante aún no configura su zona de entrega.');
    lat = num(body.lat); lng = num(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new HttpError(400, 'Confirma tu ubicación de entrega (botón "Usar mi ubicación" o busca tu dirección).', 'need_location');
    distance = Math.round(km(Number(s.lat), Number(s.lng), lat, lng) * 100) / 100;
    if (distance > radiusOf(s)) throw new HttpError(400, `Estás a ${distance.toFixed(1)} km. Este restaurante entrega hasta ${radiusOf(s)} km.`, 'out_of_zone');
  }

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
      ...(type === 'delivery' ? { lat, lng, distance_km: distance } : {}),
    },
  });
  if (!created.ok) {
    console.error('web_orders create', created.status, created.data);
    throw new HttpError(500, 'No se pudo enviar tu pedido. Intenta de nuevo.');
  }
  try {
    await sendToUser(s.owner, {
      title: type === 'delivery' && payment === 'cash' ? `💵 Pedido #${number}: pide pagar en efectivo` : `🛎️ Pedido en línea #${number}`,
      body: `${name} · ${type === 'delivery' ? `A domicilio (${distance.toFixed(1)} km)` : 'Para recoger'} · $${total}${payment === 'codi' ? ' · CoDi' : type === 'delivery' ? ' · ¿Aceptas efectivo?' : ''}`,
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
      const { slug, check, t, geo, rev } = req.query || {};
      if (geo !== undefined || rev !== undefined) {
        rateLimit('geo:' + ip, 20, 60 * 1000);
        if (rev !== undefined) {
          const [la, lo] = String(rev).split(',').map(Number);
          if (!Number.isFinite(la) || !Number.isFinite(lo)) throw new HttpError(400, 'Ubicación inválida');
          const d = await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${la.toFixed(5)}&lon=${lo.toFixed(5)}`);
          return res.status(200).json({ address: shortAddr(d?.address, d?.display_name || '') });
        }
        const qtext = str(geo, 160);
        if (qtext.length < 4) return res.status(200).json({ results: [] });
        let bias = '';
        const sl = String(slug || '').toLowerCase();
        const st = SLUG_RE.test(sl) ? await storeBySlug(token, sl) : null;
        if (st && hasLoc(st)) {
          const d = 0.12; // ~13 km alrededor del negocio
          bias = `&viewbox=${Number(st.lng) - d},${Number(st.lat) + d},${Number(st.lng) + d},${Number(st.lat) - d}&bounded=1`;
        }
        const d = await nominatim(`/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=mx,us&q=${q(qtext)}${bias}`);
        return res.status(200).json({ results: (Array.isArray(d) ? d : []).map((x: any) => ({ label: shortAddr(x.address, x.display_name), full: x.display_name, lat: Number(x.lat), lng: Number(x.lon) })) });
      }
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
