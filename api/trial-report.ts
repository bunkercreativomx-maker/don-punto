import { HttpError, sendError } from './_lib/server.js';
import { notifyTeam, trialRows, who, fmtDay, TrialRow } from './_lib/notify.js';

// Resumen diario de pruebas gratis → grupo de soporte en Telegram.
// Cron donpunto-cron "0 15 * * *" (8 am Juárez en invierno, 9 am en horario de verano).
// POST con Bearer CRON_SECRET; {dry:true} regresa el texto sin mandarlo.

const DAY = 86400000;

export function buildReport(rows: TrialRow[], now = Date.now()): string {
  const vig = rows.filter((r) => r.state === 'vigente');
  const nuevas = rows.filter((r) => now - r.created < DAY);
  const pronto = vig.filter((r) => r.daysLeft <= 3);
  const tarjeta = rows.filter((r) => r.state === 'tarjeta');
  const pagando = rows.filter((r) => r.state === 'pagando');
  const vencidas = rows.filter((r) => r.state === 'vencida');
  const conv = rows.length ? Math.round(((tarjeta.length + pagando.length) / rows.length) * 100) : 0;

  const L: string[] = [`📊 <b>Don Punto · pruebas gratis</b> (${fmtDay(now)})`, ''];
  L.push(`🟢 En prueba: <b>${vig.length}</b>`);
  L.push(`🆕 Nuevas (24 h): <b>${nuevas.length}</b>`);
  L.push(`⏳ Vencen en ≤3 días: <b>${pronto.length}</b>`);
  L.push(`💳 Pusieron tarjeta (aún no cobra): <b>${tarjeta.length}</b>`);
  L.push(`✅ Ya pagando: <b>${pagando.length}</b>`);
  L.push(`🔴 Vencidas sin pagar: <b>${vencidas.length}</b>`);
  L.push(`Total que han probado: ${rows.length} · conversión ${conv}%`);

  const list = (title: string, rs: TrialRow[], extra: (r: TrialRow) => string, max = 15) => {
    if (!rs.length) return;
    L.push('', `<b>${title}</b>`);
    for (const r of rs.slice(0, max)) L.push(`• ${who(r)} — ${extra(r)}`);
    if (rs.length > max) L.push(`…y ${rs.length - max} más`);
  };
  list('Nuevas', nuevas, (r) => `vence ${fmtDay(r.trialEnd)}`);
  list('Vencen pronto (háblales)', pronto, (r) => (r.daysLeft <= 1 ? 'vence mañana' : `faltan ${r.daysLeft} días`));
  list('Pusieron tarjeta', tarjeta, (r) => r.stripeNote || 'en Stripe');
  return L.join('\n');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret || req.headers?.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    const rows = await trialRows();
    const text = buildReport(rows);
    if (b.dry) return res.status(200).json({ dry: true, rows: rows.length, text });
    const sent = await notifyTeam(text);
    return res.status(200).json({ rows: rows.length, sent });
  } catch (e) {
    return sendError(res, e);
  }
}
