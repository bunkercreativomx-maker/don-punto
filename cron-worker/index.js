// Crons de Don Punto (Pages no tiene cron):
//  0 4 * * *  -> /api/cron-daily (cierre del día + avisos de prueba)
//  0 17 * * * -> /api/nurture (serie de reactivación por correo, ~10 am Juárez)
export default {
  async scheduled(ev, env, ctx) {
    const path = ev.cron === '0 17 * * *' ? '/api/nurture' : '/api/cron-daily';
    ctx.waitUntil(fetch(env.TARGET + path, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}`, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0 (DonPunto-Cron)' },
      body: '{}',
    }).then(async (r) => console.log(path, r.status, (await r.text()).slice(0, 300))));
  },
};
