import { getMember, readJsonBody, sendError, HttpError, adminToken, pbFetch, rateLimit } from './_lib/server.js';
import { sendToUser } from './_lib/push.js';

// Alta/baja de dispositivos para notificaciones y envío de prueba
export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const m = await getMember(req);
    const body = await readJsonBody(req);
    const token = await adminToken();

    if (body.action === 'subscribe') {
      const s = body.subscription;
      if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) throw new HttpError(400, 'Suscripción inválida');
      if (!/^https:\/\//.test(s.endpoint)) throw new HttpError(400, 'Suscripción inválida');
      const fields = {
        owner: m.user.id,
        endpoint: String(s.endpoint).slice(0, 1000),
        p256dh: String(s.keys.p256dh).slice(0, 300),
        auth: String(s.keys.auth).slice(0, 100),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 400),
        daily_summary: body.dailySummary !== false,
      };
      const ex = await pbFetch(`/api/collections/push_subscriptions/records?perPage=1&filter=${encodeURIComponent(`endpoint = "${fields.endpoint.replace(/"/g, '')}"`)}`, { token });
      const rec = ex.data?.items?.[0];
      const r = rec
        ? await pbFetch(`/api/collections/push_subscriptions/records/${rec.id}`, { method: 'PATCH', token, body: fields })
        : await pbFetch('/api/collections/push_subscriptions/records', { method: 'POST', token, body: fields });
      if (!r.ok) throw new HttpError(500, 'No se pudo guardar el dispositivo');
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'settings') {
      const ex = await pbFetch(`/api/collections/push_subscriptions/records?perPage=1&filter=${encodeURIComponent(`endpoint = "${String(body.endpoint || '').replace(/"/g, '')}" && owner = "${m.user.id}"`)}`, { token });
      const rec = ex.data?.items?.[0];
      if (rec) await pbFetch(`/api/collections/push_subscriptions/records/${rec.id}`, { method: 'PATCH', token, body: { daily_summary: !!body.dailySummary } });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'unsubscribe') {
      const ex = await pbFetch(`/api/collections/push_subscriptions/records?perPage=1&filter=${encodeURIComponent(`endpoint = "${String(body.endpoint || '').replace(/"/g, '')}" && owner = "${m.user.id}"`)}`, { token });
      const rec = ex.data?.items?.[0];
      if (rec) await pbFetch(`/api/collections/push_subscriptions/records/${rec.id}`, { method: 'DELETE', token });
      return res.status(200).json({ ok: true });
    }

    if (body.action === 'stock') {
      // Alerta de inventario (plan Pro): se manda a los dispositivos del dueño
      if (m.plan === 'basico' || !m.active) throw new HttpError(403, 'Función del plan Pro', 'plan_pro');
      rateLimit(`stock:${m.user.id}`, 30, 60 * 60 * 1000);
      const items = (Array.isArray(body.items) ? body.items : []).slice(0, 6)
        .map((i: any) => `${String(i?.nombre || '').slice(0, 40)}: ${Number(i?.saldo) || 0} ${String(i?.unidad || '').slice(0, 10)}`);
      if (!items.length) throw new HttpError(400, 'Sin insumos');
      const sent = await sendToUser(m.user.id, { title: 'Se está acabando', body: items.join(' · '), url: '/?tab=inventory', tag: 'stock' }).catch(() => 0);
      return res.status(200).json({ ok: true, sent });
    }

    if (body.action === 'test') {
      const sent = await sendToUser(m.user.id, {
        title: 'Don Punto',
        body: '¡Listo! Las notificaciones llegan a este dispositivo.',
        url: '/',
        tag: 'test',
      });
      if (!sent) throw new HttpError(404, 'No hay dispositivos activos. Vuelve a activar las notificaciones.');
      return res.status(200).json({ ok: true, sent });
    }

    throw new HttpError(400, 'Acción inválida');
  } catch (e) {
    return sendError(res, e);
  }
}
