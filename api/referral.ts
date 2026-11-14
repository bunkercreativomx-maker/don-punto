import { getMember, adminToken, pbFetch, sendError, HttpError, rateLimit, stripe, stripeConfigured, readJsonBody } from './_lib/server.js';
import { pbDate } from './_lib/membership.js';

// Programa de socios (afiliados) — colecciones `affiliates` y `referrals` (solo superusuario).
//  GET  ?code=XXX            → ¿el código existe? (para el formulario de registro)
//  POST {code, source}       → liga la cuenta recién creada al socio (con sesión del usuario)
//  GET  ?r=<report_token>&m=YYYY-MM → reporte mensual en HTML (lo ve el socio y Pako)
//
// Reglas (contrato):
//  - Solo cuentan cuentas creadas DESPUÉS de la fecha de firma (start_date): los clientes que ya eran de Don Punto nunca le cuentan.
//  - El código se liga al registrarse (máx. 7 días después de crear la cuenta) y una sola vez por cuenta; no se cambia.
//  - Comisión sobre lo que de verdad se cobró en el mes; nivel según restaurantes que pagaron ese mes (aplica a todos).

export const TIERS = [
  { min: 151, rate: 0.2 },
  { min: 51, rate: 0.15 },
  { min: 1, rate: 0.1 },
];
export const rateFor = (paying: number) => (TIERS.find((t) => paying >= t.min)?.rate ?? 0);

const INTERNAL = new Set(['pakovipteam@gmail.com', 'tgudino@me.com', 'demo@donpunto.com', 'webinar@donpunto.com', 'lasalitasdesiempre@gmail.com', 'kabuki@donpunto.com']);
const LINK_WINDOW_MS = 7 * 86400 * 1000;
const q = (s: string) => encodeURIComponent(s);
const cleanCode = (s: unknown) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);

async function findAffiliate(token: string, filter: string) {
  const r = await pbFetch(`/api/collections/affiliates/records?perPage=1&filter=${q(filter)}`, { token });
  return r.data?.items?.[0] || null;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET' && req.query?.r) return await report(req, res);
    if (req.method === 'GET') {
      rateLimit('refcode:' + (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || 'x'), 30, 10 * 60 * 1000);
      const code = cleanCode(req.query?.code);
      if (!code) return res.status(200).json({ valid: false });
      const a = await findAffiliate(await adminToken(), `code = "${code}" && active = true`);
      return res.status(200).json(a ? { valid: true, code, name: a.name } : { valid: false });
    }
    if (req.method === 'POST') return await attach(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return sendError(res, e);
  }
}

async function attach(req: any, res: any) {
  const m = await getMember(req);
  const body = await readJsonBody(req);
  const code = cleanCode(body.code);
  if (!code) throw new HttpError(400, 'Falta el código.');
  rateLimit('refattach:' + m.user.id, 5, 10 * 60 * 1000);
  const token = await adminToken();

  const a = await findAffiliate(token, `code = "${code}" && active = true`);
  if (!a) throw new HttpError(404, 'Ese código no existe.', 'invalid_code');

  const prev = await pbFetch(`/api/collections/referrals/records?perPage=1&filter=${q(`owner = "${m.user.id}"`)}`, { token });
  if (prev.data?.items?.length) return res.status(200).json({ linked: false, reason: 'already' });

  const u = await pbFetch(`/api/collections/users/records/${m.user.id}`, { token });
  const created = pbDate(u.data?.created);
  if (INTERNAL.has(String(m.user.email).toLowerCase())) return res.status(200).json({ linked: false, reason: 'internal' });
  if (!created || Date.now() - created > LINK_WINDOW_MS) return res.status(200).json({ linked: false, reason: 'old_account' });
  if (created < pbDate(a.start_date)) return res.status(200).json({ linked: false, reason: 'before_start' });
  // Si ya tuvo membresía pagada con Stripe, no es cliente nuevo
  const s = m.subscription;
  if (s?.stripe_subscription_id) return res.status(200).json({ linked: false, reason: 'existing_customer' });

  const r = await pbFetch('/api/collections/referrals/records', {
    method: 'POST', token,
    body: { owner: m.user.id, affiliate: a.id, code, source: body.source === 'link' ? 'link' : 'manual' },
  });
  if (!r.ok) return res.status(200).json({ linked: false, reason: 'already' });
  return res.status(200).json({ linked: true, name: a.name });
}

// ---------------------------------------------------------------- reporte

