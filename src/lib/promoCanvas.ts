// Arma la imagen final de la promoción (1080x1350, formato feed FB/IG) sobre la foto generada.
// El texto (título, precio, negocio) se dibuja aquí — no lo escribe la IA — para que nunca salga mal escrito.

export interface PromoArt {
  photo: string; // data URL o URL
  titulo: string;
  oferta: string;
  precioPromo: number | null;
  precioNormal: number;
  dia?: string;
  negocio?: string;
  telefono?: string;
}

const W = 1080, H = 1350;
const DISPLAY = '"Bricolage Grotesque Variable", "Geist Variable", system-ui, sans-serif';
const SANS = '"Geist Variable", system-ui, sans-serif';

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => ok(i);
    i.onerror = () => bad(new Error('No se pudo cargar la foto'));
    i.src = src;
  });
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Ajusta el tamaño de fuente para que el texto quepa en maxLines líneas. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (s: number) => string, start: number, min: number, maxW: number, maxLines: number) {
  let s = start;
  for (; s >= min; s -= 4) {
    ctx.font = font(s);
    const l = wrap(ctx, text, maxW);
    if (l.length <= maxLines) return { size: s, lines: l };
  }
  ctx.font = font(min);
  return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

const fmt = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;

export async function renderPromo(a: PromoArt): Promise<HTMLCanvasElement> {
  try { await Promise.all([document.fonts.load(`800 90px ${DISPLAY}`), document.fonts.load(`600 40px ${SANS}`)]); } catch { /* usa fuente del sistema */ }
  const img = await loadImg(a.photo);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;

  // foto en modo cover
  const s = Math.max(W / img.width, H / img.height);
  const iw = img.width * s, ih = img.height * s;
  ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);

  // sombras para legibilidad: arriba (título) y abajo (precio / negocio)
  let g = ctx.createLinearGradient(0, 0, 0, 620);
  g.addColorStop(0, 'rgba(10,8,6,.82)'); g.addColorStop(.6, 'rgba(10,8,6,.45)'); g.addColorStop(1, 'rgba(10,8,6,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 620);
  g = ctx.createLinearGradient(0, H - 420, 0, H);
  g.addColorStop(0, 'rgba(10,8,6,0)'); g.addColorStop(1, 'rgba(10,8,6,.85)');
  ctx.fillStyle = g; ctx.fillRect(0, H - 420, W, 420);

  const PAD = 72;
  let y = 76;
  // pastilla de día / promo
  const pill = (a.dia ? `SOLO ESTE ${a.dia}` : 'PROMOCIÓN').toUpperCase();
  ctx.font = `800 34px ${SANS}`;
  const pw = ctx.measureText(pill).width + 56;
  rr(ctx, PAD, y, pw, 64, 32); ctx.fillStyle = '#94E01F'; ctx.fill();
  ctx.fillStyle = '#0F1A02'; ctx.textBaseline = 'middle'; ctx.fillText(pill, PAD + 28, y + 34);
  y += 64 + 34;

  // título
  ctx.textBaseline = 'alphabetic';
  const t = fit(ctx, a.titulo, (z) => `800 ${z}px ${DISPLAY}`, 112, 64, W - PAD * 2, 2);
  ctx.font = `800 ${t.size}px ${DISPLAY}`;
  ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 24;
  for (const l of t.lines) { y += t.size * 0.98; ctx.fillText(l, PAD, y); }
  ctx.shadowBlur = 0;
  // oferta
  if (a.oferta) {
    const o = fit(ctx, a.oferta, (z) => `600 ${z}px ${SANS}`, 46, 34, W - PAD * 2, 2);
    ctx.font = `600 ${o.size}px ${SANS}`; ctx.fillStyle = '#E4F9B8';
    y += 20;
    for (const l of o.lines) { y += o.size * 1.18; ctx.fillText(l, PAD, y); }
  }

  // precio (círculo amarillo abajo a la derecha)
  const R = 170, cx = W - PAD - R + 20, cy = H - 150 - R + 40;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = '#94E01F'; ctx.fill(); ctx.restore();
  ctx.textAlign = 'center'; ctx.fillStyle = '#0F1A02';
  if (a.precioPromo !== null && a.precioPromo < a.precioNormal) {
    ctx.font = `700 40px ${SANS}`;
    const before = `Antes ${fmt(a.precioNormal)}`;
    ctx.fillText(before, cx, cy - 78);
    const bw = ctx.measureText(before).width;
    ctx.fillRect(cx - bw / 2, cy - 92, bw, 4);
    const ps = fit(ctx, fmt(a.precioPromo), (z) => `800 ${z}px ${DISPLAY}`, 132, 80, R * 1.7, 1);
    ctx.font = `800 ${ps.size}px ${DISPLAY}`; ctx.fillText(fmt(a.precioPromo), cx, cy + 52);
  } else {
    ctx.font = `700 40px ${SANS}`; ctx.fillText('Solo', cx, cy - 50);
    const ps = fit(ctx, fmt(a.precioNormal), (z) => `800 ${z}px ${DISPLAY}`, 132, 80, R * 1.7, 1);
    ctx.font = `800 ${ps.size}px ${DISPLAY}`; ctx.fillText(fmt(a.precioNormal), cx, cy + 62);
  }
  ctx.textAlign = 'left';

  // negocio + teléfono (abajo izquierda)
  const by = H - 70;
  if (a.negocio) {
    const n = fit(ctx, a.negocio, (z) => `800 ${z}px ${DISPLAY}`, 56, 34, cx - R - PAD - 30, 2);
    ctx.font = `800 ${n.size}px ${DISPLAY}`; ctx.fillStyle = '#fff';
    let ny = (a.telefono ? by - 54 : by) - (n.lines.length - 1) * n.size * 1.05;
    for (const l of n.lines) { ctx.fillText(l, PAD, ny); ny += n.size * 1.05; }
  }
  if (a.telefono) { ctx.font = `600 38px ${SANS}`; ctx.fillStyle = '#E4F9B8'; ctx.fillText(`Tel. ${a.telefono}`, PAD, by); }
  return c;
}
