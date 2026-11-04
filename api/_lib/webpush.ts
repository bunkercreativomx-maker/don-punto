// Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID) con Web Crypto: corre igual en Node y en Cloudflare.
const enc = new TextEncoder();
const b64uEnc = (buf: ArrayBuffer | Uint8Array) => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDec = (str: string) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const cat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data));
}

export interface Vapid { subject: string; publicKey: string; privateKey: string }
export class PushError extends Error {
  statusCode: number; body: string;
  constructor(statusCode: number, body: string) { super('push ' + statusCode); this.statusCode = statusCode; this.body = body; }
}

let keyCache: { pub: string; key: CryptoKey } | null = null;
async function signingKey(v: Vapid) {
  if (keyCache?.pub === v.publicKey) return keyCache.key;
  const pub = b64uDec(v.publicKey); // 0x04 | x(32) | y(32)
  const jwk = { kty: 'EC', crv: 'P-256', x: b64uEnc(pub.slice(1, 33)), y: b64uEnc(pub.slice(33, 65)), d: v.privateKey, ext: true };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  keyCache = { pub: v.publicKey, key };
  return key;
}

async function vapidJwt(v: Vapid, endpoint: string) {
  const head = b64uEnc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEnc(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(v), enc.encode(head + '.' + body));
  return head + '.' + body + '.' + b64uEnc(sig);
}

async function encrypt(p256dh: string, authSecret: string, payload: string) {
  const uaPub = b64uDec(p256dh);
  const auth = b64uDec(authSecret);
  const eph = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPub = new Uint8Array((await crypto.subtle.exportKey('raw', eph.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as any, eph.privateKey, 256));
  const prkKey = await hmac(auth, shared);
  const ikm = await hmac(prkKey, cat(enc.encode('WebPush: info\0'), uaPub, asPub, new Uint8Array([1])));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(payload), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([asPub.length]), asPub, ct);
}

/** Igual que webpush.sendNotification: lanza PushError con statusCode si el servicio responde >= 400 */
export async function sendNotification(
  v: Vapid,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  opts: { TTL?: number; urgency?: string } = {},
) {
  const body = await encrypt(sub.keys.p256dh, sub.keys.auth, payload);
  const jwt = await vapidJwt(v, sub.endpoint);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.TTL ?? 86400),
      Urgency: opts.urgency || 'normal',
      Authorization: `vapid t=${jwt}, k=${v.publicKey}`,
    },
    body,
  });
  if (res.status >= 400) throw new PushError(res.status, (await res.text().catch(() => '')).slice(0, 300));
  return res.status;
}
