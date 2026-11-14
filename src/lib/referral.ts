import { apiPost } from './api';

// Código de socio: llega en el link (donpunto.com/?ref=CODIGO) o se escribe al registrarse.
const KEY = 'dp:ref';
const TTL = 60 * 86400 * 1000;

export const cleanRefCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);

/** Guarda el código del link (gana el primero que trajo a la persona) */
export function captureRef() {
  try {
    const p = new URLSearchParams(window.location.search);
    const code = cleanRefCode(p.get('ref') || '');
    if (!code) return;
    const prev = getStoredRef();
    if (!prev) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
    p.delete('ref');
    const qs = p.toString();
    history.replaceState(history.state, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
  } catch { /* sin localStorage */ }
}

export function getStoredRef(): string {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v?.code || Date.now() - Number(v.at) > TTL) return '';
    return String(v.code);
  } catch { return ''; }
}

export async function checkRefCode(code: string): Promise<boolean> {
  const r = await fetch(`/api/referral?code=${encodeURIComponent(code)}`);
  const d = await r.json().catch(() => null);
  return !!d?.valid;
}

/** Liga la cuenta recién creada al socio. Nunca bloquea el registro. */
export async function attachRef(code: string, source: 'link' | 'manual') {
  try {
    await apiPost('/api/referral', { code, source });
    localStorage.removeItem(KEY);
  } catch (e) {
    console.error('referido', e);
  }
}
