/**
 * Impresora térmica Bluetooth directa (ESC/POS), dos vías:
 *  1) Bluetooth clásico (SPP) vía Web Serial — la mayoría de las térmicas de 58/80 mm.
 *     Chrome Android 138+ y Chrome/Edge de computadora 117+. La impresora debe estar
 *     emparejada en los ajustes de Bluetooth del equipo (igual que en Loyverse).
 *  2) Bluetooth LE vía Web Bluetooth (respaldo, impresoras BLE sin emparejar).
 * iPhone/Safari no soporta ninguna de las dos.
 * La impresora elegida se guarda por EQUIPO (localStorage), no en la cuenta.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type BTDevice = any;
type BTChar = any;
type SPort = any;
type Via = 'serial' | 'ble';

// Perfil de puerto serie (SPP) estándar + servicios RFCOMM que usan algunas marcas
const SPP = '00001101-0000-1000-8000-00805f9b34fb';
const RFCOMM_IDS = [SPP, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455'];

// Servicios BLE más comunes en impresoras térmicas genéricas (58/80 mm)
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae3a-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ff12-0000-1000-8000-00805f9b34fb',
  '0000ffb0-0000-1000-8000-00805f9b34fb',
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000fef0-0000-1000-8000-00805f9b34fb',
];

const LS_ON = 'dp:btPrinter:on';
const LS_ID = 'dp:btPrinter:id';
const LS_NAME = 'dp:btPrinter:name';
const LS_VIA = 'dp:btPrinter:via';

export type BTStatus = 'off' | 'disconnected' | 'connecting' | 'connected' | 'printing';

let device: BTDevice | null = null;
let charac: BTChar | null = null;
let port: SPort | null = null;
let status: BTStatus = localStorage.getItem(LS_ON) === '1' ? 'disconnected' : 'off';
let lastError = '';
const listeners = new Set<() => void>();

function emit(s?: BTStatus) {
  if (s) status = s;
  listeners.forEach((l) => l());
}

const via = (): Via => (localStorage.getItem(LS_VIA) === 'ble' ? 'ble' : 'serial');
export function serialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).serial;
}
export function bleSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}
export function btSupported(): boolean {
  return serialSupported() || bleSupported();
}
export function btEnabled(): boolean {
  return localStorage.getItem(LS_ON) === '1';
}
export function btState() {
  return {
    status, name: localStorage.getItem(LS_NAME) || '', error: lastError, supported: btSupported(),
    serial: serialSupported(), ble: bleSupported(), via: btEnabled() ? via() : null,
  };
}
export function btSubscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function save(v: Via, id: string, name: string) {
  localStorage.setItem(LS_ON, '1');
  localStorage.setItem(LS_VIA, v);
  localStorage.setItem(LS_ID, id);
  localStorage.setItem(LS_NAME, name);
  lastError = '';
  emit('connected');
}

/* ---------- Bluetooth clásico (Web Serial / RFCOMM) ---------- */

function portName(p: SPort): string {
  const info = p?.getInfo?.() || {};
  if (info.bluetoothServiceClassId) return 'Impresora Bluetooth';
  if (info.usbVendorId) return 'Impresora USB';
  return 'Impresora';
}

async function openPort(p: SPort) {
  if (!p.writable) {
    try { await p.open({ baudRate: 9600 }); }
    catch (e: any) { if (!/already open/i.test(e?.message || '')) throw e; }
  }
  port = p;
  p.removeEventListener?.('disconnect', onPortGone);
  p.addEventListener?.('disconnect', onPortGone);
}

function onPortGone() {
  port = null;
  if (status !== 'off') emit('disconnected');
}

function humanSerialError(e: any): string {
  const m = e?.message || String(e);
  if (e?.name === 'NetworkError' || /open|connect|failed/i.test(m)) {
    return 'No se pudo abrir la impresora. Revisa que esté prendida, con papel y cerca; apágala y préndela y vuelve a intentar.';
  }
  return m;
}

/* ---------- Bluetooth LE (Web Bluetooth) ---------- */