const mxn = (c: number) => '$' + (c / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const OFFSET_H = 7; // Cd. Juárez (MST)

function monthRange(m: string) {
  const mm = /^(\d{4})-(\d{2})$/.exec(m || '');
  const now = new Date(Date.now() - OFFSET_H * 3600e3);
  const y = mm ? Number(mm[1]) : now.getUTCFullYear();
  const mo = mm ? Number(mm[2]) - 1 : now.getUTCMonth();
  const start = Date.UTC(y, mo, 1, OFFSET_H);
  const end = Date.UTC(y, mo + 1, 1, OFFSET_H);
  return { y, mo, start, end, key: `${y}-${String(mo + 1).padStart(2, '0')}` };
}

export async function computeReport(token: string, aff: any, monthKey: string) {
  const { y, mo, start, end, key } = monthRange(monthKey);
  const refs: any[] = [];
  for (let page = 1; page < 50; page++) {
    const r = await pbFetch(`/api/collections/referrals/records?perPage=200&page=${page}&sort=created&filter=${q(`affiliate = "${aff.id}"`)}&expand=owner`, { token });
    refs.push(...(r.data?.items || []));
    if (!r.data || page >= r.data.totalPages) break;
  }
  const rows: any[] = [];
  for (const ref of refs) {
    const owner = ref.owner;
    const [rest, sub] = await Promise.all([
      pbFetch(`/api/collections/restaurants/records?perPage=1&filter=${q(`owner = "${owner}"`)}`, { token }),
      pbFetch(`/api/collections/subscriptions/records?perPage=1&filter=${q(`owner = "${owner}"`)}&expand=plan`, { token }),
    ]);
    const s = sub.data?.items?.[0];
    let paid = 0, refunded = 0;
    if (s?.stripe_customer_id && stripeConfigured()) {
      const inv = await stripe('GET', '/invoices', { customer: s.stripe_customer_id, status: 'paid', limit: 100, created: { gte: Math.floor(start / 1000), lt: Math.floor(end / 1000) } });
      for (const i of inv.data || []) paid += Number(i.amount_paid) || 0;
      const cn = await stripe('GET', '/credit_notes', { customer: s.stripe_customer_id, limit: 100, created: { gte: Math.floor(start / 1000), lt: Math.floor(end / 1000) } });
      for (const c of cn.data || []) if (c.status !== 'void') refunded += Number(c.total) || 0;
    }
    const net = Math.max(0, paid - refunded);
    let estado = 'Sin membresía';
    if (s?.status === 'trialing') estado = pbDate(s.trial_end) > Date.now() ? 'En prueba' : 'Prueba vencida';
    else if (s?.status === 'active') estado = net > 0 ? 'Pagando' : 'Activo';
    else if (s?.status === 'past_due') estado = 'Pago pendiente';
    else if (s?.status === 'canceled') estado = 'Canceló';
    rows.push({
      restaurant: rest.data?.items?.[0]?.name || '—',
      email: ref.expand?.owner?.email || '',
      since: ref.created,
      plan: s?.expand?.plan?.name || '',
      estado,
      paid: net,
      paying: net > 0,
    });
  }
  const paying = rows.filter((r) => r.paying).length;
  const rate = rateFor(Math.max(1, paying)); // sin pagos aún = nivel 1 (10%)
  const total = rows.reduce((a, r) => a + r.paid, 0);
  const commission = Math.round(total * rate);
  for (const r of rows) r.commission = r.paying ? Math.round(r.paid * rate) : 0;
  return { month: key, label: `${MONTHS[mo]} ${y}`, rows, paying, rate, total, commission, registered: rows.length };
}

async function report(req: any, res: any) {
  rateLimit('refreport:' + (req.headers['cf-connecting-ip'] || 'x'), 30, 10 * 60 * 1000);
  const tok = String(req.query.r || '').replace(/[^A-Za-z0-9]/g, '');
  if (tok.length < 20) throw new HttpError(404, 'No encontrado');
  const token = await adminToken();
  const aff = await findAffiliate(token, `report_token = "${tok}"`);
  if (!aff) throw new HttpError(404, 'No encontrado');
  const rep = await computeReport(token, aff, String(req.query.m || ''));
  if (req.query.format === 'json') return res.status(200).json({ affiliate: { name: aff.name, code: aff.code }, ...rep });

  const { y, mo } = monthRange(rep.month);
  const prev = new Date(Date.UTC(y, mo - 1, 1)), next = new Date(Date.UTC(y, mo + 1, 1));
  const mk = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const cur = monthRange('');
  const link = (k: string) => `/api/referral?r=${tok}&m=${k}`;
  const fmtDate = (s: string) => new Date(pbDate(s)).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Ciudad_Juarez' });
  const tierRows = [['1 – 50', '10%'], ['51 – 150', '15%'], ['151 o más', '20%']]
    .map(([n, p]) => `<tr${Math.round(rep.rate * 100) + '%' === p ? ' class="on"' : ''}><td>${n}</td><td>${p}</td></tr>`).join('');
  const body = rep.rows.length
    ? rep.rows.map((r: any) => `<tr><td class="r"><b>${esc(r.restaurant)}</b><small>${esc(r.email)}</small></td><td data-l="Registro">${fmtDate(r.since)}</td><td data-l="Plan">${esc(r.plan || '—')}</td><td data-l="Estado"><span class="st ${r.paying ? 'ok' : ''}">${esc(r.estado)}</span></td><td class="n" data-l="Cobrado">${mxn(r.paid)}</td><td class="n" data-l="Comisión">${mxn(r.commission)}</td></tr>`).join('')
    : `<tr><td colspan="6" class="empty">Todavía no hay restaurantes registrados con el código <b>${esc(aff.code)}</b>.</td></tr>`;

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.status(200).send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Reporte de socio · Don Punto</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#F4F6F3;color:#0D100E}
main{max-width:980px;margin:0 auto;padding:24px 16px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
header img{height:40px}h1{font-size:22px;margin:18px 0 4px}p.sub{margin:0;color:#5b6660}
.nav{display:flex;gap:8px;align-items:center;margin:18px 0}.nav a{padding:8px 12px;border-radius:10px;background:#fff;border:1px solid #dfe5e0;color:#0D100E;text-decoration:none;font-weight:600;font-size:14px}.nav b{font-size:16px;text-transform:capitalize;min-width:150px;text-align:center}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card{background:#fff;border:1px solid #dfe5e0;border-radius:16px;padding:16px}.card span{display:block;font-size:12px;color:#5b6660;text-transform:uppercase;font-weight:700;letter-spacing:.03em}.card b{font-size:26px;display:block;margin-top:6px}.card.hi{background:#0f5132;color:#fff;border-color:#0f5132}.card.hi span{color:#cfe9d9}
.wrap{background:#fff;border:1px solid #dfe5e0;border-radius:16px;margin-top:16px;overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:12px 14px;text-align:left;border-bottom:1px solid #eef1ee;white-space:nowrap}th{font-size:11px;text-transform:uppercase;color:#5b6660;letter-spacing:.04em}td small{display:block;color:#7a857f;font-size:12px}td.n,th.n{text-align:right}td.empty{text-align:center;color:#5b6660;padding:28px;white-space:normal}
.st{padding:3px 9px;border-radius:999px;background:#eef1ee;font-size:12px;font-weight:600}.st.ok{background:#d9f2e3;color:#0f5132}
.grid2{display:grid;grid-template-columns:1fr 1.4fr;gap:12px;margin-top:16px}@media(max-width:700px){.grid2{grid-template-columns:1fr}}
.tiers tr.on td{background:#d9f2e3;font-weight:700}.box{background:#fff;border:1px solid #dfe5e0;border-radius:16px;padding:16px;font-size:13px;color:#3b4540;line-height:1.55}.box h3{margin:0 0 8px;font-size:14px;color:#0D100E}.box ul{margin:0;padding-left:18px}
@media(max-width:640px){table.list thead{display:none}table.list tr{display:block;padding:12px 14px;border-bottom:1px solid #eef1ee}table.list td{display:flex;justify-content:space-between;gap:12px;border:0;padding:4px 0;white-space:normal}table.list td.r{display:block;padding-bottom:8px}table.list td[data-l]::before{content:attr(data-l);color:#5b6660;font-size:12px;font-weight:600}table.list td.empty{display:block}}
.code{font-family:ui-monospace,monospace;background:#0D100E;color:#83F404;padding:3px 8px;border-radius:8px;font-weight:700}
</style></head><body><main>
<header><img src="/brand/logo-3d-compact.webp" alt="Don Punto" onerror="this.style.display='none'"><span>Código: <span class="code">${esc(aff.code)}</span></span></header>
<h1>Reporte de socio · ${esc(aff.name)}</h1><p class="sub">Link para invitar: <b>donpunto.com/?ref=${esc(aff.code)}</b></p>
<div class="nav"><a href="${link(mk(prev))}">← Anterior</a><b>${esc(rep.label)}</b>${rep.month < cur.key ? `<a href="${link(mk(next))}">Siguiente →</a>` : ''}</div>
<div class="cards">
<div class="card"><span>Registrados con su código</span><b>${rep.registered}</b></div>
<div class="card"><span>Pagaron este mes</span><b>${rep.paying}</b></div>
<div class="card"><span>Cobrado en el mes</span><b>${mxn(rep.total)}</b></div>
<div class="card"><span>Nivel</span><b>${Math.round(rep.rate * 100)}%</b></div>
<div class="card hi"><span>Comisión del mes</span><b>${mxn(rep.commission)}</b></div>
</div>
<div class="wrap"><table class="list"><thead><tr><th>Restaurante</th><th>Registro</th><th>Plan</th><th>Estado</th><th class="n">Cobrado</th><th class="n">Comisión</th></tr></thead><tbody>${body}</tbody></table></div>
<div class="grid2"><div class="wrap" style="margin:0"><table class="tiers"><thead><tr><th>Pagan en el mes</th><th>Comisión</th></tr></thead><tbody>${tierRows}</tbody></table></div>
<div class="box"><h3>Cómo se calcula</h3><ul>
<li>Solo cuentan restaurantes que se registraron con el código desde el ${fmtDate(aff.start_date)}. Los clientes que ya eran de Don Punto no cuentan.</li>
<li>La comisión es sobre lo que de verdad se cobró en el mes (menos reembolsos). La prueba de 15 días no genera comisión.</li>
<li>El porcentaje lo da el número de restaurantes que pagaron en el mes y aplica a todos.</li>
${rep.month === cur.key ? '<li><b>Mes en curso:</b> las cifras pueden cambiar hasta que cierre el mes.</li>' : ''}
</ul></div></div>
</main></body></html>`);
}
