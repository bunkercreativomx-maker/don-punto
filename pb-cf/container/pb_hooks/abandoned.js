// Don Punto: correos a cuentas que se registraron y no terminaron el pago (Stripe).
// 5 pasos: 1 h, día 1, día 3, día 7, día 14. Se detiene si ya tiene Stripe o membresía activa.
// Solo envía si app_kv "abandoned_mail_enabled" = {on:true} (interruptor; apagado por defecto).
// Registro de envíos en app_kv key "abandoned_mail:<uid>" = {sent:{"1":unix,...}}.
const HOUR = 3600;
const DAY = 24 * HOUR;
const STEPS = [
  { n: 1, min: 1 * HOUR, max: 1 * DAY },
  { n: 2, min: 1 * DAY, max: 3 * DAY },
  { n: 3, min: 3 * DAY, max: 7 * DAY },
  { n: 4, min: 7 * DAY, max: 14 * DAY },
  { n: 5, min: 14 * DAY, max: 45 * DAY },
];
const SKIP = ['pakovipteam@gmail.com', 'tgudino@me.com'];
const REPLY_TO = 'soporte@donpunto.com';
const URL = 'https://donpunto.com/';
const LOGO = 'https://donpunto.com/brand/logo-1600.png';

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function layout(title, paras, cta) {
  const p = paras.map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#3E453D">${t}</p>`).join('');
  return `<!doctype html><html><body style="margin:0;background:#F3F4F0;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:16px;padding:32px 28px">
<tr><td style="padding-bottom:20px"><img src="${LOGO}" width="200" alt="DonPunto.com" style="display:block;width:200px;height:auto"></td></tr>
<tr><td><h1 style="margin:0 0 18px;font-size:24px;line-height:1.25;color:#001B35">${title}</h1>${p}
${cta ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:#001B35;border-radius:10px"><a href="${URL}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none">${cta}</a></td></tr></table>` : ''}
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;color:#3E453D">— El equipo de Don Punto</p></td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#7A8079">Recibes este correo porque creaste una cuenta en donpunto.com. Si ya no quieres recibirlos, contesta con la palabra BAJA.</p>
</td></tr></table></body></html>`;
}

function plain(paras) {
  return `<!doctype html><html><body style="margin:0;padding:20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">${paras.map((t) => `<p style="margin:0 0 14px">${t}</p>`).join('')}