async function findWritable(dev: BTDevice): Promise<BTChar> {
  const server = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
  const services = await server.getPrimaryServices();
  for (const s of services) {
    let chars: BTChar[] = [];
    try { chars = await s.getCharacteristics(); } catch { continue; }
    const c = chars.find((ch) => ch.properties.write || ch.properties.writeWithoutResponse);
    if (c) return c;
  }
  throw new Error('Esta impresora no es Bluetooth LE. Emparéjala en los ajustes de Bluetooth del equipo y usa «Buscar impresoras».');
}

async function attachBle(dev: BTDevice) {
  device = dev;
  dev.removeEventListener?.('gattserverdisconnected', onDisconnect);
  dev.addEventListener?.('gattserverdisconnected', onDisconnect);
  charac = await findWritable(dev);
}

function onDisconnect() {
  charac = null;
  if (status !== 'off') emit('disconnected');
}

/* ---------- Buscar / conectar (desde un clic) ---------- */

/**
 * «Buscar impresoras»: muestra las impresoras Bluetooth emparejadas del equipo
 * (Bluetooth clásico). Si el navegador no tiene Web Serial, busca Bluetooth LE.
 */
export async function btConnect(): Promise<void> {
  if (!serialSupported()) return btConnectBle();
  emit('connecting');
  try {
    const p = await (navigator as any).serial.requestPort({ allowedBluetoothServiceClassIds: RFCOMM_IDS });
    await disconnectAll();
    await openPort(p);
    save('serial', '', portName(p));
  } catch (e: any) {
    lastError = e?.name === 'NotFoundError' ? '' : humanSerialError(e);
    emit(!btEnabled() ? 'off' : connected() ? 'connected' : 'disconnected');
    if (lastError) throw new Error(lastError);
    throw new Error('No elegiste ninguna. Si tu impresora no salió en la lista: emparéjala primero en Ajustes → Bluetooth del equipo, o toca «Buscar Bluetooth LE».');
  }
}

/** Respaldo: impresoras Bluetooth LE (no necesitan emparejarse). */
export async function btConnectBle(): Promise<void> {
  if (!bleSupported()) throw new Error('Este navegador no tiene Bluetooth. Usa Chrome en Android o en computadora.');
  emit('connecting');
  try {
    const dev = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    await disconnectAll();
    await attachBle(dev);
    save('ble', dev.id || '', dev.name || 'Impresora Bluetooth');
  } catch (e: any) {
    lastError = e?.name === 'NotFoundError' ? '' : (e?.message || String(e));
    emit(!btEnabled() ? 'off' : connected() ? 'connected' : 'disconnected');
    if (lastError) throw new Error(lastError);
  }
}

async function disconnectAll() {
  try { device?.gatt?.disconnect(); } catch { /* nada */ }
  device = null; charac = null;
  if (port) { try { await port.close(); } catch { /* nada */ } }
  port = null;
}

/** Reconecta sin clic a la impresora ya autorizada (si el navegador lo permite). */
async function reconnect(): Promise<boolean> {
  if (via() === 'serial') {
    if (port?.writable) return true;
    try {
      const ser = (navigator as any).serial;
      if (!ser?.getPorts) return false;
      const list: SPort[] = await ser.getPorts();
      const p = port || list.find((x) => x.getInfo?.().bluetoothServiceClassId) || list[0];
      if (!p) return false;
      emit('connecting');
      await openPort(p);
      lastError = '';
      emit('connected');
      return true;
    } catch (e: any) {
      lastError = humanSerialError(e);
      port = null;
      emit('disconnected');
      return false;
    }
  }
  if (charac && device?.gatt?.connected) return true;
  try {
    if (!device) {
      const bt = (navigator as any).bluetooth;
      if (!bt?.getDevices) return false;
      const list: BTDevice[] = await bt.getDevices();
      const id = localStorage.getItem(LS_ID);
      device = list.find((d) => d.id === id) || null;
      if (!device) return false;
    }
    emit('connecting');
    await attachBle(device);
    lastError = '';
    emit('connected');
    return true;
  } catch (e: any) {
    lastError = e?.message || String(e);
    emit('disconnected');
    return false;
  }
}

