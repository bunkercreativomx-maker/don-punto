// Prueba local de protección de /api/combos y /api/scan-menu
// Uso: npx tsx scripts/test-api-auth.mts <email> <password>
const [email, password] = process.argv.slice(2);
const PB = 'https://donpunto-pb.bunkeragent.cloud';
const r = await fetch(PB + '/api/collections/users/auth-with-password', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/130' },
  body: JSON.stringify({ identity: email, password }),
});
const { token } = await r.json();

const combos = (await import('../api/combos.ts')).default;
const scan = (await import('../api/scan-menu.ts')).default;

async function call(h: any, auth: string, body: any) {
  let code = 0, out: any;
  const res: any = { status(c: number) { code = c; return res; }, json(b: any) { out = b; return res; } };
  await h({ method: 'POST', headers: { authorization: auth }, body }, res);
  return `${code} ${JSON.stringify(out)}`;
}
delete process.env.GEMINI_API_KEY;
console.log('combos sin token     ->', await call(combos, '', { products: [] }));
console.log('combos token basura  ->', await call(combos, 'abc', { products: [] }));
console.log('combos token válido  ->', await call(combos, token, { products: [] }));
console.log('scan   token válido  ->', await call(scan, token, {}));
