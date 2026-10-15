// Prueba local del webhook de Stripe (firma + escritura en PocketBase) sin Stripe real.
// Uso: node --experimental-strip-types scripts/test-webhook.mts <uid> <plan> <status>
import crypto from 'node:crypto';
import fs from 'node:fs';

for (const line of fs.readFileSync('/opt/data/.donpunto-vercel-env.txt', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) process.env[line.slice(0, i)] = line.slice(i + 1);
}
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_local_test';

const { default: handler } = await import('../api/stripe-webhook.ts');

const [uid, plan = 'pro', status = 'active'] = process.argv.slice(2);
const event = {
  id: 'evt_test',
  type: status === 'canceled' ? 'customer.subscription.deleted' : 'customer.subscription.updated',
  data: {
    object: {
      id: 'sub_test_local_' + uid,
      object: 'subscription',
      customer: 'cus_test_local',
      status,
      cancel_at_period_end: false,
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
      metadata: { uid, plan },
    },
  },
};

async function call(payload: string, sig: string) {
  const req: any = (async function* () { yield Buffer.from(payload); })();
  req.method = 'POST';
  req.headers = { 'stripe-signature': sig };
  let code = 0, body: any;
  const res: any = { status(c: number) { code = c; return res; }, json(b: any) { body = b; return res; } };
  await handler(req, res);
  return { code, body };
}

const payload = JSON.stringify(event);
const t = Math.floor(Date.now() / 1000);
const good = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(`${t}.${payload}`).digest('hex');
console.log('firma falsa  ->', await call(payload, `t=${t},v1=${'0'.repeat(64)}`));
console.log('firma válida ->', await call(payload, `t=${t},v1=${good}`));