export function btForget() {
  const p = port, d = device;
  void disconnectAll().then(() => { try { p?.forget?.(); } catch { /* nada */ } });
  try { d?.forget?.(); } catch { /* nada */ }
  [LS_ON, LS_ID, LS_NAME, LS_VIA].forEach((k) => localStorage.removeItem(k));
  lastError = '';
  emit('off');
}

/** Al abrir la app, intenta reconectar en silencio. */
export function btAutoReconnect() {
  if (btEnabled() && btSupported()) void reconnect();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(bytes: Uint8Array) {
  if (!(await reconnect())) {
    throw new Error(lastError || 'La impresora no está conectada. Ve a Ajustes → Impresora Bluetooth → Buscar impresoras.');
  }
  if (via() === 'serial') {
    const w = port.writable.getWriter();
    try {
      for (let i = 0; i < bytes.length; i += 512) {
        await w.write(bytes.slice(i, i + 512));
        await sleep(15); // las térmicas baratas tienen búfer chico
      }
    } finally { w.releaseLock(); }
    return;
  }
  if (!charac) throw new Error('La impresora Bluetooth no está conectada.');
  const withResp = !!charac.properties.write;
  let size = 180;
  for (let i = 0; i < bytes.length; ) {
    const chunk = bytes.slice(i, i + size);
    try {
      if (withResp) await charac.writeValueWithResponse(chunk);
      else { await charac.writeValueWithoutResponse(chunk); await sleep(25); }
      i += size;
    } catch (e) {
      if (size > 20) { size = 20; continue; } // MTU chico: reintenta en pedazos de 20
      throw e;
    }
  }
}

const connected = () => (via() === 'serial' ? !!port?.writable : !!charac);

/* ---------------- ESC/POS ---------------- */

const ESC = 0x1b, GS = 0x1d, FS = 0x1c;

// Code page 437 (default de casi todas las térmicas)
const CP437: Record<string, number> = {
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
  'ü': 0x81, 'Ü': 0x9a, 'É': 0x90, '¿': 0xa8, '¡': 0xad, '°': 0xf8,
};

function encode(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code < 0x7f) out.push(code);
    else if (CP437[ch] !== undefined) out.push(CP437[ch]);
    else {
      const plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const c = plain.charCodeAt(0);
      out.push(plain && c >= 0x20 && c < 0x7f ? c : 0x3f);
    }
  }
  return out;
}

class Builder {
  b: number[] = [ESC, 0x40, FS, 0x2e, ESC, 0x74, 0x00];
  width: number;
  constructor(width: number) { this.width = width; }
  align(n: 0 | 1 | 2) { this.b.push(ESC, 0x61, n); }
  bold(on: boolean) { this.b.push(ESC, 0x45, on ? 1 : 0); }
  size(big: boolean) { this.b.push(GS, 0x21, big ? 0x11 : 0x00); }
  raw(t: string) { this.b.push(...encode(t), 0x0a); }
  line(t: string, opts: { center?: boolean; bold?: boolean; big?: boolean } = {}) {
    // Letra doble solo si cabe en una línea; si no, normal en negritas
    if (opts.big && clean(t).length > Math.floor(this.width / 2)) opts = { ...opts, big: false, bold: true };
    const w = opts.big ? Math.floor(this.width / 2) : this.width;
    const lines = wrap(t, w);
    if (!lines.length) return;
    this.align(opts.center ? 1 : 0);
    if (opts.bold) this.bold(true);
    if (opts.big) this.size(true);
    lines.forEach((l) => this.raw(l));
    if (opts.big) this.size(false);
    if (opts.bold) this.bold(false);
    this.align(0);
  }
  row(left: string, right: string, bold?: boolean) {
    const l = clean(left), r = clean(right);
    if (bold) this.bold(true);
    if (l.length + r.length + 1 <= this.width) this.raw(l + ' '.repeat(this.width - l.length - r.length) + r);
    else {
      wrap(l, this.width).forEach((x) => this.raw(x));
      this.raw(r.padStart(this.width));
    }
    if (bold) this.bold(false);
  }
  sep(ch = '-') { this.raw(ch.repeat(this.width)); }
  blank() { this.b.push(0x0a); }
  cut() { this.b.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00); }
  bytes() { return new Uint8Array(this.b); }
}

