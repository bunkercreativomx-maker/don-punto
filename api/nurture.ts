import { adminToken, pbFetch, HttpError, sendError } from './_lib/server.js';
import { kvGet, kvSet } from './_lib/push.js';
import { pbDate, FOUNDER_LIMIT } from './_lib/membership.js';
import { foundersTaken } from './founders.js';

// Serie de reactivación (6 correos, ganchos distintos) para cuentas que no pagan:
//  - invite: se registró, nunca usó la prueba y ya terminó la serie de abandono (abandoned.js, paso 5).
//  - winback: su prueba sin tarjeta terminó y no se suscribió.
// Un correo por persona por corrida (cron diario 17:00 UTC ≈ 10 am Juárez). Se corta solo si paga,
// si arranca su prueba (entra a la app) o si se marca stop en app_kv nurture:<uid>.
// Interruptor: app_kv nurture_enabled {on:true}. POST con Bearer CRON_SECRET; {dry:true} solo lista;
// {preview:"correo", seg:"invite"|"winback"} manda los 6 de prueba a ese correo.

const DAYS = [2, 4, 7, 10, 14, 21]; // días desde el ancla para los pasos 1..6
const SKIP = ['pakovipteam@gmail.com', 'tgudino@me.com'];
const URL = 'https://donpunto.com/login';
const LOGO = 'https://donpunto.com/brand/logo-1600.png';
type Seg = 'invite' | 'winback';

