import { useEffect, useState } from 'react';
import { PLANS, FOUNDER, type PlanKey } from '../config';

export interface FoundersInfo { limit: number; taken: number; left: number }

let cached: Promise<FoundersInfo | null> | null = null;

/** Lugares de precio de fundador que quedan (contador real del servidor). null = no se pudo leer */
export function fetchFounders(): Promise<FoundersInfo | null> {
  cached ||= fetch('/api/founders')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && typeof d.left === 'number' ? { limit: d.limit, taken: d.taken, left: d.left } : null))
    .catch(() => null);
  return cached;
}

export function useFounders(): FoundersInfo | null {
  const [f, setF] = useState<FoundersInfo | null>(null);
  useEffect(() => { void fetchFounders().then(setF); }, []);
  return f;
}

/** Precio que paga hoy un negocio nuevo (fundador mientras haya lugares) */
export function priceFor(plan: PlanKey, f: FoundersInfo | null): { price: number; regular: number; founder: boolean } {
  const regular = PLANS[plan].price;
  const founder = !f || f.left > 0; // sin dato aún: el servidor decide al cobrar; mostramos fundador
  return { price: founder ? FOUNDER.prices[plan] : regular, regular, founder };
}

export function daysLeft(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

export function fmtDay(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
}
