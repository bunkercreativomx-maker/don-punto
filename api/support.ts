import { createHash, timingSafeEqual } from 'node:crypto';
import { adminToken, pbFetch, HttpError, sendError, rateLimit, readJsonBody } from './_lib/server.js';
import { kvGet, sendToUser } from './_lib/push.js';

// Chat de soporte propio de Don Punto (sin terceros).
//  GET  ?vt=<token visitante>&after=<ms>   → mensajes del hilo
//  POST {action:'send', vt, text, name?, email?} → mensaje del cliente → Telegram de soporte
//  POST ?tg=1 (webhook de Telegram)        → Pako responde (reply) al mensaje → regresa al chat
// Config en PocketBase app_kv key "support_tg" = { token, chat_id, secret } (solo superusuario).
// Las colecciones support_threads / support_messages son solo de superusuario: el cliente nunca entra directo.

const q = (s: string) => encodeURIComponent(s);
const str = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, max);
const VT_RE = /^[a-f0-9]{32,64}$/;
// El token del visitante nunca se guarda en claro
const vtHash = (vt: string) => createHash('sha256').update('dp-support:' + vt).digest('hex');

interface TgCfg { token: string; chat_id: string | number; secret: string }
let cfgCache: { at: number; v: TgCfg | null } | null = null;
async function tgCfg(): Promise<TgCfg | null> {
  if (cfgCache && Date.now() - cfgCache.at < 5 * 60 * 1000) return cfgCache.v;
  const it = await kvGet('support_tg');
  const v = it?.value?.token && it?.value?.chat_id ? (it.value as TgCfg) : null;
  cfgCache = { at: Date.now(), v };
  return v;
}

async function tg(method: string, body: unknown) {
  const cfg = await tgCfg();
  if (!cfg) return null;
  const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await r.json().catch(() => null);
  if (!data?.ok) console.error('telegram', method, data?.description);
  return data?.result ?? null;
}

async function threadByVt(token: string, vt: string) {
  const r = await pbFetch(`/api/collections/support_threads/records?perPage=1&filter=${q(`vt = "${vtHash(vt)}"`)}`, { token });
  return r.data?.items?.[0] || null;
}

async function messages(token: string, threadId: string, after = 0) {
  const filter = `thread = "${threadId}"` + (after > 0 ? ` && at > ${Math.floor(after)}` : '');
  const r = await pbFetch(`/api/collections/support_messages/records?perPage=200&sort=at&filter=${q(filter)}`, { token });
  return (r.data?.items || []).map((m: any) => ({ id: m.id, from: m.from, text: m.text, at: m.at }));
}

/** Usuario con sesión (opcional): solo para mostrar su correo en Telegram y mandarle push */
async function optionalUser(req: any): Promise<{ id: string; email: string } | null> {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const me = await pbFetch('/api/collections/users/auth-refresh', { method: 'POST', token });
  return me.ok && me.data?.record?.id ? { id: me.data.record.id, email: me.data.record.email } : null;
}

const htmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function handleSend(req: any, res: any) {
  const body = await readJsonBody(req);
  const vt = str(body.vt, 64).toLowerCase();
  if (!VT_RE.test(vt)) throw new HttpError(400, 'Sesión de chat inválida. Recarga la página.');
  const text = str(body.text, 1500);
  if (!text) throw new HttpError(400, 'Escribe tu mensaje.');
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ip';
  rateLimit('support:' + ip, 20, 10 * 60 * 1000);
  rateLimit('support:' + vt, 12, 5 * 60 * 1000);

  const token = await adminToken();
  const user = await optionalUser(req).catch(() => null);
  const name = str(body.name, 80);
  const email = (user?.email || str(body.email, 120)).toLowerCase();
  const now = Date.now();

  let thread = await threadByVt(token, vt);
  const isNew = !thread;
  if (!thread) {
    const r = await pbFetch('/api/collections/support_threads/records', { method: 'POST', token, body: { vt: vtHash(vt), user: user?.id || '', name, email, last_at: now } });
    if (!r.ok) throw new HttpError(500, 'No se pudo abrir el chat. Intenta de nuevo.');
    thread = r.data;
  } else {
    const patch: any = { last_at: now };
    if (user && thread.user !== user.id) patch.user = user.id;
    if (name && !thread.name) patch.name = name;
    if (email && !thread.email) patch.email = email;
    await pbFetch(`/api/collections/support_threads/records/${thread.id}`, { method: 'PATCH', token, body: patch });
    Object.assign(thread, patch);
  }

  const msg = await pbFetch('/api/collections/support_messages/records', { method: 'POST', token, body: { thread: thread.id, from: 'user', text, at: now } });
  if (!msg.ok) throw new HttpError(500, 'No se pudo enviar. Intenta de nuevo.');

  // Aviso a Telegram (Pako responde con "Responder" a este mensaje)
  const who = [thread.name, thread.email].filter(Boolean).join(' · ') || 'Visitante';
  const where = str(body.page, 60);
  const head = `💬 <b>${htmlEsc(who)}</b>${thread.user ? ' (cliente con cuenta)' : ''}${isNew ? ' · <i>chat nuevo</i>' : ''}${where ? `\n📍 ${htmlEsc(where)}` : ''}`;
  const sent = await tg('sendMessage', { chat_id: (await tgCfg())?.chat_id, parse_mode: 'HTML', text: `${head}\n\n${htmlEsc(text)}\n\n<i>↩️ Responde a este mensaje para contestarle · #c${thread.id}</i>` });
  if (sent?.message_id) {
    await pbFetch(`/api/collections/support_messages/records/${msg.data.id}`, { method: 'PATCH', token, body: { tg_msg_id: sent.message_id } });
  }

  return res.status(200).json({ ok: true, at: now, delivered: !!sent });
}

