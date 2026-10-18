/**
 * Plan, equipo (empleados con PIN), sucursales y control de acceso por pantalla.
 *
 * Modelo de acceso:
 *  - Sin nadie identificado = "caja": solo ve las pantallas que el dueño deje abiertas (por defecto, solo Punto de Venta).
 *  - PIN del dueño (Ajustes → Seguridad) = acceso total por 15 minutos sin actividad.
 *  - Plan Pro: cada empleado tiene su PIN y un rol (cajero o gerente). Las ventas quedan a su nombre.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { storeGet, storeSet, getActiveBranch, MAIN_BRANCH } from './cloudStore';

// ---------------------------------------------------------------- plan
export type Plan = 'basico' | 'pro' | 'cortesia';
let plan: Plan = 'basico';
export function setPlan(p: Plan) { plan = p; }
export function getPlan(): Plan { return plan; }
/** Cortesía (cuentas activadas a mano) recibe todo lo de Pro */
export function isPro(): boolean { return plan !== 'basico'; }

// ---------------------------------------------------------------- pantallas
export type Tab =
  | 'profits' | 'pricing' | 'pos' | 'menu' | 'reports' | 'tickets' | 'settings' | 'inventory'
  | 'engineering' | 'recipes' | 'financial' | 'clients' | 'branches' | 'team';

export const TAB_LABEL: Record<Tab, string> = {
  pos: 'Punto de Venta', tickets: 'Tickets', reports: 'Reportes', profits: 'Tienda Física', pricing: 'Plataformas',
  menu: 'Catálogo', inventory: 'Inventario', engineering: 'Radar de Menú', recipes: 'Recetario', financial: 'Financiero',
  clients: 'Clientes', branches: 'Sucursales', team: 'Equipo', settings: 'Ajustes',
};

/** Pantallas que la caja puede abrir sin PIN (configurable por el dueño) */
export const CAJA_CONFIGURABLE: Tab[] = ['tickets', 'clients', 'menu', 'inventory', 'recipes'];
const DEFAULT_CAJA: Tab[] = ['clients'];
/** El gerente ve todo excepto lo del dueño */
const OWNER_ONLY: Tab[] = ['settings', 'financial', 'team', 'branches'];

// ---------------------------------------------------------------- equipo
export type Role = 'cajero' | 'gerente';
export interface Employee { id: string; name: string; pin: string; role: Role; branchId?: string; active: boolean }
const TEAM_KEY = 'donPuntoEquipo';
export function getTeam(): Employee[] {
  try { return JSON.parse(storeGet(TEAM_KEY) || '[]'); } catch { return []; }
}
export function saveTeam(t: Employee[]) { storeSet(TEAM_KEY, JSON.stringify(t)); emitChange(); }

// ---------------------------------------------------------------- sucursales
export interface Branch { id: string; name: string; address?: string }
const BRANCHES_KEY = 'donPuntoSucursales';
export function getBranches(): Branch[] {
  let list: Branch[] = [];
  try { list = JSON.parse(storeGet(BRANCHES_KEY) || '[]'); } catch { /* vacío */ }
  if (!list.some((b) => b.id === MAIN_BRANCH)) list.unshift({ id: MAIN_BRANCH, name: 'Sucursal principal' });
  return list;
}
export function saveBranches(list: Branch[]) { storeSet(BRANCHES_KEY, JSON.stringify(list)); emitChange(); }
export function currentBranch(): Branch {
  const id = getActiveBranch();
  return getBranches().find((b) => b.id === id) || getBranches()[0];
}

// ---------------------------------------------------------------- caja / permisos
const ACCESS_KEY = 'donPuntoAcceso';
export function getCajaTabs(): Tab[] {
  try { const v = JSON.parse(storeGet(ACCESS_KEY) || 'null'); return Array.isArray(v?.caja) ? v.caja : DEFAULT_CAJA; } catch { return DEFAULT_CAJA; }
}
export function setCajaTabs(tabs: Tab[]) { storeSet(ACCESS_KEY, JSON.stringify({ caja: tabs })); emitChange(); }

