import { adminToken, pbFetch, sendError } from './_lib/server.js';
import { FOUNDER_LIMIT, FOUNDER_PRICES } from './_lib/membership.js';

// GET público: cuántos lugares de precio de fundador quedan (contador real del landing)
export async function foundersTaken(token?: string): Promise<number> {
  const t = token || (await adminToken());
  const r = await pbFetch(`/api/collections/subscriptions/records?perPage=1&fields=id&filter=${encodeURIComponent('founder = true')}`, { token: t });
  if (!r.ok) throw new Error('founders count ' + r.status);
  return Number(r.data?.totalItems) || 0;
}

let cache: { at: number; taken: number } | null = null;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    if (!cache || Date.now() - cache.at > 60_000) cache = { at: Date.now(), taken: await foundersTaken() };
    const left = Math.max(0, FOUNDER_LIMIT - cache.taken);
    res.setHeader?.('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ limit: FOUNDER_LIMIT, taken: cache.taken, left, prices: { basico: FOUNDER_PRICES.basico / 100, pro: FOUNDER_PRICES.pro / 100 } });
  } catch (e) {
    return sendError(res, e);
  }
}
