import { adminToken, pbFetch } from './_lib/server.js';
import { sendToUser, kvGet, kvSet } from './_lib/push.js';

// Resumen diario de ventas por push (Vercel Cron). Idempotente: una vez por día.
const TZ = 'America/Ciudad_Juarez';
const money = (n: number) => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const localDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d); // YYYY-MM-DD

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers?.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  const today = localDate(new Date());
  const last = await kvGet('daily_summary_last');
  if (last?.value === today && req.query?.force !== '1') return res.status(200).json({ skipped: 'ya enviado hoy', today });
  await kvSet('daily_summary_last', today);

  const token = await adminToken();
  const subs = await pbFetch(`/api/collections/push_subscriptions/records?perPage=500&fields=owner&filter=${encodeURIComponent('daily_summary = true')}`, { token });
  const owners = [...new Set<string>((subs.data?.items || []).map((s: any) => s.owner))];
  const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString().replace('T', ' ');
  let notified = 0;

  for (const uid of owners) {
    const filter = `owner = "${uid}" && kind = "delivery_calculator_pos_txs" && updated >= "${since}"`;
    const r = await pbFetch(`/api/collections/user_items/records?perPage=500&filter=${encodeURIComponent(filter)}`, { token });
    const txs = (r.data?.items || []).map((it: any) => it.data?.v).filter((t: any) => t?.date && localDate(new Date(t.date)) === today);
    if (!txs.length) continue;
    const total = txs.reduce((s: number, t: any) => s + (Number(t.amount) || 0), 0);
    const avg = total / txs.length;
    const sent = await sendToUser(
      uid,
      {
        title: `Cierre de hoy: ${money(total)}`,
        body: `${txs.length} ${txs.length === 1 ? 'venta' : 'ventas'} · ticket promedio ${money(avg)}. Toca para ver tu reporte.`,
        url: '/?tab=reports',
        tag: `resumen-${today}`,
      },
      { onlyDailySummary: true },
    );
    if (sent) notified++;
  }
  return res.status(200).json({ today, owners: owners.length, notified });
}