// ---------------------------------------------------------------- sesión (quién está usando este equipo)
export interface Operator { kind: 'owner' | 'employee'; id: string; name: string; role: 'dueno' | Role }
const SESSION_KEY = 'dp:operator';
const IDLE_MS = 15 * 60 * 1000;

function readSession(): Operator | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (!raw) return null;
    // El dueño se bloquea solo tras 15 min sin actividad; el cajero sigue identificado
    if (raw.op.kind === 'owner' && Date.now() - raw.at > IDLE_MS) { sessionStorage.removeItem(SESSION_KEY); return null; }
    return raw.op as Operator;
  } catch { return null; }
}
let operator: Operator | null = readSession();
let version = 0;
const listeners = new Set<() => void>();
function emitChange() { version++; listeners.forEach((l) => l()); }
function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }

export function getOperator(): Operator | null { return operator; }
function setOperator(op: Operator | null) {
  operator = op;
  if (op) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ op, at: Date.now() }));
  else sessionStorage.removeItem(SESSION_KEY);
  emitChange();
}
export function touchSession() {
  if (operator) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ op: operator, at: Date.now() }));
}

/** ¿De quién es este PIN? (no cambia la sesión) */
export function findOperatorByPin(pin: string, ownerPin: string): Operator | null {
  const p = pin.trim();
  if (!p) return null;
  if (p === (ownerPin || '1234')) return { kind: 'owner', id: 'owner', name: 'Dueño', role: 'dueno' };
  if (isPro()) {
    const e = getTeam().find((x) => x.active && x.pin === p && (!x.branchId || x.branchId === getActiveBranch()));
    if (e) return { kind: 'employee', id: e.id, name: e.name, role: e.role };
  }
  return null;
}
/** Identifica a alguien por PIN y lo deja como operador de este equipo. */
export function unlockWithPin(pin: string, ownerPin: string): Operator | null {
  const op = findOperatorByPin(pin, ownerPin);
  if (op) setOperator(op);
  return op;
}
export function signIn(op: Operator) { setOperator(op); }
/** Autorizar una acción delicada (quitar productos, borrar cuentas): solo dueño o gerente. */
export function authorizeWithPin(pin: string, ownerPin: string): Operator | null {
  const op = findOperatorByPin(pin, ownerPin);
  return op && (op.role === 'dueno' || op.role === 'gerente') ? op : null;
}
export function lockSession() { setOperator(null); }

export function canAccess(tab: Tab, op: Operator | null = operator): boolean {
  if (tab === 'pos') return true;
  if ((tab === 'clients' || tab === 'branches' || tab === 'team') && !isPro() && op?.role !== 'dueno') return false;
  if (!op || op.role === 'cajero') return getCajaTabs().includes(tab);
  if (op.role === 'gerente') return !OWNER_ONLY.includes(tab);
  return true; // dueño
}

/** ¿Hay que pedir quién cobra al abrir? (Pro con empleados registrados) */
export function requiresCashierLogin(): boolean {
  return isPro() && getTeam().some((e) => e.active);
}

/** Hook: re-renderiza cuando cambia la sesión, el equipo o las sucursales */
export function useSession() {
  useSyncExternalStore(subscribe, () => version);
  // refrescar actividad del dueño
  const [, force] = useState(0);
  useEffect(() => {
    const onAct = () => touchSession();
    const iv = setInterval(() => {
      const before = operator;
      const now = readSession();
      if (before && !now) { operator = null; emitChange(); force((x) => x + 1); }
    }, 30_000);
    window.addEventListener('pointerdown', onAct);
    window.addEventListener('keydown', onAct);
    return () => { clearInterval(iv); window.removeEventListener('pointerdown', onAct); window.removeEventListener('keydown', onAct); };
  }, []);
  return { operator, canAccess: (t: Tab) => canAccess(t, operator) };
}