async function handleTelegram(req: any, res: any) {
  const cfg = await tgCfg();
  const got = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!cfg?.secret || got.length !== cfg.secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(cfg.secret))) {
    return res.status(401).json({ ok: false });
  }
  const update = await readJsonBody(req);
  const m = update?.message;
  // Solo el chat de soporte configurado puede responder
  if (!m || String(m.chat?.id) !== String(cfg.chat_id)) return res.status(200).json({ ok: true });

  const reply = (text: string) => tg('sendMessage', { chat_id: cfg.chat_id, text, reply_to_message_id: m.message_id });
  const text = str(m.text || m.caption, 2000);
  if (!text) return res.status(200).json({ ok: true });
  if (text.startsWith('/start')) {
    await reply('✅ Listo. Aquí te llegan los mensajes del chat de donpunto.com. Para contestar, usa "Responder" sobre el mensaje del cliente.');
    return res.status(200).json({ ok: true });
  }

  const token = await adminToken();
  let threadId = '';
  const rid = m.reply_to_message?.message_id;
  if (rid) {
    const r = await pbFetch(`/api/collections/support_messages/records?perPage=1&filter=${q(`tg_msg_id = ${Number(rid)}`)}`, { token });
    threadId = r.data?.items?.[0]?.thread || '';
    if (!threadId) {
      // Respuesta a otra respuesta tuya: el hilo viene en el texto "#c<id>"
      const tag = String(m.reply_to_message?.text || '').match(/#c([a-z0-9]{15})/);
      threadId = tag?.[1] || '';
    }
  }
  if (!threadId) {
    await reply('⚠️ Para contestar a un cliente, mantén presionado su mensaje y elige "Responder".');
    return res.status(200).json({ ok: true });
  }

  const th = await pbFetch(`/api/collections/support_threads/records/${threadId}`, { token });
  if (!th.ok) { await reply('⚠️ No encontré ese chat.'); return res.status(200).json({ ok: true }); }
  const now = Date.now();
  const saved = await pbFetch('/api/collections/support_messages/records', { method: 'POST', token, body: { thread: threadId, from: 'agent', text, at: now, tg_msg_id: m.message_id } });
  await pbFetch(`/api/collections/support_threads/records/${threadId}`, { method: 'PATCH', token, body: { last_at: now } });

  let pushed = 0;
  if (th.data.user) {
    pushed = await sendToUser(th.data.user, { title: 'Soporte Don Punto', body: text.slice(0, 140), url: '/?soporte=1', tag: 'soporte', renotify: true }).catch(() => 0);
  }
  await tg('sendMessage', {
    chat_id: cfg.chat_id,
    reply_to_message_id: m.message_id,
    text: saved.ok ? `✅ Enviado${pushed ? ' · le llegó notificación' : ''} · #c${threadId}` : '⚠️ No se pudo guardar, intenta de nuevo.',
  });
  return res.status(200).json({ ok: true });
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'POST' && req.query?.tg) return await handleTelegram(req, res);
    if (req.method === 'GET') {
      const vt = str(req.query?.vt, 64).toLowerCase();
      if (!VT_RE.test(vt)) throw new HttpError(400, 'Sesión de chat inválida.');
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'ip';
      rateLimit('support-get:' + ip, 120, 5 * 60 * 1000);
      const token = await adminToken();
      const thread = await threadByVt(token, vt);
      res.setHeader('Cache-Control', 'no-store');
      if (!thread) return res.status(200).json({ messages: [] });
      return res.status(200).json({ messages: await messages(token, thread.id, Number(req.query?.after) || 0) });
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      req.body = body;
      if (body.action === 'send') return await handleSend(req, res);
    }
    throw new HttpError(405, 'Método no permitido');
  } catch (e) {
    return sendError(res, e);
  }
}
