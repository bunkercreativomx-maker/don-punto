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
import { isNativeApp, nativeListPrinters, nativePrint, type NativePrinter } from './nativeBridge';
type BTDevice = any;
type BTChar = any;
type SPort = any;
type Via = 'serial' | 'ble' | 'native';

// Perfil de puerto serie (SPP) estándar + servicios RFCOMM que usan algunas marcas
const SPP = '00001101-0000-1000-8000-00805f9b34fb';
const RFCOMM_IDS = [SPP, 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455'];

// Servicios BLE más comunes en impresoras térmicas genéricas (58/80 mm)
const SERVICES = [
  '0000ae00-0000-1000-8000-00805f9b34fb', // el real en la mayoría de las genéricas chinas (ae01)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip UART transparente
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '000018f0-0000-1000-8000-00805f9b34fb', // muchas lo exponen pero no imprime
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae3a-0000-1000-8000-00805f9b34fb',
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
const LS_CH = 'dp:btPrinter:ch'; // índice del canal BLE elegido (para «Probar siguiente canal»)

export type BTStatus = 'off' | 'disconnected' | 'connecting' | 'connected' | 'printing';

let device: BTDevice | null = null;
let charac: BTChar | null = null;
let chanCount = 0; // cuántos canales de escritura tiene la impresora BLE
let port: SPort | null = null;        // puerto ABIERTO (solo mientras se escribe)
let knownPort: SPort | null = null;   // puerto autorizado por el usuario (se reabre en cada ticket)
let lastSent: { bytes: number; at: number; info: any } | null = null;
let status: BTStatus = localStorage.getItem(LS_ON) === '1' ? 'disconnected' : 'off';
let lastError = '';
const LOG_MAX = 40;
const log: string[] = [];
function dlog(m: string) {
  const t = new Date().toLocaleTimeString('es-MX', { hour12: false });
  log.push(`${t} ${m}`);
  if (log.length > LOG_MAX) log.shift();
}
/** Bitácora para diagnosticar (se muestra en Ajustes → «Ver detalle técnico»). */
export function btLog(): string {
  const ua = navigator.userAgent;
  const chrome = /Chrome\/(\d+)/.exec(ua)?.[1] || '?';
  return [`${isNativeApp() ? 'APP ANDROID · ' : ''}Chrome ${chrome} · ${/Android ([\d.]+)/.exec(ua)?.[1] ? 'Android ' + /Android ([\d.]+)/.exec(ua)?.[1] : ua.slice(0, 40)} · serial:${serialSupported() ? 'sí' : 'no'} ble:${bleSupported() ? 'sí' : 'no'} vía:${btEnabled() ? via() : '-'}`, ...log].join('\n');
}
const listeners = new Set<() => void>();

function emit(s?: BTStatus) {
  if (s) status = s;
  listeners.forEach((l) => l());
}

const via = (): Via => { const v = localStorage.getItem(LS_VIA); return v === 'ble' || v === 'native' ? v : 'serial'; };
export function serialSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).serial;
}
export function bleSupported(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}
export function btSupported(): boolean {
  return isNativeApp() || serialSupported() || bleSupported();
}
export function btEnabled(): boolean {
  return localStorage.getItem(LS_ON) === '1';
}
export function btState() {
  return {
    status, name: localStorage.getItem(LS_NAME) || '', error: lastError, supported: btSupported(),
    serial: serialSupported(), ble: bleSupported(), native: isNativeApp(), via: btEnabled() ? via() : null,
    lastSent,
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
  if (info.usbVendorId === undefined && !info.bluetoothServiceClassId) return 'Impresora (puerto serie)';
  if (info.usbVendorId) return 'Impresora USB';
  return 'Impresora';
}

async function openPort(p: SPort) {
  if (!p.writable) {
    dlog(`open ${JSON.stringify(p.getInfo?.() || {})}`);
    try { await p.open({ baudRate: 9600 }); dlog('open ok'); }
    catch (e: any) { dlog(`open ERROR ${e?.name}: ${e?.message}`); if (!/already open/i.test(e?.message || '')) throw e; }
  } else dlog('puerto ya abierto');
  port = p;
  knownPort = p;
  p.removeEventListener?.('disconnect', onPortGone);
  p.addEventListener?.('disconnect', onPortGone);
}

function onPortGone() {
  dlog('evento disconnect del puerto');
  port = null;
  knownPort = null;
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

// Servicios genéricos de BLE (no son de impresión): nunca escribir ahí
const GENERIC = new Set(['00001800-0000-1000-8000-00805f9b34fb', '00001801-0000-1000-8000-00805f9b34fb', '0000180a-0000-1000-8000-00805f9b34fb', '0000180f-0000-1000-8000-00805f9b34fb']);

async function findWritable(dev: BTDevice): Promise<BTChar> {
  const server = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
  const services = await server.getPrimaryServices();
  dlog(`BLE servicios: ${services.map((s: any) => s.uuid.slice(4, 8)).join(',')}`);
  // Candidatos en orden: servicios de impresora conocidos primero, nunca los genéricos
  const rank = (u: string) => { const i = SERVICES.indexOf(u); return i < 0 ? 99 : i; };
  const ordered = services.filter((s: any) => !GENERIC.has(s.uuid)).sort((a: any, b: any) => rank(a.uuid) - rank(b.uuid));
  const cands: BTChar[] = [];
  for (const s of ordered) {
    let chars: BTChar[] = [];
    try { chars = await s.getCharacteristics(); } catch { continue; }
    for (const ch of chars) if (ch.properties.writeWithoutResponse || ch.properties.write) cands.push(ch);
  }
  if (!cands.length) throw new Error('Esta impresora no es Bluetooth LE. Emparéjala en los ajustes de Bluetooth del equipo y usa «Buscar impresoras».');
  chanCount = cands.length;
  const idx = Math.min(parseInt(localStorage.getItem(LS_CH) || '0', 10) || 0, cands.length - 1);
  dlog(`BLE canales: ${cands.map((c) => c.uuid.slice(4, 8)).join(',')} → usando #${idx + 1}`);
  return cands[idx];
}

/** Rota al siguiente canal de escritura (si el actual no imprime). Devuelve "n/total". */
export async function btNextChannel(): Promise<string> {
  const cur = parseInt(localStorage.getItem(LS_CH) || '0', 10) || 0;
  const next = chanCount ? (cur + 1) % chanCount : 0;
  localStorage.setItem(LS_CH, String(next));
  charac = null;
  if (!device) throw new Error('Primero conecta la impresora.');
  await attachBle(device);
  return `${next + 1}/${chanCount}`;
}
export function btChannel(): string { return chanCount ? `${(parseInt(localStorage.getItem(LS_CH) || '0', 10) || 0) + 1}/${chanCount}` : ''; }

async function attachBle(dev: BTDevice) {
  device = dev;
  dev.removeEventListener?.('gattserverdisconnected', onDisconnect);
  dev.addEventListener?.('gattserverdisconnected', onDisconnect);
  charac = await findWritable(dev);
}

function onDisconnect() {
  dlog('BLE: la impresora cortó la conexión');
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
    dlog(`elegido ${JSON.stringify(p.getInfo?.() || {})}`);
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

/* ---------- App Android (puente nativo) ---------- */

/** Lista de impresoras emparejadas en Android (solo dentro de la app). */
export async function btNativeList(): Promise<NativePrinter[]> {
  const r = await nativeListPrinters();
  dlog(`nativo: ${r.devices.length} emparejada(s), bt ${r.enabled ? 'encendido' : 'APAGADO'}`);
  if (!r.supported) throw new Error('Este equipo no tiene Bluetooth.');
  if (!r.enabled) throw new Error('Prende el Bluetooth del equipo.');
  if (!r.devices.length) throw new Error('No hay impresoras emparejadas. Emparéjala primero en Ajustes → Bluetooth del equipo (clave 0000 o 1234).');
  return r.devices;
}

/** Elegir una impresora emparejada (app Android). */
export function btNativeSelect(d: NativePrinter) {
  void disconnectAll();
  save('native', d.address, d.name);
  dlog(`nativo: elegida ${d.name} ${d.address}`);
}

/** Respaldo: impresoras Bluetooth LE (no necesitan emparejarse). */
export async function btConnectBle(): Promise<void> {
  if (!bleSupported()) throw new Error('Este navegador no tiene Bluetooth. Usa Chrome en Android o en computadora.');
  emit('connecting');
  try {
    const dev = await (navigator as any).bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    dlog(`BLE elegido ${dev.name || dev.id}`);
    localStorage.removeItem(LS_CH);
    await disconnectAll();
    await attachBle(dev);
    dlog(`BLE característica ${charac?.uuid} write:${charac?.properties?.write} noResp:${charac?.properties?.writeWithoutResponse}`);
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
  port = null; knownPort = null;
}

/** Reconecta sin clic a la impresora ya autorizada (si el navegador lo permite). */
async function reconnect(): Promise<boolean> {
  if (via() === 'native') return isNativeApp() && !!localStorage.getItem(LS_ID);
  if (via() === 'serial') {
    if (port?.writable) return true;
    try {
      const ser = (navigator as any).serial;
      if (!ser?.getPorts) return false;
      const list: SPort[] = await ser.getPorts();
      dlog(`getPorts: ${list.length} autorizado(s)`);
      const p = knownPort || list.find((x) => x.getInfo?.().bluetoothServiceClassId) || list[0];
      if (!p) return false;
      emit('connecting');
      await openPort(p);
      lastError = '';
      emit('connected');
      return true;
    } catch (e: any) {
      dlog(`reconnect ERROR ${e?.name}: ${e?.message}`);
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
  [LS_ON, LS_ID, LS_NAME, LS_VIA, LS_CH].forEach((k) => localStorage.removeItem(k));
  lastError = '';
  emit('off');
}

/** Al abrir la app, intenta reconectar en silencio. */
export function btAutoReconnect() {
  if (!btEnabled() || !btSupported()) return;
  if (via() === 'native') { if (connected()) emit('connected'); return; }
  void reconnect();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(bytes: Uint8Array) {
  if (!(await reconnect())) {
    throw new Error(lastError || 'La impresora no está conectada. Ve a Ajustes → Impresora Bluetooth → Buscar impresoras.');
  }
  if (via() === 'native') {
    const addr = localStorage.getItem(LS_ID) || '';
    dlog(`nativo: imprimiendo ${bytes.length} bytes en ${addr}`);
    try {
      const n = await nativePrint(addr, bytes);
      lastSent = { bytes: n, at: Date.now(), info: { address: addr } };
      dlog('nativo: ok');
    } catch (e: any) {
      dlog(`nativo ERROR ${e?.message || e}`);
      throw new Error(e?.message || String(e));
    }
    return;
  }
  if (via() === 'serial') {
    const p = port;
    const w = p.writable.getWriter();
    let sent = 0;
    try {
      dlog(`escribiendo ${bytes.length} bytes`);
      for (let i = 0; i < bytes.length; i += 256) {
        await w.write(bytes.slice(i, i + 256));
        sent = Math.min(bytes.length, i + 256);
        await sleep(30); // las térmicas baratas tienen búfer chico
      }
      dlog('write ok, cerrando escritor');
      // Cerrar el escritor y el puerto = la única forma de FORZAR el vaciado del búfer en Web Serial.
      // En Android (RFCOMM) lo escrito puede quedarse en el búfer del navegador y nunca llegar al papel
      // si el puerto se deja abierto; cada ticket abre → escribe → cierra (como hacen las apps nativas).
      await w.close();
      dlog('escritor cerrado');
    } catch (e: any) {
      dlog(`write ERROR ${e?.name}: ${e?.message}`);
      try { w.releaseLock(); } catch { /* nada */ }
      throw e;
    }
    try { await p.close(); dlog('puerto cerrado'); } catch (e: any) { dlog(`close ERROR ${e?.message}`); }
    if (port === p) port = null;
    lastSent = { bytes: sent, at: Date.now(), info: p.getInfo?.() || {} };
    return;
  }
  if (!charac) throw new Error('La impresora Bluetooth no está conectada.');
  // Paquetes de 20 bytes (MTU mínimo de BLE: las térmicas baratas se desconectan con paquetes grandes)
  const noResp = !!charac.properties.writeWithoutResponse;
  const size = 20;
  dlog(`BLE escribiendo ${bytes.length} bytes en ${charac.uuid.slice(4, 8)} (${noResp ? 'sin' : 'con'} respuesta)`);
  try {
    for (let i = 0; i < bytes.length; i += size) {
      const chunk = bytes.slice(i, i + size);
      if (noResp) { await charac.writeValueWithoutResponse(chunk); await sleep(20); }
      else await charac.writeValueWithResponse(chunk);
    }
    dlog('BLE write ok');
  } catch (e: any) {
    dlog(`BLE write ERROR ${e?.name}: ${e?.message}`);
    throw e;
  }
}

const connected = () => (via() === 'native' ? !!localStorage.getItem(LS_ID) : via() === 'serial' ? !!knownPort : !!charac);

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
  if (via() === 'ble') p.row('Canal:', btChannel() || '-');
  p.row('Fecha:', new Date().toLocaleString('es-MX'));
  p.row('Acentos:', 'áéíóú ñ Ñ ¿¡');
  p.sep();
  p.line('¡Lista para imprimir tickets!', { center: true, bold: true });
  p.blank();
  p.cut();
  emit('printing');
  try { await send(p.bytes()); } finally { emit(connected() ? 'connected' : 'disconnected'); }
}
