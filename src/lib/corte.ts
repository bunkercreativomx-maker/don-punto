/**
 * Cálculo del Corte de caja detallado (por turno o por rango de fechas).
 * Todo es puro: recibe ventas, turnos, cancelaciones y eventos, y devuelve números listos para pintar.
 *
 * Modelo de caja:
 *  - La venta (tx.amount) ya trae IVA incluido y NO incluye la propina.
 *  - La propina (tx.tip) entra a la caja con la misma forma de pago y se entrega al personal en efectivo
 *    ("propinas pagadas"), por eso se resta del efectivo esperado.
 *  - Efectivo esperado = fondo + ventas en efectivo + propinas en efectivo + depósitos − retiros − propinas pagadas.
 *  - Lo que cobran las apps de delivery (Uber/DiDi/Rappi) no entra a la caja; se reporta aparte.
 */
import type { POSTransaction, POSPaymentMethod, OrderDestination, CashShift, Cancellation, SecurityEvent, CashDeclaration } from '../types/pos';
import type { ProductRowData, Category } from '../types/calculator';

export const CASH_METHODS: POSPaymentMethod[] = ['Efectivo', 'Didi Efectivo'];
export const APP_METHODS: POSPaymentMethod[] = ['Uber', 'Didi', 'Rappi'];
export const ALL_METHODS: POSPaymentMethod[] = ['Efectivo', 'Tarjeta', 'Transferencia', 'Didi Efectivo', 'Uber', 'Didi', 'Rappi'];
export const DEST_LABEL: Record<OrderDestination, string> = { Tienda: 'En tienda', Uber: 'Uber', Didi: 'DiDi', Rappi: 'Rappi' };
export const METHOD_LABEL: Record<POSPaymentMethod, string> = { Efectivo: 'Efectivo', Tarjeta: 'Tarjeta', Transferencia: 'Transferencia', 'Didi Efectivo': 'DiDi Efectivo', Uber: 'Uber', Didi: 'DiDi', Rappi: 'Rappi' };

export interface Line { label: string; amount: number; count?: number; pct?: number }

