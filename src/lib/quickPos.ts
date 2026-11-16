import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * «Modo caja rápida»: POS a pantalla completa (productos en botones grandes, categorías abajo,
 * ticket fijo a la derecha con GUARDAR / COBRAR). Es opción POR EQUIPO (la tablet de la caja
 * puede usarlo y la compu del dueño no) y solo aplica en pantallas grandes (≥1024 px);
 * en celular el POS se ve igual que siempre.
 */
const KEY = 'dp:quickPOS';
const EVT = 'dp:quickpos';

export function getQuickPos(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setQuickPos(on: boolean) {
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch { /* sin storage */ }
  window.dispatchEvent(new Event(EVT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVT, cb);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', onStorage); };
}

/** Preferencia guardada en este equipo */
export function useQuickPosPref(): boolean {
  return useSyncExternalStore(subscribe, getQuickPos, () => false);
}

function useIsLarge(): boolean {
  const q = '(min-width: 1024px)';
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setOk(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return ok;
}

/** true = se debe pintar el POS en modo caja rápida ahora mismo (preferencia + pantalla grande) */
export function useQuickPos(): boolean {
  const pref = useQuickPosPref();
  const large = useIsLarge();
  return pref && large;
}