const esc = (s: string) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function layout(title: string, paras: string[], cta: string) {
  const p = paras.map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3E453D">${t}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F3F4F0;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px 28px">
<tr><td style="padding-bottom:20px"><img src="${LOGO}" width="200" alt="DonPunto.com" style="display:block;width:200px;height:auto"></td></tr>
<tr><td><h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#001B35">${title}</h1>${p}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:#001B35;border-radius:10px"><a href="${URL}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none">${cta}</a></td></tr></table>
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#3E453D">— Pako, de Don Punto</p></td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#7A8079">Recibes este correo porque creaste una cuenta en donpunto.com. Si ya no quieres recibirlos, contesta con la palabra BAJA.</p>
</td></tr></table></body></html>`;
}
function plain(paras: string[]) {
  return `<!doctype html><html><body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">${paras.map((t) => `<p style="margin:0 0 14px">${t}</p>`).join('')}
<p style="margin:24px 0 0;font-size:12px;color:#888">Si ya no quieres recibir estos correos, contesta con la palabra BAJA.</p></body></html>`;
}

export function content(step: number, seg: Seg, rest: string, left: number) {
  const name = rest ? `<b>${esc(rest)}</b>` : 'tu negocio';
  const plainName = rest ? esc(rest) : 'tu negocio';
  // Lo que puede hacer hoy, según si ya usó su prueba o no
  const offer = seg === 'invite'
    ? 'Tu cuenta ya está lista: entras con tu correo y usas Don Punto completo <b>15 días gratis, sin tarjeta</b>.'
    : 'Tu menú y tus ventas siguen guardados. Elige tu plan y sigues exactamente donde te quedaste.';
  const cta = seg === 'invite' ? 'Empezar mis 15 días gratis' : 'Seguir donde me quedé';
  const founder = left > 0
    ? `Si te quedas, entras con <b>precio de fundador: $299 al mes en lugar de $350, de por vida</b>. Quedan ${left} de ${FOUNDER_LIMIT} lugares.`
    : '';
  switch (step) {
    case 1: return {
      subject: '¿Cuánto dinero se te fue esta semana?',
      html: layout('¿Sabes cuánto se te fue esta semana?', [
        'Cada día que cierras sin corte de caja es dinero que no sabes a dónde se fue: una venta que no se anotó, un cambio mal dado, un descuento que nadie autorizó.',
        'Con Don Punto, antes de contar el cajón ya sabes cuánto efectivo debe haber. Efectivo, tarjeta, transferencias y apps, todo separado, con el IVA listo.',
        offer, founder,
      ].filter(Boolean), cta),
    };
    case 2: return {
      subject: `${plainName} en diciembre`,
      html: layout('Diciembre es tu mes más fuerte', [
        `Posadas, pedidos grandes y fila en la caja. Es el mes en que ${name} más vende, y también en el que más se pierde si todo va en una libreta.`,
        'Si empiezas hoy, llegas a diciembre dominando el sistema: cobras en segundos desde tu celular, tablet o compu, y el corte de caja sale solo al cerrar.',
        offer, founder,
      ].filter(Boolean), cta),
    };
    case 3: return {
      subject: '¿Te ayudo a cargar tu menú?',
      html: plain([
        'Hola,',
        `Soy Pako, de Don Punto. Muchas personas me dicen que lo que les da flojera no es el sistema, es capturar el menú.`,
        `Así que te propongo algo: contesta este correo con una foto de tu menú y te lo dejo cargado en tu cuenta de ${plainName}. Tú solo entras y empiezas a cobrar.`,
        seg === 'invite' ? 'Y recuerda que ya no pedimos tarjeta: tienes 15 días gratis para probarlo con tu negocio.' : 'Tu cuenta sigue guardada, con todo lo que ya tenías.',
        `Entra aquí cuando quieras: <a href="${URL}">donpunto.com</a>`,
        '— Pako',
      ]),
    };
    case 4: return {
      subject: left > 0 ? `Quedan ${left} lugares de precio fundador` : 'Tu punto de venta por menos de $12 al día',
      html: layout(left > 0 ? `Quedan ${left} de ${FOUNDER_LIMIT} lugares` : 'Menos de $12 al día', [
        left > 0
          ? `Los primeros ${FOUNDER_LIMIT} negocios que se suscriben pagan <b>$299 al mes en lugar de $350, de por vida</b>. Cuando se llenen los lugares, ya no regresa.`
          : 'El plan Básico cuesta $350 al mes: menos de $12 al día por cobrar rápido, cuadrar tu caja y saber cuánto ganaste.',
        'Además, a los fundadores les cargamos el menú desde una foto y les damos una videollamada de 15 minutos para dejarlos listos.',
        offer,
      ], cta),
    };
    case 5: return {
      subject: '3 cosas que cambian cuando cierras caja en 2 minutos',
      html: layout('3 cosas que cambian cuando tienes punto de venta', [
        '<b>1. Te vas a dormir temprano.</b> El corte de caja sale solo, con el IVA separado. Nada de contar billetes a las once de la noche.',
        '<b>2. Sabes quién cobró.</b> Cada persona entra con su PIN y tus reportes y ganancias solo los ves tú.',
        '<b>3. Dejas de adivinar.</b> Ves desde tu celular cuánto vendiste y qué platillo se vende más.',
        offer, founder,
      ].filter(Boolean), cta),
    };
    default: return {
      subject: '¿Lo dejamos aquí?',
      html: plain([
        'Hola,',
        `Te escribí varias veces sobre ${plainName} y no quiero llenarte el correo, así que este es el último.`,
        'Tu cuenta queda guardada. El día que quieras tener el control de tus ventas, entras con tu correo y en un par de minutos estás cobrando.',
        `Si algo no te convenció, me ayudaría mucho que me contestes con una línea diciéndome qué fue. Lo leo yo.`,
        `<a href="${URL}">donpunto.com</a>`,
        '— Pako',
      ]),
    };
  }
}

async function sendMail(to: string, subject: string, html: string) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new HttpError(503, 'RESEND_API_KEY no configurado', 'resend_missing');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Don Punto <no-reply@donpunto.com>', to: [to], reply_to: 'soporte@donpunto.com', subject, html,
      headers: { 'List-Unsubscribe': '<mailto:soporte@donpunto.com?subject=BAJA>' },
    }),
  });
  if (!r.ok) throw new Error('resend ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const secret = (process.env.CRON_SECRET || '').trim();
    if (!secret || req.headers?.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized');
    const b = typeof req.body === 'object' && req.body ? req.body : {};
    const token = await adminToken();
    const left = Math.max(0, FOUNDER_LIMIT - (await foundersTaken(token).catch(() => 0)));

    if (b.preview) {
      for (let n = 1; n <= 6; n++) {
        const c = content(n, b.seg === 'winback' ? 'winback' : 'invite', 'Antojitos la Familia', left);
        await sendMail(String(b.preview), `[Prueba ${n}/6] ${c.subject}`, c.html);
      }
      return res.status(200).json({ preview: b.preview });
    }

    const enabled = !!(await kvGet('nurture_enabled'))?.value?.on;
    const dry = b.dry === true || !enabled;
    const now = Date.now();
    const subs = await pbFetch(`/api/collections/subscriptions/records?perPage=500&filter=${encodeURIComponent("stripe_customer_id = '' && stripe_subscription_id = '' && (status = 'inactive' || status = 'trialing')")}&expand=owner`, { token });
    const out: any[] = [];
    for (const s of subs.data?.items || []) {
      const u = s.expand?.owner;
      if (!u?.email) continue;
      const email = String(u.email).toLowerCase();
      if (SKIP.includes(email) || email.endsWith('@donpunto.com')) continue;
      let seg: Seg | null = null; let anchorDefault = now;
      if (s.status === 'trialing') {
        const end = pbDate(s.trial_end);
        if (end && end < now) { seg = 'winback'; anchorDefault = end; }
      } else if (!s.trial_end) {
        const ab = await kvGet(`abandoned_mail:${u.id}`);
        if (ab?.value?.sent?.['5']) { seg = 'invite'; anchorDefault = Number(ab.value.sent['5']) * 1000; }
      }
      if (!seg) continue;
      const key = `nurture:${u.id}`;
      const st = (await kvGet(key))?.value || {};
      if (st.stop) continue;
      if (st.seg && st.seg !== seg) { st.sent = {}; st.anchor = anchorDefault; } // pasó de invitación a prueba vencida: serie nueva
      const anchor = Number(st.anchor) || anchorDefault;
      const sent = st.sent || {};
      const next = Object.keys(sent).length + 1;
      if (next > DAYS.length) continue;
      if (now - anchor < DAYS[next - 1] * 86400000) continue;
      let rest = '';
      const r = await pbFetch(`/api/collections/restaurants/records?perPage=1&filter=${encodeURIComponent(`owner = "${u.id}"`)}`, { token });
      rest = r.data?.items?.[0]?.name || '';
      if (rest === 'Mi Restaurante') rest = '';
      const c = content(next, seg, rest, left);
      out.push({ email, seg, step: next, subject: c.subject });
      if (dry) continue;
      await sendMail(email, c.subject, c.html);
      await kvSet(key, { seg, anchor, email, sent: { ...sent, [next]: Math.floor(now / 1000) } });
    }
    return res.status(200).json({ enabled, dry, sent: out });
  } catch (e) {
    return sendError(res, e);
  }
}