const clean = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim();

function wrap(text: string, width: number): string[] {
  const t = clean(text);
  if (!t) return [];
  const out: string[] = [];
  let cur = '';
  for (const word of t.split(' ')) {
    let w = word;
    while (w.length > width) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, width)); w = w.slice(width); }
    if (!w) continue;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= width) cur += ' ' + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Convierte el ticket ya dibujado en <PrintArea> (POSTicket, CorteZTicket, comanda) a ESC/POS.
 * Así el ticket Bluetooth sale igual que el de la ventana de impresión, sin duplicar plantillas.
 */
function domToEscPos(root: HTMLElement, width: number): Uint8Array {
  const p = new Builder(width);
  const has = (el: Element, c: string) => el.classList.contains(c);
  const isBold = (el: Element) => has(el, 'font-bold') || /^H[1-6]$/.test(el.tagName);

  const walk = (el: HTMLElement, center: boolean) => {
    if (has(el, 'flex-row-print')) {
      const kids = Array.from(el.children);
      p.row(kids[0]?.textContent || '', kids.length > 1 ? kids[kids.length - 1].textContent || '' : '', isBold(el));
      return;
    }
    if (has(el, 'grid')) {
      const bold = Array.from(el.children).some(isBold);
      p.line(Array.from(el.children).map((k) => k.textContent || '').join(' '), { bold });
      return;
    }
    const text = clean(el.textContent);
    if (el.children.length === 0) {
      if (!text) {
        // Separador vacío entre ticket de cliente y comanda → corte
        if (has(el, 'print-page-break') || has(el, 'border-dashed') || has(el, 'border-b')) p.cut();
        else if (/\bmb-|\bh-/.test(el.className)) p.blank();
        return;
      }
      const big = el.tagName === 'H2';
      p.line(text, { center: center || has(el, 'text-center'), bold: isBold(el), big });
      return;
    }
    const c = center || has(el, 'text-center');
    const topLine = has(el, 'border-t') && has(el, 'border-black');
    const bottomLine = has(el, 'border-b') && has(el, 'border-black');
    if (topLine) p.sep();
    Array.from(el.children).forEach((k) => walk(k as HTMLElement, c));
    if (bottomLine) p.sep();
  };

  Array.from(root.children).forEach((k) => walk(k as HTMLElement, false));
  p.blank();
  p.cut();
  return p.bytes();
}

function widthFor(root: HTMLElement) {
  return root.classList.contains('paper-80mm') ? 48 : 32;
}

/** Imprime lo que haya en `.print-root-<kind>`. */
export async function btPrintArea(kind: string): Promise<void> {
  const roots = document.querySelectorAll<HTMLElement>(`body > .print-root-${kind}`);
  const root = roots[roots.length - 1];
  if (!root || !clean(root.textContent)) throw new Error('No hay nada que imprimir.');
  const bytes = domToEscPos(root, widthFor(root));
  emit('printing');
  try { await send(bytes); } finally { emit(connected() ? 'connected' : 'disconnected'); }
}

export async function btTestPrint(paper80: boolean): Promise<void> {
  const p = new Builder(paper80 ? 48 : 32);
  p.line('DON PUNTO', { center: true, bold: true, big: true });
  p.line('Prueba de impresora', { center: true });
  p.sep();
  p.row('Impresora:', localStorage.getItem(LS_NAME) || '-');
  p.row('Fecha:', new Date().toLocaleString('es-MX'));
  p.row('Acentos:', 'áéíóú ñ Ñ ¿¡');
  p.sep();
  p.line('¡Lista para imprimir tickets!', { center: true, bold: true });
  p.blank();
  p.cut();
  emit('printing');
  try { await send(p.bytes()); } finally { emit(connected() ? 'connected' : 'disconnected'); }
}
