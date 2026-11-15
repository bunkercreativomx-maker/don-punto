/**
 * Checador: registro electrónico de la jornada (entrada / salida de cada trabajador).
 *
 * - Cada checada es un registro en PocketBase `attendance`. La hora la pone el SERVIDOR (`created`):
 *   el equipo no puede mandar la hora (regla de la colección) y nadie puede editar ni borrar registros.
 * - Sin internet la checada se guarda en este equipo con su hora local y se sube al volver la conexión
 *   marcada como `offline` (en el reporte sale "sin conexión").
 * - Correcciones del dueño = registros nuevos (`add` falta una checada, `fix` cambia la hora, `void` anula)
 *   con motivo obligatorio. El registro original nunca se toca: todo queda en la bitácora.
 */
import { pb } from './pocketbase';
import { getActiveBranch } from './cloudStore';
import { getTeam, type Employee } from './session';

export type ClockKind = 'in' | 'out';
export type ClockAction = 'punch' | 'add' | 'fix' | 'void';
export interface ClockRecord {
  id: string; employee_id: string; employee_name: string; branch?: string;
  action: ClockAction; kind?: ClockKind | ''; at?: string; device_at?: string; offline?: boolean;
  ref?: string; reason?: string; by_name?: string; client_id?: string; created: string;
}

const COL = 'attendance';
const uid = () => pb.authStore.record?.id || '';
const qKey = () => `dp:${uid()}:clockQueue`;
/** Las fechas de PocketBase vienen como "2026-11-15 20:00:04.331Z" */
export const pbDate = (s?: string) => (s ? new Date(s.replace(' ', 'T')) : null);

/** Empleados que pueden checar: todos los activos con PIN (cualquier plan, también meseros "solo propinas") */
export function clockEmployees(): Employee[] {
  const br = getActiveBranch();
  return getTeam().filter((e) => e.active && e.pin && (!e.branchId || e.branchId === br));
}
export function findClockEmployee(pin: string): Employee | null {
  const p = pin.trim();
  return (p && clockEmployees().find((e) => e.pin === p)) || null;
}

// ---------------------------------------------------------------- cola sin conexión
type Queued = { employee_id: string; employee_name: string; branch: string; kind: ClockKind; device_at: string; client_id: string };
function readQueue(): Queued[] { try { return JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch { return []; } }
function writeQueue(q: Queued[]) { localStorage.setItem(qKey(), JSON.stringify(q)); }
export const pendingCount = () => readQueue().length;

let flushing = false;
/** Sube las checadas guardadas sin conexión. El client_id evita duplicados si se reintenta. */
export async function flushClockQueue(): Promise<number> {
  if (flushing || !uid()) return 0;
  flushing = true;
  let sent = 0;
  try {
    for (const item of readQueue()) {
      try {
        await pb.collection(COL).create({ owner: uid(), action: 'punch', offline: true, ...item }, { requestKey: null });
      } catch (e) {
        const st = (e as { status?: number }).status;
        if (!st) break; // sigue sin internet
        // 400 por client_id repetido = ya se había subido; cualquier otro rechazo lo deja en la cola
        if (st !== 400 || !(await existsClient(item.client_id))) continue;
      }
      writeQueue(readQueue().filter((x) => x.client_id !== item.client_id));
      sent++;
    }
  } finally { flushing = false; }
  return sent;
}
async function existsClient(cid: string) {
  try { await pb.collection(COL).getFirstListItem(pb.filter('client_id = {:c}', { c: cid }), { requestKey: null }); return true; } catch { return false; }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushClockQueue(); });
  setInterval(() => { if (navigator.onLine && pendingCount()) void flushClockQueue(); }, 60_000);
}

/** Checar entrada o salida. Regresa la hora oficial (servidor) o la local si quedó en cola. */
export async function punch(e: Employee, kind: ClockKind): Promise<{ at: Date; offline: boolean }> {
  const item: Queued = { employee_id: e.id, employee_name: e.name, branch: getActiveBranch(), kind, device_at: new Date().toISOString(), client_id: crypto.randomUUID() };
  try {
    const r = await pb.collection(COL).create<ClockRecord>({ owner: uid(), action: 'punch', offline: false, ...item }, { requestKey: null });
    return { at: pbDate(r.created)!, offline: false };
  } catch (err) {
    const st = (err as { status?: number }).status;
    if (st) throw new Error(st === 400 || st === 403 ? 'Tu membresía no permite guardar registros.' : 'No se pudo guardar. Intenta de nuevo.');
    writeQueue([...readQueue(), item]);
    return { at: new Date(item.device_at), offline: true };
  }
}

/** Última checada efectiva del empleado (para sugerir entrada o salida). */
export async function lastPunch(employeeId: string): Promise<{ kind: ClockKind; at: Date } | null> {
  const since = new Date(Date.now() - 36 * 3600_000);
  const recs = await fetchClock(since, new Date(Date.now() + 60_000), employeeId).catch(() => [] as ClockRecord[]);
  const q = readQueue().filter((x) => x.employee_id === employeeId).map((x) => ({ kind: x.kind, at: new Date(x.device_at) }));
  const all = [...effectivePunches(recs).filter((p) => p.employeeId === employeeId).map((p) => ({ kind: p.kind, at: p.at })), ...q]
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return all.length ? all[all.length - 1] : null;
}