export interface CorteData {
  title: string;
  from: Date;
  to: Date;
  shiftLabel: string;
  openShift: boolean;
  cajero: string;
  // resumen
  total: number;
  cuentas: number;
  comensales: number;
  cuentaPromedio: number;
  promedioPersona: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  apps: number;
  // venta
  subtotalSinImp: number;
  descuentosSinImp: number;
  ventaNeta: number;
  impuesto: number;
  ivaPct: number;
  porCategoria: Line[];
  porArea: Line[];
  // caja
  fondo: number;
  cajaEfectivo: number;
  cajaTarjeta: number;
  cajaTransferencia: number;
  depositos: number;
  retiros: number;
  propinasPagadas: number;
  efectivoFinal: number;
  saldoFinal: number;
  movimientos: { date: string; type: string; amount: number; reason?: string; byName?: string }[];
  declaracion: CashDeclaration | null;
  declaradoTotal: number;
  diferencia: number;
  // pagos
  pagosVentas: Line[];
  pagosPropinas: Line[];
  // personas y productos
  meseros: Line[];
  productos: Line[];
  // operación
  folioInicial: string;
  folioFinal: string;
  canceladas: { count: number; amount: number; pct: number };
  cortesias: { count: number; amount: number };
  descuentos: { count: number; amount: number };
  propinas: number;
  reimpresiones: number;
  reaperturas: number;
  incidencias: { date: string; type: string; amount: number; detail?: string; byName?: string }[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
export const folioStr = (n: number) => `#${String(n).padStart(4, '0')}`;

/** Folio estable: posición cronológica de la venta (igual que en Historial de Tickets) */
export function folioMap(txs: POSTransaction[]): Map<string, number> {
  const sorted = [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

interface BuildArgs {
  allTxs: POSTransaction[];
  shifts: CashShift[];
  /** Modo turno: el turno a reportar */
  shift?: CashShift;
  from: Date;
  to: Date;
  cancellations: Cancellation[];
  events: SecurityEvent[];
  rows: ProductRowData[];
  categories: Category[];
  ivaPct: number;
  businessName?: string;
}

export function buildCorte(a: BuildArgs): CorteData {
  const { shift, from, to } = a;
  const inWindow = (iso: string) => { const t = new Date(iso).getTime(); return t >= from.getTime() && t <= to.getTime(); };

  // Ventas del periodo
  const txs = a.allTxs.filter((t) => {
    if (shift) return t.shiftId ? t.shiftId === shift.id : inWindow(t.date);
    return inWindow(t.date);
  });
  const shifts = shift ? [shift] : a.shifts.filter((s) => inWindow(s.openedAt));

  const ivaF = (a.ivaPct || 0) / 100;
  const sinImp = (n: number) => n / (1 + ivaF);

  const total = sum(txs.map((t) => t.amount));
  const byMethod = (m: POSPaymentMethod) => sum(txs.filter((t) => t.paymentMethod === m).map((t) => t.amount));
  const tipsBy = (m: POSPaymentMethod) => sum(txs.filter((t) => t.paymentMethod === m).map((t) => t.tip || 0));
  const efectivo = sum(CASH_METHODS.map(byMethod));
  const tarjeta = byMethod('Tarjeta');
  const transferencia = byMethod('Transferencia');
  const apps = sum(APP_METHODS.map(byMethod));
  const cuentas = txs.length;
  const comensales = sum(txs.map((t) => t.guests || 0));
  const propinas = sum(txs.map((t) => t.tip || 0));

  // Descuentos (sin contar cortesías) y cortesías
  const cortesiaTx = txs.filter((t) => t.courtesy);
  const descTx = txs.filter((t) => !t.courtesy && (t.discountAmount || 0) > 0);
  const descuentosConImp = sum(txs.map((t) => t.discountAmount || 0));

  // Venta por categoría: reparte el importe cobrado de cada cuenta entre sus productos según su precio de lista
  const rowById = new Map(a.rows.map((r) => [r.id, r]));
  const catName = new Map(a.categories.map((c) => [c.id, c.name]));
  const catAmt = new Map<string, { amount: number; qty: number }>();
  const prod = new Map<string, { qty: number; amount: number }>();
  const addCat = (k: string, amount: number, qty: number) => { const c = catAmt.get(k) || { amount: 0, qty: 0 }; c.amount += amount; c.qty += qty; catAmt.set(k, c); };
  for (const t of txs) {
    const items = t.items || [];
    const weights = items.map((it) => {
      const row = rowById.get(it.rowId);
      const extras = sum((it.selectedModifiers || []).flatMap((g) => g.modifiers.map((m) => m.extraPrice || 0)));
      return Math.max(0, ((row?.salePrice || 0) + extras)) * (it.quantity || 1);
    });
    const wsum = sum(weights);
    if (!items.length) { addCat('Sin detalle', t.amount, 0); continue; }
    items.forEach((it, i) => {
      const share = wsum > 0 ? (weights[i] / wsum) * t.amount : t.amount / items.length;
      const row = rowById.get(it.rowId);
      addCat((row?.categoryId && catName.get(row.categoryId)) || 'Sin categoría', share, it.quantity || 1);
      const name = row?.name || 'Producto eliminado';
      const p = prod.get(name) || { qty: 0, amount: 0 };
      p.qty += it.quantity || 1; p.amount += share; prod.set(name, p);
    });
  }
  const porCategoria: Line[] = [...catAmt.entries()]
    .map(([label, v]) => ({ label, amount: sinImp(v.amount), count: v.qty, pct: total ? (v.amount / total) * 100 : 0 }))
    .sort((x, y) => y.amount - x.amount);

  const porArea: Line[] = (['Tienda', 'Uber', 'Didi', 'Rappi'] as OrderDestination[])
    .map((d) => {
      const amt = sum(txs.filter((t) => (t.destination || 'Tienda') === d).map((t) => t.amount));
      return { label: DEST_LABEL[d], amount: amt, count: txs.filter((t) => (t.destination || 'Tienda') === d).length, pct: total ? (amt / total) * 100 : 0 };
    });

  // Caja
  const fondo = sum(shifts.map((s) => s.openingFloat || 0));
  const movs = shifts.flatMap((s) => s.movements || []);
  const depositos = sum(movs.filter((m) => m.type === 'deposito').map((m) => m.amount));
  const retiros = sum(movs.filter((m) => m.type === 'retiro').map((m) => m.amount));
  const cajaEfectivo = efectivo + sum(CASH_METHODS.map(tipsBy));
  const cajaTarjeta = tarjeta + tipsBy('Tarjeta');
  const cajaTransferencia = transferencia + tipsBy('Transferencia');
  const propinasPagadas = propinas - sum(APP_METHODS.map(tipsBy));
  const efectivoFinal = fondo + cajaEfectivo + depositos - retiros - propinasPagadas;
  const saldoFinal = efectivoFinal + cajaTarjeta + cajaTransferencia;

  const closed = shifts.filter((s) => s.closedAt && s.declaration);
  const declaracion: CashDeclaration | null = closed.length && closed.length === shifts.length
    ? closed.reduce((acc, s) => ({
        efectivo: acc.efectivo + (s.declaration!.efectivo || 0),
        tarjeta: acc.tarjeta + (s.declaration!.tarjeta || 0),
        transferencia: acc.transferencia + (s.declaration!.transferencia || 0),
        otros: acc.otros + (s.declaration!.otros || 0),
      }), { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0 })
    : null;
  const declaradoTotal = declaracion ? declaracion.efectivo + declaracion.tarjeta + declaracion.transferencia + declaracion.otros : 0;
  const diferencia = declaracion ? r2(declaradoTotal - saldoFinal) : 0;

  // Siempre todas las formas de pago (aunque estén en 0) para que el cajero vea cada plataforma
  const pagosVentas: Line[] = ALL_METHODS.map((m) => ({ label: METHOD_LABEL[m] || m, amount: byMethod(m), count: txs.filter((t) => t.paymentMethod === m).length }));
  const pagosPropinas: Line[] = ALL_METHODS.map((m) => ({ label: METHOD_LABEL[m] || m, amount: tipsBy(m) })).filter((l) => l.amount > 0);

  // Meseros / quién atendió
  const mes = new Map<string, { amount: number; count: number }>();
  for (const t of txs) {
    const k = t.waiterName || t.employeeName || (t.destination && t.destination !== 'Tienda' ? 'Pedidos de apps' : 'Caja');
    const m = mes.get(k) || { amount: 0, count: 0 }; m.amount += t.amount; m.count++; mes.set(k, m);
  }
  const meseros = [...mes.entries()].map(([label, v]) => ({ label, amount: v.amount, count: v.count })).sort((x, y) => y.amount - x.amount);
  const productos = [...prod.entries()].map(([label, v]) => ({ label, amount: v.amount, count: v.qty })).sort((x, y) => (y.count || 0) - (x.count || 0) || y.amount - x.amount);

  // Folios
  const fmap = folioMap(a.allTxs);
  const folios = txs.map((t) => fmap.get(t.id) || 0).filter(Boolean);
  const folioInicial = folios.length ? folioStr(Math.min(...folios)) : '—';
  const folioFinal = folios.length ? folioStr(Math.max(...folios)) : '—';

  // Cancelaciones y eventos en la ventana del periodo
  const canc = a.cancellations.filter((c) => inWindow(c.date));
  const cancAmt = sum(canc.map((c) => c.amount));
  const evs = a.events.filter((e) => inWindow(e.date));
  const reimpresiones = evs.filter((e) => e.type === 'reimpresion').length;
  const reaperturas = evs.filter((e) => e.type === 'reapertura').length;
  const incidencias = [
    ...canc.map((c) => ({ date: c.date, type: 'Cancelación', amount: c.amount, detail: c.detail, byName: c.byName })),
    ...evs.filter((e) => e.type === 'reapertura').map((e) => ({ date: e.date, type: 'Reapertura', amount: e.amount, detail: e.detail, byName: e.byName })),
    ...cortesiaTx.map((t) => ({ date: t.date, type: 'Cortesía', amount: t.discountAmount || 0, detail: t.notes, byName: t.employeeName })),
  ].sort((x, y) => x.date.localeCompare(y.date));

  const cajeros = [...new Set([...shifts.map((s) => s.openedByName), ...txs.map((t) => t.employeeName)].filter(Boolean))] as string[];

  return {
    title: a.businessName || 'Mi negocio',
    from, to,
    shiftLabel: shift ? `Turno ${shift.number}` : shifts.length ? `${shifts.length} turno${shifts.length === 1 ? '' : 's'}` : 'Sin turnos',
    openShift: !!shift && !shift.closedAt,
    cajero: cajeros.join(', ') || '—',
    total, cuentas, comensales,
    cuentaPromedio: cuentas ? total / cuentas : 0,
    // Solo cuentas donde se capturó el número de personas
    promedioPersona: comensales ? sum(txs.filter((t) => (t.guests || 0) > 0).map((t) => t.amount)) / comensales : 0,
    efectivo, tarjeta, transferencia, apps,
    subtotalSinImp: sinImp(total + descuentosConImp),
    descuentosSinImp: sinImp(descuentosConImp),
    ventaNeta: sinImp(total),
    impuesto: total - sinImp(total),
    ivaPct: a.ivaPct || 0,
    porCategoria, porArea,
    fondo, cajaEfectivo, cajaTarjeta, cajaTransferencia, depositos, retiros, propinasPagadas, efectivoFinal, saldoFinal,
    movimientos: movs.map((m) => ({ date: m.date, type: m.type === 'retiro' ? 'Retiro' : 'Depósito', amount: m.amount, reason: m.reason, byName: m.byName })).sort((x, y) => x.date.localeCompare(y.date)),
    declaracion, declaradoTotal, diferencia,
    pagosVentas, pagosPropinas,
    meseros, productos,
    folioInicial, folioFinal,
    canceladas: { count: canc.length, amount: cancAmt, pct: total + cancAmt ? (cancAmt / (total + cancAmt)) * 100 : 0 },
    cortesias: { count: cortesiaTx.length, amount: sum(cortesiaTx.map((t) => t.discountAmount || 0)) },
    descuentos: { count: descTx.length, amount: sum(descTx.map((t) => t.discountAmount || 0)) },
    propinas, reimpresiones, reaperturas, incidencias,
  };
}

/** Rango local de un día YYYY-MM-DD */
export function dayRange(fromDay: string, toDay = fromDay): { from: Date; to: Date } {
  const from = new Date(fromDay + 'T00:00:00');
  const to = new Date(toDay + 'T23:59:59.999');
  return { from, to };
}
