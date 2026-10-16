/**
 * cloudStore — almacenamiento por usuario con respaldo en la nube (PocketBase).
 *
 * - Todo se guarda en localStorage con prefijo por usuario (dp:<uid>:<key>) → cada cuenta
 *   ve SOLO sus datos aunque compartan navegador.
 * - Cada cambio se sincroniza a la colección `user_items` (una fila por elemento con `id`,
 *   o una fila única "_" para objetos sueltos). Si no hay internet, los cambios quedan
 *   pendientes y se suben solos al volver la conexión.
 * - Al iniciar sesión se baja todo de la nube (hydrate) antes de montar la app.
 */
import { pb } from './pocketbase';

const COLLECTION = 'user_items';
const SINGLE = '_';

// Claves que NO se sincronizan (preferencias de UI del dispositivo)
const LOCAL_ONLY = new Set(['donPuntoActiveTab']);

let currentUid: string | null = null;

const scoped = (key: string, uid = currentUid) => `dp:${uid ?? 'anon'}:${key}`;
const syncedKey = (key: string) => `dp:${currentUid}:__synced:${key}`;
const KNOWN_KEYS = () => `dp:${currentUid}:__keys`;

type SyncedMap = Record<string, [recordId: string, hash: string, order?: number]>;

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + s.length;
}

function readJSON<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** ¿Es un arreglo de objetos con `id` (se sincroniza fila por fila)? */
function isIdArray(value: unknown): value is { id: string | number }[] {
  return Array.isArray(value) && value.length > 0 && value.every((x) => x && typeof x === 'object' && (typeof (x as { id?: unknown }).id === 'string' || typeof (x as { id?: unknown }).id === 'number'));
}

/**
 * Divide un valor en elementos sincronizables {item_id: data}.
 * El orden (__i) es ESTABLE: un elemento ya subido conserva su posición guardada y uno nuevo
 * recibe una posición entre sus vecinos. Así, agregar una venta al inicio de 800 ventas
 * sube 1 registro en lugar de reescribir los 800.
 */
function explode(value: unknown, synced: SyncedMap = {}): Record<string, unknown> {
  if (!isIdArray(value)) return { [SINGLE]: { v: value } };
  const ids = value.map((x) => String(x.id));
  const known = ids.map((id) => {
    const o = synced[id]?.[2];
    return typeof o === 'number' && Number.isFinite(o) ? o : undefined;
  });
  // Si los elementos ya subidos cambiaron de orden entre sí (reordenar el menú), se renumera todo
  let last = -Infinity;
  let monotonic = true;
  for (const o of known) {
    if (o === undefined) continue;
    if (o <= last) { monotonic = false; break; }
    last = o;
  }
  const ord: number[] = new Array(ids.length);
  if (!monotonic) {
    ids.forEach((_, i) => (ord[i] = i));
  } else {
    for (let i = 0; i < ids.length; i++) {
      if (known[i] !== undefined) { ord[i] = known[i]!; continue; }
      const lo = i > 0 ? ord[i - 1] : undefined;
      let hi: number | undefined;
      for (let j = i + 1; j < ids.length; j++) if (known[j] !== undefined) { hi = known[j]; break; }
      ord[i] = lo === undefined && hi === undefined ? i : lo === undefined ? hi! - 1 : hi === undefined ? lo + 1 : (lo + hi) / 2;
    }
  }
  const out: Record<string, unknown> = {};
  value.forEach((x, i) => {
    out[ids[i]] = { __i: ord[i], v: x };
  });
  return out;
}

/** Reconstruye el valor a partir de las filas de la nube */
function implode(items: Record<string, unknown>): unknown {
  if (items[SINGLE] !== undefined && Object.keys(items).length === 1) {
    return (items[SINGLE] as { v: unknown }).v;
  }
  return Object.values(items)
    .filter((x) => x && typeof x === 'object' && '__i' in (x as object))
    .sort((a, b) => (a as { __i: number }).__i - (b as { __i: number }).__i)
    .map((x) => (x as { v: unknown }).v);
}

// ---------------------------------------------------------------- API pública

export function storeGet(key: string): string | null {
  return localStorage.getItem(scoped(key));
}

export function storeSet(key: string, value: string): void {
  localStorage.setItem(scoped(key), value);
  if (!currentUid || LOCAL_ONLY.has(key)) return;
  const keys = new Set(readJSON<string[]>(KNOWN_KEYS(), []));
  if (!keys.has(key)) {
    keys.add(key);
    localStorage.setItem(KNOWN_KEYS(), JSON.stringify([...keys]));
  }
  schedule(key);
}

