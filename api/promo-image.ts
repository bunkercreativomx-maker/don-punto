import { requireMember, rateLimit, sendError, readJsonBody } from './_lib/server.js';
import { kvGet, kvSet } from './_lib/push.js';

// Impulsar un platillo rezagado: copy de promoción + foto publicitaria con IA.
// Límite mensual por plan (contado en servidor, app_kv): Básico 3, Pro/cortesía 20.
export const config = { maxDuration: 60 };

const LIMITS: Record<string, number> = { basico: 3, pro: 20, cortesia: 20 };
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function monthKey() {
  // mes calendario en hora de Cd. Juárez (America/Ciudad_Juarez ~ UTC-6/-7)
  const d = new Date(Date.now() - 6 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function getUsage(uid: string) {
  const cur = await kvGet(`promo_usage:${uid}`);
  const m = monthKey();
  const v = cur?.value && cur.value.month === m ? cur.value : { month: m, count: 0 };
  return v as { month: string; count: number };
}

function money(n: number) { return Math.round(n * 100) / 100; }

/** Precio de promo seguro: nunca debajo del costo + 20 %, nunca arriba del precio normal. */
function safePromoPrice(raw: number, sale: number, cost: number) {
  const floor = cost > 0 ? cost * 1.2 : sale * 0.7;
  let p = Number(raw);
  if (!isFinite(p) || p <= 0) p = sale * 0.85;
  p = Math.min(p, sale * 0.95);
  p = Math.max(p, floor);
  if (p >= sale) return null; // no hay margen para descuento
  return Math.round(p); // precios redondos en pesos
}

async function gemini(apiKey: string, model: string, body: any) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`gemini ${model} ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function makeCopy(apiKey: string, d: any) {
  const prompt = `Eres experto en marketing para restaurantes y puestos de comida en México (dueños de negocios pequeños).
Un platillo se está vendiendo poco este mes. Diseña UNA promoción sencilla para impulsarlo.

Negocio: ${d.businessName || 'un negocio de comida'}
Platillo rezagado: ${d.name}${d.description ? ` (${d.description})` : ''}
Precio normal: $${d.salePrice} MXN${d.costPrice > 0 ? ` · costo aprox: $${d.costPrice}` : ''}
Ventas este mes: ${d.quantity}
Día más flojo de la semana: ${d.slowDay || 'desconocido'}
Platillos estrella (para combos): ${(d.stars || []).map((s: any) => `${s.name} $${s.price}`).join(', ') || 'ninguno'}

Reglas:
- tipo: "precio" (precio especial del platillo), "combo" (con un platillo estrella) o "dia" (precio especial solo el día flojo).
- precio_promo en pesos enteros: menor al precio normal${d.costPrice > 0 ? ' y al menos 20% arriba del costo' : ''}. En combo: menor a la suma de los dos precios.
- titulo: máximo 4 palabras, gancho fuerte (ej. "¡Martes de Volcán!").
- oferta: máximo 7 palabras que expliquen la promo (sin precio y sin repetir el día; ej. describe el platillo o el combo).
- caption: texto para Facebook/Instagram en español mexicano, cercano, 2-3 líneas, con 2-3 emojis y CTA (ven hoy / pide ya). Incluye el precio. Sin hashtags dentro.
- hashtags: 3-5 hashtags locales y del platillo.
- whatsapp: mensaje corto para estados de WhatsApp (1-2 líneas, con precio).
- dia: día sugerido para lanzarla (en minúsculas) o "" si aplica toda la semana.
- No inventes ingredientes que no correspondan al platillo.

Responde SOLO JSON: {"tipo":"precio|combo|dia","titulo":"","oferta":"","precio_promo":0,"combo_con":"","dia":"","caption":"","hashtags":[""],"whatsapp":""}`;
  const data = await gemini(apiKey, 'gemini-2.5-flash', {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
  });
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(text);
}

function imagePrompt(d: any, hasPhoto: boolean, comboWith = '') {
  const dish = `${d.name}${d.description ? ` (${d.description})` : ''}${comboWith ? ` together with ${comboWith} (both items visible, as a combo)` : ''}`;
  const base = `Leave the upper third of the frame as soft out-of-focus background (space for text). Warm natural light, shallow depth of field, appetizing, realistic colors, looks like a real photo taken at a Mexican food business. Vertical 4:5. No text, no letters, no numbers, no logos, no watermarks, no people, no hands.`;
  return hasPhoto
    ? `Turn this photo into a professional, appetizing food photo for a social media ad. Keep EXACTLY the same dish, ingredients, portion and plate as in the photo (it is the real product: ${dish}); improve only lighting, background and composition. ${base}`
    : `Professional appetizing food photography for a social media ad of: ${dish}, Mexican food, served as it is sold in a Mexican taquería / food stand. Close-up, 45-degree angle. ${base}`;
}

async function imageGemini(apiKey: string, prompt: string, photo?: { mime: string; data: string }) {
  const parts: any[] = [{ text: prompt }];
  if (photo) parts.push({ inline_data: { mime_type: photo.mime, data: photo.data } });
  const data = await gemini(apiKey, 'gemini-2.5-flash-image', {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:5' } },
  });
  const p = (data?.candidates?.[0]?.content?.parts || []).find((x: any) => x.inline_data || x.inlineData);
  const img = p?.inline_data || p?.inlineData;
  if (!img?.data) throw new Error('gemini image: sin imagen');
  return `data:${img.mime_type || img.mimeType || 'image/png'};base64,${img.data}`;
}

async function imageFal(key: string, prompt: string, photo?: { mime: string; data: string }) {
  const ep = photo ? 'fal-ai/nano-banana/edit' : 'fal-ai/nano-banana';
  const body: any = { prompt, num_images: 1, output_format: 'jpeg', aspect_ratio: '4:5' };
  if (photo) body.image_urls = [`data:${photo.mime};base64,${photo.data}`];
  const r = await fetch(`https://fal.run/${ep}`, {
    method: 'POST', headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`fal ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const url = (await r.json())?.images?.[0]?.url;
  if (!url) throw new Error('fal: sin imagen');
  const img = await fetch(url);
  const buf = Buffer.from(await img.arrayBuffer());
  return `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  let m;
  try {
    m = await requireMember(req);
  } catch (e) { return sendError(res, e); }
  const limit = LIMITS[m.plan] ?? 3;

  try {
    if (req.method === 'GET') {
      const u = await getUsage(m.user.id);
      return res.status(200).json({ used: u.count, limit, remaining: Math.max(0, limit - u.count), plan: m.plan });
    }
    rateLimit(`promo:${m.user.id}`, 10, 10 * 60 * 1000);
    const usage = await getUsage(m.user.id);
    if (usage.count >= limit) {
      return res.status(429).json({
        error: m.plan === 'basico'
          ? `Ya usaste tus ${limit} promociones de este mes. Con el plan Pro tienes ${LIMITS.pro} al mes.`
          : `Ya usaste tus ${limit} promociones de este mes. Se renuevan el día 1.`,
        code: 'limit', remaining: 0, limit,
      });
    }

    const body = await readJsonBody(req);
    const d = {
      name: String(body?.name || '').slice(0, 80).trim(),
      description: String(body?.description || '').slice(0, 160).trim(),
      salePrice: money(Number(body?.salePrice) || 0),
      costPrice: money(Number(body?.costPrice) || 0),
      quantity: Math.max(0, Math.round(Number(body?.quantity) || 0)),
      slowDay: DAYS.includes(String(body?.slowDay || '').toLowerCase()) ? String(body.slowDay).toLowerCase() : '',
      businessName: String(body?.businessName || '').slice(0, 60).trim(),
      stars: Array.isArray(body?.stars) ? body.stars.slice(0, 3).map((s: any) => ({ name: String(s?.name || '').slice(0, 60), price: money(Number(s?.price) || 0), cost: money(Number(s?.cost) || 0) })).filter((s: any) => s.name && s.price > 0) : [],
    };
    if (!d.name || d.salePrice <= 0) return res.status(400).json({ error: 'Falta el nombre o el precio del platillo.' });

    let photo: { mime: string; data: string } | undefined;
    if (typeof body?.photo === 'string' && body.photo.startsWith('data:image/')) {
      const mm = body.photo.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!mm) return res.status(400).json({ error: 'Foto inválida.' });
      if (mm[2].length > 4_000_000) return res.status(413).json({ error: 'La foto es muy pesada. Usa una más ligera.' });
      photo = { mime: mm[1], data: mm[2] };
    }

    const gKey = process.env.GEMINI_API_KEY;
    const fKey = process.env.FAL_KEY;
    if (!gKey) return res.status(503).json({ error: 'La función de IA no está disponible por el momento.' });

    let c: any = {};
    try { c = (await makeCopy(gKey, d)) || {}; } catch (e) { console.error('promo copy error', e); }

    // Validación determinista del precio (la IA no decide el margen)
    let tipo = ['precio', 'combo', 'dia'].includes(c.tipo) ? c.tipo : 'precio';
    let precio: number | null = null;
    let comboCon = '';
    if (tipo === 'combo') {
      const star = d.stars.find((s: any) => s.name.toLowerCase() === String(c.combo_con || '').toLowerCase()) || d.stars[0];
      if (star) {
        const sum = d.salePrice + star.price;
        const floor = d.costPrice > 0 && star.cost > 0 ? (d.costPrice + star.cost) * 1.2 : sum * 0.75;
        let p = Number(c.precio_promo);
        if (!isFinite(p) || p <= 0) p = sum * 0.88;
        p = Math.round(Math.max(Math.min(p, sum * 0.95), floor));
        if (p < sum) { precio = p; comboCon = star.name; }
      }
      if (precio === null) tipo = 'precio';
    }
    if (tipo !== 'combo') precio = safePromoPrice(c.precio_promo, d.salePrice, d.costPrice);

    const copy = {
      tipo, combo_con: comboCon,
      titulo: String(c.titulo || `¡Prueba ${d.name}!`).slice(0, 40),
      oferta: String(c.oferta || (comboCon ? `${d.name} + ${comboCon}` : 'Precio especial esta semana')).slice(0, 60),
      precio_promo: precio, precio_normal: comboCon ? money(d.salePrice + (d.stars.find((s: any) => s.name === comboCon)?.price || 0)) : d.salePrice,
      dia: DAYS.includes(String(c.dia || '').toLowerCase()) ? String(c.dia).toLowerCase() : d.slowDay,
      caption: String(c.caption || '').slice(0, 600),
      hashtags: Array.isArray(c.hashtags) ? c.hashtags.slice(0, 5).map((h: any) => String(h).replace(/\s/g, '')).filter(Boolean) : [],
      whatsapp: String(c.whatsapp || '').slice(0, 300),
    };
    // si la IA puso otro precio en los textos, se corrige al validado
    const aiPrice = Math.round(Number(c.precio_promo));
    if (precio !== null && isFinite(aiPrice) && aiPrice !== precio) {
      const fix = (t: string) => t.replace(/\$\s?\d+(?:[.,]\d{1,2})?/g, (s) => (Math.round(Number(s.replace(/[^\d.]/g, ''))) === aiPrice ? `$${precio}` : s));
      copy.caption = fix(copy.caption); copy.whatsapp = fix(copy.whatsapp);
    } else if (precio === null && isFinite(aiPrice)) {
      // sin margen para descuento: se anuncia el precio normal
      const fix = (t: string) => t.replace(/\$\s?\d+(?:[.,]\d{1,2})?/g, (s) => (Math.round(Number(s.replace(/[^\d.]/g, ''))) === aiPrice ? `$${d.salePrice}` : s));
      copy.caption = fix(copy.caption); copy.whatsapp = fix(copy.whatsapp);
    }

    const prompt = imagePrompt(d, !!photo, comboCon);
    let image: string;
    try {
      image = await (async () => {
        if (fKey) {
          try { return await imageFal(fKey, prompt, photo); } catch (e) { console.error(e); }
        }
        return imageGemini(gKey, prompt, photo);
      })();
    } catch (e) {
      console.error('promo image error', e);
      return res.status(502).json({ error: 'No se pudo generar la imagen. Intenta de nuevo en un momento.' });
    }

    const next = { month: usage.month, count: usage.count + 1 };
    await kvSet(`promo_usage:${m.user.id}`, next);
    return res.status(200).json({ image, copy, used: next.count, limit, remaining: Math.max(0, limit - next.count) });
  } catch (err) {
    console.error('promo-image handler error:', err);
    return sendError(res, err);
  }
}
