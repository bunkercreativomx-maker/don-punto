// Cada 30 min: correos a quienes se registraron y no terminaron el pago (lógica en abandoned.js)
cronAdd('donpunto_abandoned_mail', '*/30 * * * *', () => {
  try { require(`${__hooks}/abandoned.js`).run($app); } catch (err) { console.error('[donpunto] abandoned mail', err); }
});

// Superusuario: POST /api/dp/abandoned {dry:true|false, only:"correo"} · {preview:"correo", rest:"Nombre"}
routerAdd('POST', '/api/dp/abandoned', (e) => {
  const b = e.requestInfo().body || {};
  const m = require(`${__hooks}/abandoned.js`);
  if (b.preview) { m.preview($app, String(b.preview), String(b.rest || 'Antojitos la Familia')); return e.json(200, { preview: b.preview }); }
  return e.json(200, { result: m.run($app, { dry: b.dry !== false, only: b.only ? String(b.only).toLowerCase() : '' }) });
}, $apis.requireSuperuserAuth());