/** Correcciones del dueño (nunca editan el original) */
export async function addCorrection(c: { action: Exclude<ClockAction, 'punch'>; employee_id: string; employee_name: string; kind?: ClockKind; at?: Date; ref?: string; reason: string; by_name: string }) {
  return pb.collection(COL).create<ClockRecord>({
    owner: uid(), branch: getActiveBranch(), client_id: crypto.randomUUID(), offline: false,
    action: c.action, employee_id: c.employee_id, employee_name: c.employee_name, kind: c.kind || '',
    at: c.at ? c.at.toISOString() : '', ref: c.ref || '', reason: c.reason, by_name: c.by_name,
  }, { requestKey: null });
}

/** Registros entre fechas (por hora del servidor). Las correcciones se piden todas: pueden ser posteriores. */
export async function fetchClock(from: Date, to: Date, employeeId?: string): Promise<ClockRecord[]> {
  const iso = (d: Date) => d.toISOString().replace('T', ' ');
  // Margen de 2 días: una checada sin conexión se sube después de su hora real
  const f = pb.filter(
    `owner = {:o} && ((action = 'punch' && created >= {:a} && created <= {:b2}) || action != 'punch')` + (employeeId ? ' && employee_id = {:e}' : ''),
    { o: uid(), a: iso(new Date(from.getTime() - 86400_000)), b2: iso(new Date(to.getTime() + 2 * 86400_000)), e: employeeId || '' },
  );
  return pb.collection(COL).getFullList<ClockRecord>({ filter: f, sort: 'created', requestKey: null });
}

// ---------------------------------------------------------------- cálculo (puro)
export interface Punch {
  id: string; employeeId: string; employeeName: string; kind: ClockKind; at: Date;
  /** hora que se registró originalmente si hubo corrección */
  originalAt?: Date; offline?: boolean; added?: boolean; corrected?: boolean; branch?: string;
}
export function effectivePunches(recs: ClockRecord[]): Punch[] {
  const voided = new Set<string>();
  const fixes = new Map<string, ClockRecord>();
  for (const r of recs) {
    if (r.action === 'void' && r.ref) voided.add(r.ref);
    if (r.action === 'fix' && r.ref) fixes.set(r.ref, r); // la última corrección gana (vienen ordenadas)
  }
  const out: Punch[] = [];
  for (const r of recs) {
    if ((r.action !== 'punch' && r.action !== 'add') || voided.has(r.id) || !r.kind) continue;
    const base = r.action === 'add' ? pbDate(r.at)! : r.offline ? pbDate(r.device_at)! : pbDate(r.created)!;
    const fx = fixes.get(r.id);
    out.push({
      id: r.id, employeeId: r.employee_id, employeeName: r.employee_name, branch: r.branch,
      kind: (fx?.kind || r.kind) as ClockKind, at: fx ? pbDate(fx.at)! : base,
      originalAt: fx ? base : undefined, offline: !!r.offline, added: r.action === 'add', corrected: !!fx,
    });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface Shift { employeeId: string; employeeName: string; inP?: Punch; outP?: Punch; minutes: number; day: Date }
/** Junta entrada → salida por empleado. Una entrada sin salida (o salida sin entrada) queda incompleta. */
export function buildShifts(punches: Punch[]): Shift[] {
  const by = new Map<string, Punch[]>();
  punches.forEach((p) => { if (!by.has(p.employeeId)) by.set(p.employeeId, []); by.get(p.employeeId)!.push(p); });
  const out: Shift[] = [];
  for (const list of by.values()) {
    let open: Punch | null = null;
    for (const p of list) {
      if (p.kind === 'in') {
        if (open) out.push(mk(open, undefined));
        open = p;
      } else if (open) { out.push(mk(open, p)); open = null; }
      else out.push(mk(undefined, p));
    }
    if (open) out.push(mk(open, undefined));
  }
  return out.sort((a, b) => a.day.getTime() - b.day.getTime() || a.employeeName.localeCompare(b.employeeName));
}
function mk(inP?: Punch, outP?: Punch): Shift {
  const ref = (inP || outP)!;
  const minutes = inP && outP ? Math.max(0, Math.round((outP.at.getTime() - inP.at.getTime()) / 60000)) : 0;
  const d = new Date(ref.at); d.setHours(0, 0, 0, 0);
  return { employeeId: ref.employeeId, employeeName: ref.employeeName, inP, outP, minutes, day: d };
}

/** Lunes de la semana de `d` */
export function weekStart(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
/** Jornada máxima semanal (LFT): 48 h hasta 2026, 46 h en 2027, 44 en 2028, 42 en 2029, 40 desde 2030 */
export function weeklyLimit(d: Date) { const y = d.getFullYear(); return y <= 2026 ? 48 : y >= 2030 ? 40 : 46 - (y - 2027) * 2; }

export interface WeekTotal { employeeId: string; employeeName: string; week: Date; minutes: number; limit: number; incomplete: number }
export function weekTotals(shifts: Shift[]): WeekTotal[] {
  const m = new Map<string, WeekTotal>();
  for (const s of shifts) {
    const w = weekStart(s.day);
    const k = s.employeeId + '|' + w.getTime();
    if (!m.has(k)) m.set(k, { employeeId: s.employeeId, employeeName: s.employeeName, week: w, minutes: 0, limit: weeklyLimit(w), incomplete: 0 });
    const t = m.get(k)!;
    t.minutes += s.minutes;
    if (!s.inP || !s.outP) t.incomplete++;
  }
  return [...m.values()].sort((a, b) => a.week.getTime() - b.week.getTime() || a.employeeName.localeCompare(b.employeeName));
}

export const fmtTime = (d?: Date) => (d ? d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtDay = (d: Date) => { const s = d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); return s.charAt(0).toUpperCase() + s.slice(1); };
export const fmtHours = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')} h`;
