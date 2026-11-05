import type { POSPaymentMethod, POSTransaction, PaymentPart } from '../types/pos';
import { money } from './format';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que entró de la VENTA (sin propina) con una forma de pago, aunque la cuenta se haya pagado mixto */
export function txPortion(t: Pick<POSTransaction, 'amount' | 'paymentMethod' | 'payments'>, m: POSPaymentMethod): number {
  if (t.payments?.length) return t.payments.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0);
  return t.paymentMethod === m ? t.amount : 0;
}

/** ¿La cuenta usó esa forma de pago (sola o en un pago mixto)? */
export function txUses(t: Pick<POSTransaction, 'amount' | 'paymentMethod' | 'payments'>, m: POSPaymentMethod): boolean {
  return t.payments?.length ? t.payments.some((p) => p.method === m && p.amount > 0) : t.paymentMethod === m;
}

/** Texto para listas, reportes y hoja de cálculo: "Efectivo" o "Efectivo $100.00 + Tarjeta $250.00" */
export function paymentLabel(t: Pick<POSTransaction, 'paymentMethod' | 'payments'>): string {
  if (t.payments && t.payments.length > 1) return t.payments.map((p) => `${p.method} $${money(p.amount)}`).join(' + ');
  return t.paymentMethod;
}

/**
 * Convierte lo que pagó cada quien (incluye propina) en partes de la VENTA para el corte.
 * La propina se descuenta del ÚLTIMO pago y queda con su forma de pago (tx.paymentMethod).
 * Junta formas de pago repetidas. Regresa null si no cuadra.
 */
export function salePayments(paid: PaymentPart[], saleTotal: number, tip: number): { payments: PaymentPart[]; primary: POSPaymentMethod } | null {
  const parts = paid.map((p) => ({ method: p.method, amount: r2(p.amount) })).filter((p) => p.amount > 0);
  if (!parts.length) return null;
  const sum = r2(parts.reduce((a, p) => a + p.amount, 0));
  if (Math.abs(sum - r2(saleTotal + tip)) > 0.009) return null;
  const last = parts[parts.length - 1];
  if (last.amount + 0.009 < tip) return null;
  last.amount = r2(last.amount - tip);
  const merged: PaymentPart[] = [];
  for (const p of parts) {
    const m = merged.find((x) => x.method === p.method);
    if (m) m.amount = r2(m.amount + p.amount); else merged.push({ ...p });
  }
  return { payments: merged.filter((p) => p.amount > 0 || p.method === last.method), primary: last.method };
}

/** Reparte un total en n partes iguales a centavos; la última absorbe el residuo */
export function equalParts(total: number, n: number): number[] {
  const each = Math.floor((total / n) * 100) / 100;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? r2(total - each * (n - 1)) : each));
}