export function storeRemove(key: string): void {
  localStorage.removeItem(scoped(key));
  if (currentUid && !LOCAL_ONLY.has(key)) schedule(key);
}

// ---------------------------------------------------------------- sync

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const running = new Map<string, Promise<void>>();
const dirty = new Set<string>();
let statusListeners: ((s: SyncStatus) => void)[] = [];
export type SyncStatus = 'ok' | 'pending' | 'offline';
let lastStatus: SyncStatus = 'ok';

function emit(s: SyncStatus) {
  if (s === lastStatus) return;
  lastStatus = s;
  statusListeners.forEach((l) => l(s));
}

export function onSyncStatus(fn: (s: SyncStatus) => void): () => void {
  statusListeners.push(fn);
  fn(lastStatus);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== fn);
  };
}

function schedule(key: string, delay = 1200) {
  dirty.add(key);
  emit(navigator.onLine ? 'pending' : 'offline');
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => void flushKey(key), delay));
}

async function flushKey(key: string): Promise<void> {
  if (!currentUid) return;
  const prev = running.get(key);
  if (prev) {
    await prev;
  }
  const p = doFlush(key, currentUid).finally(() => running.delete(key));
  running.set(key, p);
  return p;
}

async function doFlush(key: string, uid: string): Promise<void> {
  const raw = localStorage.getItem(scoped(key, uid));
  let value: unknown = null;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    value = raw; // string plano
  }
  const synced = readJSON<SyncedMap>(syncedKey(key), {});
  const items = value === null ? {} : explode(value, synced);
  const next: SyncedMap = { ...synced };
  let failed = false;

  // upserts (hasta 4 en paralelo)
  const ordOf = (data: unknown) => (data as { __i?: number })?.__i;
  const upsert = async (itemId: string, data: unknown) => {
    const body = JSON.stringify(data);
    const h = hash(body);
    if (synced[itemId]?.[1] === h) return;
    try {
      const recId = synced[itemId]?.[0];
      if (recId) {
        await pb.collection(COLLECTION).update(recId, { data }, { requestKey: null });
        next[itemId] = [recId, h, ordOf(data)];
      } else {
        try {
          const rec = await pb.collection(COLLECTION).create({ owner: uid, kind: key, item_id: itemId, data }, { requestKey: null });
          next[itemId] = [rec.id, h, ordOf(data)];
        } catch (e: unknown) {
          // ya existía (otro dispositivo) → actualizar
          const existing = await pb
            .collection(COLLECTION)
            .getFirstListItem(pb.filter('owner = {:o} && kind = {:k} && item_id = {:i}', { o: uid, k: key, i: itemId }), { requestKey: null })
            .catch(() => null);
          if (!existing) throw e;
          await pb.collection(COLLECTION).update(existing.id, { data }, { requestKey: null });
          next[itemId] = [existing.id, h, ordOf(data)];
        }
      }
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      if (status === 404) {
        delete next[itemId]; // registro borrado en otro lado → se recrea en el próximo intento
      }
      failed = true;
    }
  };
  const queue = Object.entries(items);
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await upsert(job[0], job[1]);
    }),
  );

  // deletes
  for (const [itemId, [recId]] of Object.entries(synced)) {
    if (itemId in items) continue;
    try {
      await pb.collection(COLLECTION).delete(recId, { requestKey: null });
      delete next[itemId];
    } catch (e: unknown) {
      if ((e as { status?: number })?.status === 404) delete next[itemId];
      else failed = true;
    }
  }

  if (currentUid === uid) {
    localStorage.setItem(syncedKey(key), JSON.stringify(next));
  }
  if (failed) {
    emit(navigator.onLine ? 'pending' : 'offline');
    schedule(key, 15000); // reintento
  } else {
    dirty.delete(key);
    if (dirty.size === 0) emit('ok');
  }
}

export async function flushAll(): Promise<void> {
  if (!currentUid) return;
  const keys = readJSON<string[]>(KNOWN_KEYS(), []);
  await Promise.all(keys.map((k) => flushKey(k)));
}

export function hasPendingChanges(): boolean {
  return dirty.size > 0;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushAll());
  window.addEventListener('offline', () => emit('offline'));
  window.addEventListener('beforeunload', (e) => {
    if (dirty.size > 0) {
      e.preventDefault();
    }
  });
}

// ---------------------------------------------------------------- login / logout

/** Claves que la app usaba antes sin prefijo de usuario (para migrar datos existentes una sola vez) */
const LEGACY_KEYS = [
  'delivery_calculator_pos_txs',
  'delivery_calculator_pos_settings',
  'delivery_calculator_pos_tickets',
  'deliveryCalcSettings',
  'deliveryCalcRows',
  'deliveryCalcCategories',
  'deliveryCalcModifierGroups',
  'donPuntoFinancialExpenses',
  'donPuntoRecetario',
  'donPuntoInsumos2',
  'donPuntoInventario',
  'donPuntoComprasHoy',
  'donPuntoHistorial',
  'donPuntoCierresDiarios',
  'donPuntoComboUsage',
];

