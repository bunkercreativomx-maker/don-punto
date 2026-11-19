import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { TrendingUp, TrendingDown, Download, Printer, Clock, CalendarDays, Trophy, Users, Sparkles, CalendarRange } from 'lucide-react';
import type { POSTransaction } from '../../types/pos';
import { useCalculator } from '../../hooks/useCalculator';
import { isPro, currentBranch } from '../../lib/session';
import { money } from '../../lib/format';
import { orderTypeLabel } from '../../lib/orderType';
import { paymentLabel } from '../../lib/payments';

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const pct = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);
type Range = 'mes' | 'mesPasado' | '30' | 'todo';
const RANGE_LABEL: Record<Range, string> = { mes: 'este mes', mesPasado: 'mes pasado', '30': 'últimos 30 días', todo: 'todo' };
function rangeOf(range: Range) {
  const now = new Date();
  let from = new Date(0), to = new Date(8.64e15);
  if (range === 'mes') from = new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'mesPasado') { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 1); }
  if (range === '30') { from = startOfDay(now); from.setDate(from.getDate() - 29); }
  return { from, to };
}
// Día local (no UTC: de noche «hoy» ya sería mañana)
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mondayOf = (d: Date) => { const m = startOfDay(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const fmtDay = (d: Date) => d.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtShort = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
type Period = { key: string; label: string; tickets: number; total: number; desc: number };
function periods(txs: POSTransaction[], by: 'dia' | 'semana', range?: { from: Date; to: Date }): Period[] {
  const m = new Map<string, Period>();
  txs.forEach((t) => {
    const d = new Date(t.date);
    const start = by === 'dia' ? startOfDay(d) : mondayOf(d);
    const key = dayKey(start);
    let e = m.get(key);
    if (!e) {
      // La semana se recorta al periodo elegido (ej. «Este mes» empieza el 1 aunque la semana empiece antes)
      let a = start, z = new Date(start); z.setDate(z.getDate() + 6);
      if (range && a < range.from) a = startOfDay(range.from);
      const last = range && range.to.getTime() < 8e15 ? new Date(range.to.getTime() - 1) : null;
      if (last && z > last) z = startOfDay(last);
      const today = startOfDay(new Date());
      if (z > today) z = today;
      const lab = by === 'dia' ? fmtDay(start) : dayKey(a) === dayKey(z) ? fmtShort(a) : `${fmtShort(a)} – ${fmtShort(z)}`;
      e = { key, label: lab.charAt(0).toUpperCase() + lab.slice(1), tickets: 0, total: 0, desc: 0 };
      m.set(key, e);
    }
    e.tickets++; e.total += t.amount; e.desc += t.discountAmount || 0;
  });
  return [...m.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function Delta({ v }: { v: number | null }) {
  if (v === null) return <span className="text-xs text-carbon-400">sin comparación</span>;
  const up = v >= 0;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold ${up ? 'text-agave-700' : 'text-rose-600'}`}>{up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{up ? '+' : ''}{v.toFixed(0)}% vs. semana pasada</span>;
}

function Bars({ data, labels, highlight }: { data: number[]; labels: string[]; highlight?: number }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-0.5 sm:gap-1 h-36">
      {data.map((v, i) => (
        <div key={i} className="flex-1 h-full flex flex-col items-center gap-1 min-w-0" title={`${labels[i]}: $${money(v)}`}>
          <div className="w-full flex-1 flex items-end">
            <div className={`w-full rounded-t-md ${i === highlight ? 'bg-maiz-400' : 'bg-agave-400'}`} style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
          </div>
          <div className={`text-[10px] font-medium text-carbon-600 truncate w-full text-center ${data.length > 12 && i % 3 !== 0 ? 'invisible sm:visible' : ''}`}>{labels[i]}</div>
        </div>
      ))}
    </div>
  );
}

export function AdvancedReports({ transactions, onUpgrade }: { transactions: POSTransaction[]; onUpgrade?: () => void }) {
  const { rows } = useCalculator();
  const [range, setRange] = useState<Range>('mes');
  const [by, setBy] = useState<'dia' | 'semana'>('dia');
  const rangeTxs = useMemo(() => { const { from, to } = rangeOf(range); return transactions.filter((t) => { const d = new Date(t.date); return d >= from && d < to; }); }, [transactions, range]);
  const perList = useMemo(() => periods(rangeTxs, by, rangeOf(range)), [rangeTxs, by, range]);
  const perBest = perList.reduce((a, p) => Math.max(a, p.total), 0);
  const perTotal = perList.reduce((a, p) => a + p.total, 0);
  const perTickets = perList.reduce((a, p) => a + p.tickets, 0);

  const data = useMemo(() => {
    const today = startOfDay(new Date());
    const w0 = new Date(today); w0.setDate(w0.getDate() - 6);
    const w1 = new Date(w0); w1.setDate(w1.getDate() - 7);
    const d30 = new Date(today); d30.setDate(d30.getDate() - 29);
    const thisW = transactions.filter((t) => new Date(t.date) >= w0);
    const prevW = transactions.filter((t) => { const d = new Date(t.date); return d >= w1 && d < w0; });
    const last30 = transactions.filter((t) => new Date(t.date) >= d30);
    const s = (x: POSTransaction[]) => x.reduce((a, t) => a + t.amount, 0);
    const hours = new Array(24).fill(0); const days = new Array(7).fill(0);
    last30.forEach((t) => { const d = new Date(t.date); hours[d.getHours()] += t.amount; days[d.getDay()] += t.amount; });
    let first = hours.findIndex((v) => v > 0); let last = 23 - [...hours].reverse().findIndex((v) => v > 0);
    if (first < 0) { first = 8; last = 22; }
    const prod = new Map<string, { name: string; qty: number; revenue: number }>();
    last30.forEach((t) => (t.items || []).forEach((it) => {
      const r = rows.find((x) => x.id === it.rowId);
      const name = r?.name || 'Producto';
      const e = prod.get(it.rowId) || { name, qty: 0, revenue: 0 };
      e.qty += it.quantity; e.revenue += (r?.salePrice || 0) * it.quantity; prod.set(it.rowId, e);
    }));
    const cajeros = new Map<string, { ventas: number; tickets: number; desc: number }>();
    last30.forEach((t) => { if (!t.employeeName) return; const e = cajeros.get(t.employeeName) || { ventas: 0, tickets: 0, desc: 0 }; e.ventas += t.amount; e.tickets++; e.desc += t.discountAmount || 0; cajeros.set(t.employeeName, e); });
    return {
      week: { ventas: s(thisW), tickets: thisW.length, prom: thisW.length ? s(thisW) / thisW.length : 0 },
      prev: { ventas: s(prevW), tickets: prevW.length, prom: prevW.length ? s(prevW) / prevW.length : 0 },
      hours: hours.slice(first, last + 1), hourLabels: Array.from({ length: last - first + 1 }, (_, i) => `${first + i}h`),
      peakHour: hours.indexOf(Math.max(...hours)) - first,
      days, peakDay: days.indexOf(Math.max(...days)),
      top: [...prod.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
      cajeros: [...cajeros.entries()].sort((a, b) => b[1].ventas - a[1].ventas),
    };
  }, [transactions, rows]);

  if (!isPro()) {
    return (
      <div className="rounded-3xl border border-maiz-200 bg-gradient-to-br from-maiz-50 to-white p-6 flex flex-wrap items-center gap-4">
        <Sparkles className="text-maiz-700" />
        <div className="flex-1 min-w-[220px]">
          <div className="font-display text-lg font-bold text-carbon-950">Reportes avanzados · Pro</div>
          <div className="text-sm text-carbon-600">Esta semana contra la pasada, horas pico, mejores días, platillos estrella, reporte por cajero y descarga a Excel o PDF.</div>
        </div>
        {onUpgrade && <button onClick={onUpgrade} className="rounded-full bg-agave-600 hover:bg-agave-700 px-5 py-2.5 text-sm font-semibold text-white">Cambiar a Pro</button>}
      </div>
    );
  }

  const exportExcel = () => {
    const now = new Date();
    const { from, to } = rangeOf(range);
    const txs = transactions.filter((t) => { const d = new Date(t.date); return d >= from && d < to; }).sort((a, b) => a.date.localeCompare(b.date));
    const ventas = txs.map((t) => {
      const d = new Date(t.date);
      return { Fecha: d.toLocaleDateString('es-MX'), Hora: d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), Canal: t.destination, 'Tipo de orden': orderTypeLabel(t), 'Método de pago': paymentLabel(t), Cliente: t.customerName || '', Cajero: t.employeeName || '', Detalle: t.notes || '', Descuento: t.discountAmount || 0, Total: Math.round(t.amount * 100) / 100 };
    });
    const byDay = new Map<string, { Fecha: string; Tickets: number; Total: number; Tienda: number; Uber: number; Didi: number; Rappi: number }>();
    txs.forEach((t) => {
      const k = new Date(t.date).toLocaleDateString('es-MX');
      const e = byDay.get(k) || { Fecha: k, Tickets: 0, Total: 0, Tienda: 0, Uber: 0, Didi: 0, Rappi: 0 };
      e.Tickets++; e.Total += t.amount; e[(t.destination || 'Tienda') as 'Tienda'] += t.amount; byDay.set(k, e);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([...byDay.values()].map((r) => ({ ...r, Total: Math.round(r.Total * 100) / 100 }))), 'Resumen por día');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(periods(txs, 'semana', { from, to }).reverse().map((p) => ({ Semana: p.label, Tickets: p.tickets, 'Ticket promedio': Math.round((p.total / p.tickets) * 100) / 100, Descuentos: Math.round(p.desc * 100) / 100, Total: Math.round(p.total * 100) / 100 }))), 'Resumen por semana');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ventas), 'Ventas');
    XLSX.writeFile(wb, `don-punto-${currentBranch().name.replace(/\s+/g, '-').toLowerCase()}-${range}-${now.toISOString().slice(0, 10)}.xlsx`);
  };

  const card = 'rounded-3xl border border-carbon-950/10 bg-white p-6';
  return (
    <div className="space-y-6 print-report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold text-carbon-950 flex items-center gap-2"><Sparkles size={20} className="text-maiz-600" /> Reportes avanzados</h2>
        <div className="flex flex-wrap items-center gap-2 no-print">
          <select value={range} onChange={(e) => setRange(e.target.value as Range)} className="rounded-full border border-carbon-950/15 bg-white px-3 py-2 text-sm font-semibold text-carbon-800">
            <option value="mes">Este mes</option>
            <option value="mesPasado">Mes pasado</option>
            <option value="30">Últimos 30 días</option>
            <option value="todo">Todo</option>
          </select>
          <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 px-4 py-2 text-sm font-semibold text-white"><Download size={15} /> Excel</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-full border border-carbon-950/15 px-4 py-2 text-sm font-semibold text-carbon-700 hover:bg-carbon-50"><Printer size={15} /> PDF</button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { l: 'Ventas últimos 7 días', v: `$${money(data.week.ventas)}`, d: pct(data.week.ventas, data.prev.ventas) },
          { l: 'Tickets', v: data.week.tickets.toLocaleString('es-MX'), d: pct(data.week.tickets, data.prev.tickets) },
          { l: 'Ticket promedio', v: `$${money(data.week.prom)}`, d: pct(data.week.prom, data.prev.prom) },
        ].map((k) => (
          <div key={k.l} className={card}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-carbon-500">{k.l}</div>
            <div className="mt-2 font-display text-3xl font-bold text-carbon-950 tabular-nums">{k.v}</div>
            <div className="mt-1"><Delta v={k.d} /></div>
          </div>
        ))}
      </div>


      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-carbon-900 flex items-center gap-2"><CalendarRange size={16} className="text-agave-600" /> Ventas por {by === 'dia' ? 'día' : 'semana'} ({RANGE_LABEL[range]})</h3>
            <p className="text-xs text-carbon-500 mt-0.5">{perList.length ? `${perTickets.toLocaleString('es-MX')} tickets · $${money(perTotal)} en total · ${by === 'dia' ? 'el día más fuerte' : 'la semana más fuerte'} va en amarillo.` : 'No hay ventas en este periodo.'}{by === 'semana' ? ' Las semanas van de lunes a domingo.' : ''}</p>
          </div>
          <div className="flex rounded-full bg-carbon-100 p-0.5 no-print">
            {([['dia', 'Por día'], ['semana', 'Por semana']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setBy(k)} aria-pressed={by === k}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${by === k ? 'bg-white text-carbon-950 shadow-sm' : 'text-carbon-600 hover:text-carbon-950'}`}>{l}</button>
            ))}
          </div>
        </div>
        {perList.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-carbon-500"><tr><th className="text-left py-1">{by === 'dia' ? 'Día' : 'Semana'}</th><th className="text-right">Tickets</th><th className="text-right">Promedio</th><th className="text-right hidden sm:table-cell">Descuentos</th><th className="text-right">Ventas</th></tr></thead>
              <tbody className="divide-y divide-carbon-950/[0.06]">
                {perList.map((p) => (
                  <tr key={p.key}>
                    <td className="py-2 pr-2 font-semibold text-carbon-800 sm:whitespace-nowrap">{p.label}</td>
                    <td className="text-right tabular-nums">{p.tickets}</td>
                    <td className="text-right tabular-nums">${money(p.total / p.tickets)}</td>
                    <td className="text-right tabular-nums text-carbon-500 hidden sm:table-cell">${money(p.desc)}</td>
                    <td className="text-right tabular-nums font-bold">
                      <span className={`inline-block rounded-md px-1.5 ${p.total === perBest && perList.length > 1 ? 'bg-maiz-100 text-carbon-950' : ''}`}>${money(p.total)}</span>
                      <div className="mt-1 ml-auto h-1 rounded-full bg-carbon-100 w-16 sm:w-24"><div className="h-1 rounded-full bg-agave-500" style={{ width: `${perBest ? (p.total / perBest) * 100 : 0}%` }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-carbon-950/10 font-bold"><td className="py-2">Total</td><td className="text-right tabular-nums">{perTickets}</td><td className="text-right tabular-nums">${money(perTickets ? perTotal / perTickets : 0)}</td><td className="text-right tabular-nums text-carbon-500 hidden sm:table-cell">${money(perList.reduce((a, p) => a + p.desc, 0))}</td><td className="text-right tabular-nums">${money(perTotal)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h3 className="font-bold text-carbon-900 flex items-center gap-2"><Clock size={16} className="text-agave-600" /> Horas pico (30 días)</h3>
          <p className="text-xs text-carbon-500 mt-0.5 mb-4">{data.peakHour >= 0 && data.hours[data.peakHour] > 0 ? `Tu hora más fuerte: ${data.hourLabels[data.peakHour]}. Ten más gente y producto listo a esa hora.` : 'Aún no hay ventas suficientes.'}</p>
          <Bars data={data.hours} labels={data.hourLabels} highlight={data.peakHour} />
        </div>
        <div className={card}>
          <h3 className="font-bold text-carbon-900 flex items-center gap-2"><CalendarDays size={16} className="text-agave-600" /> Días de la semana (30 días)</h3>
          <p className="text-xs text-carbon-500 mt-0.5 mb-4">{data.days[data.peakDay] > 0 ? `${DAYS[data.peakDay]} es tu mejor día. El más flojo es buen día para una promoción.` : 'Aún no hay ventas suficientes.'}</p>
          <Bars data={data.days} labels={DAYS} highlight={data.peakDay} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className={card}>
          <h3 className="font-bold text-carbon-900 flex items-center gap-2"><Trophy size={16} className="text-maiz-600" /> Platillos estrella (30 días)</h3>
          {data.top.length === 0 ? <p className="mt-3 text-sm text-carbon-500">Sin ventas con productos todavía.</p> : (
            <div className="mt-3 space-y-2">
              {data.top.map((p, i) => (
                <div key={p.name + i} className="flex items-center gap-3">
                  <span className="w-5 text-xs font-bold text-carbon-400">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-sm"><span className="font-semibold text-carbon-800 truncate">{p.name}</span><span className="tabular-nums text-carbon-600">{p.qty} vendidos</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-carbon-100"><div className="h-1.5 rounded-full bg-agave-500" style={{ width: `${(p.qty / data.top[0].qty) * 100}%` }} /></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={card}>
          <h3 className="font-bold text-carbon-900 flex items-center gap-2"><Users size={16} className="text-agave-600" /> Por cajero (30 días)</h3>
          {data.cajeros.length === 0 ? <p className="mt-3 text-sm text-carbon-500">Cuando tu equipo cobre con su PIN (Equipo), aquí verás cuánto vendió cada quien.</p> : (
            <table className="mt-3 w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-carbon-500"><tr><th className="text-left py-1">Cajero</th><th className="text-right">Tickets</th><th className="text-right">Descuentos</th><th className="text-right">Ventas</th></tr></thead>
              <tbody className="divide-y divide-carbon-950/10">
                {data.cajeros.map(([n, e]) => (
                  <tr key={n}><td className="py-2 font-semibold text-carbon-800">{n}</td><td className="text-right tabular-nums">{e.tickets}</td><td className="text-right tabular-nums">${money(e.desc)}</td><td className="text-right tabular-nums font-semibold">${money(e.ventas)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
