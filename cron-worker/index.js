// Cron diario de Don Punto (Pages no tiene cron): llama /api/cron-daily con CRON_SECRET.
export default {
  async scheduled(_ev, env, ctx) {
    ctx.waitUntil(fetch(env.TARGET + '/api/cron-daily', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}`, 'user-agent': 'Mozilla/5.0 (DonPunto-Cron)' },
    }).then(async (r) => console.log('cron-daily', r.status, (await r.text()).slice(0, 200))));
  },
};
