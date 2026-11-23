import { HttpError, sendError, rateLimit, readJsonBody } from './_lib/server.js';
import { notifyTeam, esc } from './_lib/notify.js';
import { kvGet, kvSet } from './_lib/push.js';
import { capi, visitorFrom } from './_lib/capi.js';

// POST público del landing: «Déjanos tu número y te marcamos».
// Avisa al grupo de soporte en Telegram y guarda copia en app_kv `landing_leads` (últimos 500).
const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ip = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ip';
    rateLimit('lead:' + ip, 4, 60 * 60 * 1000);
    const b = await readJsonBody(req);
    if (clean(b.website, 10)) return res.status(200).json({ ok: true }); // trampa para bots

    const name = clean(b.name, 60);
    const business = clean(b.business, 80);
    const digits = String(b.phone ?? '').replace(/\D/g, '');
    if (name.length < 2) throw new HttpError(400, 'Escribe tu nombre.');
    if (digits.length < 10 || digits.length > 13) throw new HttpError(400, 'Escribe tu teléfono a 10 dígitos.');
    const ad = /^a\d{2}$/.test(String(b.ad || '')) ? String(b.ad) : '';
    const phone = digits.length === 10 ? `+52${digits}` : `+${digits}`;
    const lead = { name, business, phone, ad, at: new Date().toISOString() };

    let saved = false;
    try {
      const cur = await kvGet('landing_leads');
      const list = Array.isArray(cur?.value) ? cur!.value : [];
      await kvSet('landing_leads', [...list, lead].slice(-500));
      saved = true;
    } catch (e: any) {
      console.error('lead kv', e?.message);
    }
    const sent = await notifyTeam(
      `📞 <b>Pide que le marquen</b> (landing)\n${esc(name)}${business ? ' · ' + esc(business) : ''}\nTel: ${phone}` + (ad ? `\nAnuncio: ${ad}` : ''),
    );
    const eid = String(b.eid || '').slice(0, 60);
    if (sent || saved) await capi({ name: 'Lead', eventId: eid || 'lead_' + digits, phone, visitor: visitorFrom(req), custom: { content_name: 'te-marcamos', ad } });
    if (!sent && !saved) throw new HttpError(502, 'No pudimos guardar tu número. Escríbenos por el chat de esta página.');
    return res.status(200).json({ ok: true });
  } catch (e) {
    return sendError(res, e);
  }
}
