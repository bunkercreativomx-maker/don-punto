import type { OrderDestination, OrderTypeInfo } from '../types/pos';

/** Renglones grandes que van arriba del ticket y la comanda: ["COMER AQUÍ", "MESA 4"], ["DIDI", "#12"]… */
export function orderTypeLines(o: OrderTypeInfo & { destination?: OrderDestination | string; customerName?: string }): string[] {
  if (o.online) return ['EN LÍNEA', o.online === 'delivery' ? 'A DOMICILIO' : 'PARA RECOGER'];
  const d = o.destination || 'Tienda';
  if (d === 'Tienda') {
    if (o.service === 'aqui') return ['COMER AQUÍ', ...(o.table?.trim() ? [`MESA ${o.table.trim().toUpperCase()}`] : [])];
    if (o.service === 'llevar') return ['PARA LLEVAR'];
    return [];
  }
  if (d === 'Didi') return ['DIDI', ...(o.orderRef?.trim() ? [`#${o.orderRef.trim().replace(/^#+/, '')}`] : [])];
  const name = (o.customerName || '').trim();
  return [String(d).toUpperCase(), ...(name && !/^pedido /i.test(name) ? [name.toUpperCase()] : [])];
}

/** Una sola línea para listas, búsqueda y hoja de cálculo */
export function orderTypeLabel(o: Parameters<typeof orderTypeLines>[0]): string {
  return orderTypeLines(o).join(' · ');
}

/** Solo los campos de tipo de orden (para copiar entre venta / cuenta abierta) */
export function pickOrderType(o: OrderTypeInfo): OrderTypeInfo {
  const r: OrderTypeInfo = {};
  if (o.service) r.service = o.service;
  if (o.table?.trim()) r.table = o.table.trim();
  if (o.orderRef?.trim()) r.orderRef = o.orderRef.trim().replace(/^#+/, '');
  if (o.online) r.online = o.online;
  if (o.reopenedFrom) r.reopenedFrom = o.reopenedFrom;
  return r;
}