/**
 * Prepara el almacenamiento del usuario: baja sus datos de la nube y, si es su primera vez
 * en la nube, adopta los datos que este navegador tenía guardados (versión anterior).
 */
export async function hydrateUser(uid: string, legacyMenu?: unknown): Promise<void> {
  currentUid = uid;
  dirty.clear();

  const rows = await pb.collection(COLLECTION).getFullList({
    filter: pb.filter('owner = {:o}', { o: uid }),
    batch: 500,
    requestKey: null,
  });

  const grouped: Record<string, Record<string, unknown>> = {};
  const syncedByKey: Record<string, SyncedMap> = {};
  for (const r of rows) {
    const kind = r.kind as string;
    const itemId = r.item_id as string;
    (grouped[kind] ||= {})[itemId] = r.data;
    (syncedByKey[kind] ||= {})[itemId] = [r.id, hash(JSON.stringify(r.data)), (r.data as { __i?: number })?.__i];
  }

  // Cambios locales pendientes de este dispositivo (sin subir) tienen prioridad
  const pendingLocal = new Set<string>();
  for (const key of readJSON<string[]>(KNOWN_KEYS(), [])) {
    const local = localStorage.getItem(scoped(key));
    const syncedPrev = readJSON<SyncedMap>(syncedKey(key), {});
    if (local === null) continue;
    let parsed: unknown;
    try { parsed = JSON.parse(local); } catch { parsed = local; }
    const items = parsed === null ? {} : explode(parsed, syncedPrev);
    const differs =
      Object.keys(items).some((id) => syncedPrev[id]?.[1] !== hash(JSON.stringify(items[id]))) ||
      Object.keys(syncedPrev).some((id) => !(id in items));
    if (differs) pendingLocal.add(key);
  }

  const knownKeys = new Set(readJSON<string[]>(KNOWN_KEYS(), []));
  for (const [kind, items] of Object.entries(grouped)) {
    knownKeys.add(kind);
    if (pendingLocal.has(kind)) continue;
    localStorage.setItem(scoped(kind), JSON.stringify(implode(items)));
    localStorage.setItem(syncedKey(kind), JSON.stringify(syncedByKey[kind]));
  }

  // Primera vez en la nube: adoptar datos viejos sin prefijo de este navegador
  if (rows.length === 0) {
    for (const k of LEGACY_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(scoped(k)) === null) {
        localStorage.setItem(scoped(k), v);
        knownKeys.add(k);
        pendingLocal.add(k);
      }
    }
    // Menú respaldado en la versión anterior (restaurants.stripe_customer_id)
    const lm = legacyMenu as { rows?: unknown[]; categories?: unknown[]; modifierGroups?: unknown[] } | undefined;
    if (lm?.rows?.length && localStorage.getItem(scoped('deliveryCalcRows')) === null) {
      localStorage.setItem(scoped('deliveryCalcRows'), JSON.stringify(lm.rows));
      localStorage.setItem(scoped('deliveryCalcCategories'), JSON.stringify(lm.categories || []));
      localStorage.setItem(scoped('deliveryCalcModifierGroups'), JSON.stringify(lm.modifierGroups || []));
      ['deliveryCalcRows', 'deliveryCalcCategories', 'deliveryCalcModifierGroups'].forEach((k) => {
        knownKeys.add(k);
        pendingLocal.add(k);
      });
    }
  }
  // Los datos viejos sin prefijo ya no deben quedar visibles para otra cuenta
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));

  localStorage.setItem(KNOWN_KEYS(), JSON.stringify([...knownKeys]));
  pendingLocal.forEach((k) => schedule(k, 300));
  if (pendingLocal.size === 0) emit('ok');
}

/** Cierra sesión. Si todo está sincronizado, borra los datos locales de esa cuenta del navegador. */
export function clearUser(): void {
  if (currentUid && dirty.size === 0) {
    const prefix = `dp:${currentUid}:`;
    Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => localStorage.removeItem(k));
  }
  timers.forEach((t) => clearTimeout(t));
  timers.clear();
  dirty.clear();
  currentUid = null;
  emit('ok');
}

/** Sin internet al abrir: trabajar con lo guardado en este dispositivo y sincronizar después */
export function attachUserOffline(uid: string): void {
  currentUid = uid;
  emit('offline');
}

export function getCurrentUid(): string | null {
  return currentUid;
}
