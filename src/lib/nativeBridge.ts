/**
 * Puente con la app Android de Don Punto (Capacitor). La app carga donpunto.com dentro de un WebView
 * e inyecta `window.Capacitor`; el plugin `BtPrinter` (native/android/.../BtPrinterPlugin.java) imprime
 * por Bluetooth clásico igual que las apps nativas de POS. En navegador normal no existe nada de esto.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

export type NativePrinter = { name: string; address: string; major?: number };

function cap(): any { return typeof window !== 'undefined' ? (window as any).Capacitor : undefined; }

/** true cuando corremos dentro de la app Android instalada */
export function isNativeApp(): boolean {
  const c = cap();
  return !!c && typeof c.isNativePlatform === 'function' && c.isNativePlatform();
}

function plugin(): any {
  const p = cap()?.Plugins?.BtPrinter;
  if (!p) throw new Error('La app no trae el módulo de impresión. Actualiza la app Don Punto.');
  return p;
}

export async function nativeListPrinters(): Promise<{ supported: boolean; enabled: boolean; devices: NativePrinter[] }> {
  const r = await plugin().list();
  return { supported: !!r.supported, enabled: !!r.enabled, devices: (r.devices || []) as NativePrinter[] };
}

export async function nativePrint(address: string, bytes: Uint8Array): Promise<number> {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await plugin().print({ address, data: btoa(bin) });
  return r?.bytes ?? bytes.length;
}

/** Enlace de descarga del APK (release fija del repo; /app/android redirige ahí) */
export const ANDROID_APP_URL = 'https://donpunto.com/app/android';

export function isAndroidBrowser(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent) && !isNativeApp();
}
