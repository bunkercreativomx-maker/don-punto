/**
 * Turnos de caja (apertura → movimientos → cierre con declaración) y bitácora de eventos de seguridad.
 * Se guardan por sucursal (BRANCH_KEYS) y se sincronizan como el resto de los datos.
 */
import { useSyncExternalStore } from 'react';
import { storeGet, storeSet } from './cloudStore';
import { getOperator } from './session';
import type { CashShift, CashMovement, CashDeclaration, SecurityEvent } from '../types/pos';

const SHIFTS_KEY = 'donPuntoTurnos';
const EVENTS_KEY = 'donPuntoEventos';

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function getShifts(): CashShift[] {
  try { return JSON.parse(storeGet(SHIFTS_KEY) || '[]'); } catch { return []; }
}
function saveShifts(list: CashShift[]) { storeSet(SHIFTS_KEY, JSON.stringify(list.slice(0, 1000))); emit(); }

/** Turno abierto (solo puede haber uno por sucursal) */
export function getOpenShift(): CashShift | null {
  return getShifts().find((s) => !s.closedAt) || null;
}

export function openShift(openingFloat: number): CashShift {
  const current = getOpenShift();
  if (current) return current;
  const list = getShifts();
  const shift: CashShift = {
    id: crypto.randomUUID(),
    number: list.reduce((m, s) => Math.max(m, s.number || 0), 0) + 1,
    openedAt: new Date().toISOString(),
    openedByName: getOperator()?.name || 'Dueño',
    openingFloat: Math.max(0, Number(openingFloat) || 0),
    movements: [],
  };
  saveShifts([shift, ...list]);
  return shift;
}

export function addMovement(type: CashMovement['type'], amount: number, reason?: string) {
  const list = getShifts();
  const s = list.find((x) => !x.closedAt);
  if (!s || !(amount > 0)) return;
  s.movements = [...(s.movements || []), { id: crypto.randomUUID(), date: new Date().toISOString(), type, amount, reason: reason?.trim() || undefined, byName: getOperator()?.name || 'Dueño' }];
  saveShifts(list);
}

export function removeMovement(id: string) {
  const list = getShifts();
  const s = list.find((x) => !x.closedAt);
  if (!s) return;
  s.movements = (s.movements || []).filter((m) => m.id !== id);
  saveShifts(list);
}

export function closeShift(declaration: CashDeclaration): CashShift | null {
  const list = getShifts();
  const s = list.find((x) => !x.closedAt);
  if (!s) return null;
  s.closedAt = new Date().toISOString();
  s.closedByName = getOperator()?.name || 'Dueño';
  s.declaration = declaration;
  saveShifts(list);
  return s;
}

export function getEvents(): SecurityEvent[] {
  try { return JSON.parse(storeGet(EVENTS_KEY) || '[]'); } catch { return []; }
}
export function logEvent(type: SecurityEvent['type'], txId: string, amount: number, detail?: string) {
  const list = getEvents();
  list.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), type, txId, amount, detail, byName: getOperator()?.name || 'Dueño' });
  storeSet(EVENTS_KEY, JSON.stringify(list.slice(0, 3000)));
  emit();
}

// El Punto de Venta pide abrir turno antes de vender: la barra de turno escucha y abre su ventana
const openRequests = new Set<() => void>();
export function onOpenShiftRequest(f: () => void) { openRequests.add(f); return () => { openRequests.delete(f); }; }
export function requestOpenShift() { openRequests.forEach((f) => f()); }

/** Re-render cuando cambian turnos o eventos */
export function useCashShift() {
  useSyncExternalStore(subscribe, () => version);
  return { openShift: getOpenShift(), shifts: getShifts() };
}

export function getCancellations(): import('../types/pos').Cancellation[] {
  try { return JSON.parse(storeGet('donPuntoCancelaciones') || '[]'); } catch { return []; }
}
