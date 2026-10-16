/** Clientes frecuentes y recompensas por visita (plan Pro). Compartidos entre sucursales. */
import { storeGet, storeSet } from './cloudStore';

export interface Client {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  createdAt: string;
  visits: number;
  total: number;
  lastVisit?: string;
  /** Visitas acumuladas para la próxima recompensa */
  stamps: number;
  rewardsUsed: number;
}
export interface LoyaltyConfig { enabled: boolean; every: number; type: 'percent' | 'amount'; value: number; label: string }

const KEY = 'donPuntoClientes';
const LOYALTY_KEY = 'donPuntoLealtad';
export const DEFAULT_LOYALTY: LoyaltyConfig = { enabled: true, every: 10, type: 'percent', value: 100, label: 'Tu orden número 10 va por la casa' };

export function getClients(): Client[] {
  try { return JSON.parse(storeGet(KEY) || '[]'); } catch { return []; }
}
export function saveClients(c: Client[]) { storeSet(KEY, JSON.stringify(c)); }
export function getLoyalty(): LoyaltyConfig {
  try { return { ...DEFAULT_LOYALTY, ...JSON.parse(storeGet(LOYALTY_KEY) || '{}') }; } catch { return DEFAULT_LOYALTY; }
}
export function saveLoyalty(l: LoyaltyConfig) { storeSet(LOYALTY_KEY, JSON.stringify(l)); }

export const normPhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

export function addClient(name: string, phone?: string, notes?: string): Client {
  const c: Client = { id: crypto.randomUUID(), name: name.trim(), phone: normPhone(phone) || undefined, notes, createdAt: new Date().toISOString(), visits: 0, total: 0, stamps: 0, rewardsUsed: 0 };
  saveClients([c, ...getClients()]);
  return c;
}

/** ¿El cliente ya ganó su recompensa? (esta visita sería la N-ésima) */
export function rewardReady(c: Client, l = getLoyalty()): boolean {
  return l.enabled && l.every > 0 && c.stamps >= l.every - 1;
}

/** Descuento de la recompensa sobre un subtotal */
export function rewardDiscount(subtotal: number, l = getLoyalty()): number {
  if (l.type === 'percent') return Math.min(subtotal, (subtotal * l.value) / 100);
  return Math.min(subtotal, l.value);
}

/** Registrar una compra del cliente */
export function recordVisit(clientId: string, amount: number, rewardApplied: boolean) {
  const list = getClients();
  const c = list.find((x) => x.id === clientId);
  if (!c) return;
  c.visits += 1;
  c.total += amount;
  c.lastVisit = new Date().toISOString();
  if (rewardApplied) { c.stamps = 0; c.rewardsUsed += 1; } else c.stamps += 1;
  saveClients(list);
}