<p style="margin:24px 0 0;font-size:12px;color:#888">Si ya no quieres recibir estos correos, contesta con la palabra BAJA.</p></body></html>`;
}

function content(step, rest) {
  const name = rest ? esc(rest) : 'tu negocio';
  if (step === 1) return {
    subject: 'Tu punto de venta está casi listo',
    html: layout('Te falta un solo paso', [
      `Ya creaste tu cuenta de Don Punto para <b>${name}</b>. Solo falta elegir tu plan para empezar a cobrar.`,
      'Pruébalo 15 días gratis: no se cobra nada hasta el día 16 y cancelas cuando quieras desde tu cuenta, sin contratos.',
    ], 'Terminar mi registro'),
  };
  if (step === 2) return {
    subject: '¿Te atoraste en algo?',
    html: layout('¿Te atoraste en algo?', [
      `Vimos que tu cuenta para <b>${name}</b> quedó a medio camino. Si algo te frenó, aquí te lo resolvemos:`,
      '• No necesitas comprar equipo: funciona en la compu, tablet o celular que ya tienes.<br>• Te cargamos tu menú desde una foto, en segundos.<br>• Corte de caja con IVA separado y tu venta del día en el celular.',
      'Contesta este correo con tu duda o escríbenos en el chat de donpunto.com. Te responde una persona.',
    ], 'Elegir mi plan'),
  };
  if (step === 3) return {
    subject: 'Lo que te ahorra cuadrar tu caja',
    html: layout('Lo que te ahorra cuadrar tu caja', [
      'Caja que no cuadra, ventas que no conoces si no estás, descuentos sin autorizar. Eso es dinero que se escapa todos los días sin que lo veas.',
      `Con Don Punto, <b>${name}</b> cierra cada turno con el corte desglosado por forma de pago y el IVA separado, y tú recibes en el celular cuánto vendiste hoy, aunque no estés.`,
      'Empieza tus 15 días gratis y compruébalo desde el primer turno.',
    ], 'Empezar mis 15 días'),
  };
  if (step === 4) return {
    subject: '¿Qué te faltó?',
    html: plain([
      'Hola,',
      `Soy Pako, el que hizo Don Punto. Vi que creaste tu cuenta para ${name} y no la terminaste de activar.`,
      'Lo hice para restaurantes y negocios como el tuyo, así que me sirve mucho saber qué te faltó para animarte: ¿el precio, alguna función, o no te quedó claro cómo empezar?',
      'Contéstame este correo, aunque sea con una línea. Lo leo yo.',
      'Pako<br>Don Punto · donpunto.com',
    ]),
  };
  return {
    subject: 'Este es el último correo',
    html: layout('Este es el último correo', [
      'No queremos llenar tu bandeja, así que este es el último correo que te mandamos sobre tu registro.',
      `Tu cuenta de <b>${name}</b> sigue guardada. Si un día quieres tomar el control de tus ventas, entras y en dos minutos empiezas tus 15 días gratis.`,
      'Y si tienes cualquier duda, contesta este correo. Con gusto te ayudamos.',
    ], 'Entrar a mi cuenta'),
  };
}

function kvVal(rec) {
  if (!rec) return {};
  try { return JSON.parse(rec.getString('value') || '{}') || {}; } catch (_) { return {}; }
}

function kv(app, key) {
  try { return app.findFirstRecordByFilter('app_kv', 'key = {:k}', { k: key }); } catch (_) { return null; }
}

function run(app, opts) {
  opts = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const out = [];
  const sw = kv(app, 'abandoned_mail_enabled');
  const enabled = !!kvVal(sw).on;
  if (!enabled && !opts.dry) return [{ disabled: true }];
  const subs = app.findRecordsByFilter('subscriptions', "status != 'active' && status != 'trialing' && stripe_customer_id = '' && stripe_subscription_id = ''", '', 500, 0);
  for (const sub of subs) {
    let user;
    try { user = app.findRecordById('users', sub.getString('owner')); } catch (_) { continue; }
    const email = user.getString('email').toLowerCase();
    if (!email || SKIP.indexOf(email) >= 0 || /@donpunto\.com$/.test(email)) continue;
    if (opts.only && opts.only !== email) continue;
    const age = now - user.getDateTime('created').unix();
    const step = STEPS.find((s) => age >= s.min && age < s.max);
    if (!step) continue;
    const key = 'abandoned_mail:' + user.id;
    const rec = kv(app, key);
    const sent = kvVal(rec).sent || {};
    if (Object.keys(sent).some((n) => Number(n) >= step.n)) continue; // ya recibió este o uno posterior
    let rest = '';
    try { rest = app.findFirstRecordByFilter('restaurants', 'owner = {:o}', { o: user.id }).getString('name'); } catch (_) {}
    if (rest === 'Mi Restaurante') rest = '';
    const c = content(step.n, rest);
    out.push({ email, step: step.n, rest });
    if (opts.dry) continue;
    const meta = app.settings().meta;
    app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName || 'Don Punto' },
      to: [{ address: email }],
      subject: c.subject,
      html: c.html,
      headers: { 'Reply-To': REPLY_TO },
    }));
    sent[String(step.n)] = now;
    const r = rec || new Record(app.findCollectionByNameOrId('app_kv'));
    r.set('key', key);
    r.set('value', { sent, email });
    app.save(r);
    console.log('[donpunto] correo pago incompleto', step.n, email);
  }
  return out;
}

// Vista previa: manda los 3 correos a un correo de prueba sin registrar nada
function preview(app, to, rest) {
  const meta = app.settings().meta;
  for (const n of [1, 2, 3, 4, 5]) {
    const c = content(n, rest);
    app.newMailClient().send(new MailerMessage({
      from: { address: meta.senderAddress, name: meta.senderName || 'Don Punto' },
      to: [{ address: to }], subject: '[Prueba ' + n + '/5] ' + c.subject, html: c.html,
      headers: { 'Reply-To': REPLY_TO },
    }));
  }
}

module.exports = { run, preview };
