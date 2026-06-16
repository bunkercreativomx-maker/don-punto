import { useState, useMemo } from 'react';
import { Plus, Trash2, Save, X, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

const DAYS = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'] as const;
type Day = typeof DAYS[number];

const CHANNELS = ['efectivo', 'visa', 'amex', 'credito', 'uberEats', 'rappi', 'didi'] as const;
type Channel = typeof CHANNELS[number];

const CHANNEL_LABELS: Record<Channel, string> = {
  efectivo: 'Efectivo',
  visa: 'Mastercard/Visa',
  amex: 'Amex',
  credito: 'Crédito',
  uberEats: 'Uber Eats',
  rappi: 'Rappi',
  didi: 'DiDi',
};

const CHANNEL_COLORS: Record<Channel, string> = {
  efectivo: 'text-emerald-400',
  visa: 'text-blue-400',
  amex: 'text-indigo-400',
  credito: 'text-purple-400',
  uberEats: 'text-green-400',
  rappi: 'text-rose-400',
  didi: 'text-orange-400',
};

type DayData = Record<Channel, number>;
type WeekData = Record<Day, DayData>;

interface WeekRecord {
  id: string;
  semana: string;
  periodo: string;
  proyeccion: number;
  ventas: WeekData;
  compras: { efectivo: number; tarjeta: number };
  nomina: number;
  gastosCorrientes: number;
  deuda: number;
}

function blankDayData(): DayData {
  return { efectivo: 0, visa: 0, amex: 0, credito: 0, uberEats: 0, rappi: 0, didi: 0 };
}

function blankWeekData(): WeekData {
  const d: Partial<WeekData> = {};
  DAYS.forEach(day => { d[day] = blankDayData(); });
  return d as WeekData;
}

function blankWeek(): Omit<WeekRecord, 'id'> {
  return {
    semana: '',
    periodo: '',
    proyeccion: 0,
    ventas: blankWeekData(),
    compras: { efectivo: 0, tarjeta: 0 },
    nomina: 0,
    gastosCorrientes: 0,
    deuda: 0,
  };
}

function useLocalWeeks(): [WeekRecord[], (d: WeekRecord[]) => void] {
  const [weeks, setState] = useState<WeekRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoFinanciero') || '[]'); } catch { return []; }
  });
  const setWeeks = (d: WeekRecord[]) => {
    setState(d);
    localStorage.setItem('donPuntoFinanciero', JSON.stringify(d));
  };
  return [weeks, setWeeks];
}

function dayTotal(d: DayData): number {
  return CHANNELS.reduce((s, c) => s + d[c], 0);
}

function weekTotal(w: WeekData): number {
  return DAYS.reduce((s, d) => s + dayTotal(w[d]), 0);
}

function channelWeekTotal(w: WeekData, ch: Channel): number {
  return DAYS.reduce((s, d) => s + w[d][ch], 0);
}

const F = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const FC = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function FinancialModule() {
  const [weeks, setWeeks] = useLocalWeeks();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Omit<WeekRecord, 'id'>>(blankWeek());
  const [expandedSection, setExpandedSection] = useState<'ventas' | 'egresos' | null>('ventas');

  const selected = useMemo(() => weeks.find(w => w.id === selectedId) || null, [weeks, selectedId]);

  function openNew() {
    setForm(blankWeek());
    setEditMode(true);
    setSelectedId(null);
  }

  function openEdit(w: WeekRecord) {
    setForm({ semana: w.semana, periodo: w.periodo, proyeccion: w.proyeccion, ventas: JSON.parse(JSON.stringify(w.ventas)), compras: { ...w.compras }, nomina: w.nomina, gastosCorrientes: w.gastosCorrientes, deuda: w.deuda });
    setSelectedId(w.id);
    setEditMode(true);
  }

  function saveWeek() {
    if (!form.semana.trim()) return;
    if (selectedId && weeks.find(w => w.id === selectedId)) {
      setWeeks(weeks.map(w => w.id === selectedId ? { ...form, id: selectedId } : w));
    } else {
      const newId = crypto.randomUUID();
      setWeeks([{ ...form, id: newId }, ...weeks]);
      setSelectedId(newId);
    }
    setEditMode(false);
  }

  function deleteWeek(id: string) {
    setWeeks(weeks.filter(w => w.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function setVentaVal(day: Day, ch: Channel, val: number) {
    setForm(f => ({ ...f, ventas: { ...f.ventas, [day]: { ...f.ventas[day], [ch]: val } } }));
  }

  // Computed for selected or form
  const displayWeek = editMode ? form : selected;

  const totalVentaSemana = displayWeek ? weekTotal(displayWeek.ventas) : 0;
  const totalCompras = displayWeek ? displayWeek.compras.efectivo + displayWeek.compras.tarjeta : 0;
  const totalEgresos = displayWeek ? displayWeek.nomina + displayWeek.gastosCorrientes + displayWeek.deuda : 0;
  const utilidad = totalVentaSemana - totalCompras - totalEgresos;
  const proyeccion = displayWeek?.proyeccion || 0;
  const cumplimiento = proyeccion > 0 ? totalVentaSemana / proyeccion : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: week list */}
      <div className="lg:col-span-3 flex flex-col gap-3">
        <button onClick={openNew} className="flex items-center justify-center gap-2 w-full bg-emerald-500 hover:bg-emerald-400 text-white py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95">
          <Plus size={15} strokeWidth={3} /> NUEVA SEMANA
        </button>

        {weeks.length === 0 ? (
          <div className="text-center py-10 border border-white/5 rounded-2xl bg-slate-900/30">
            <DollarSign size={28} className="mx-auto text-slate-600 mb-2" />
            <div className="text-slate-600 text-sm">Sin semanas registradas</div>
          </div>
        ) : (
          <div className="space-y-2 overflow-auto custom-scrollbar max-h-[calc(100vh-16rem)]">
            {weeks.map(w => {
              const total = weekTotal(w.ventas);
              const cum = w.proyeccion > 0 ? total / w.proyeccion : 0;
              return (
                <button
                  key={w.id}
                  onClick={() => { setSelectedId(w.id); setEditMode(false); }}
                  className={clsx(
                    'w-full text-left rounded-xl border p-3 transition-all group',
                    selectedId === w.id && !editMode ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-900/40 border-white/5 hover:border-white/10'
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-white text-sm">Sem. {w.semana}</div>
                    <button onClick={e => { e.stopPropagation(); deleteWeek(w.id); }} className="text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {w.periodo && <div className="text-xs text-slate-500 mb-2">{w.periodo}</div>}
                  <div className="text-base font-black text-emerald-400">${F(total)}</div>
                  {w.proyeccion > 0 && (
                    <div className={clsx('text-xs font-bold mt-0.5', cum >= 1 ? 'text-emerald-400' : 'text-amber-400')}>
                      {(cum * 100).toFixed(0)}% de proyección
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: detail/edit */}
      <div className="lg:col-span-9 space-y-5">
        {!displayWeek && !editMode && (
          <div className="text-center py-24 border border-white/5 rounded-2xl bg-slate-900/30">
            <DollarSign size={40} className="mx-auto text-slate-600 mb-4" />
            <div className="text-slate-500 font-bold">Selecciona una semana o crea una nueva</div>
          </div>
        )}

        {displayWeek && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between gap-4">
              <div>
                {editMode ? (
                  <div className="flex gap-3 flex-wrap">
                    <div>
                      <label className="block text-xs text-slate-500 font-bold mb-1">SEMANA #</label>
                      <input className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm w-28 focus:outline-none focus:border-emerald-500/50" value={form.semana} onChange={e => setForm(f => ({ ...f, semana: e.target.value }))} placeholder="Ej. 43" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 font-bold mb-1">PERÍODO</label>
                      <input className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm w-52 focus:outline-none focus:border-emerald-500/50" value={form.periodo} onChange={e => setForm(f => ({ ...f, periodo: e.target.value }))} placeholder="Ej. 24 al 30 de julio" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 font-bold mb-1">PROYECCIÓN ($)</label>
                      <input type="number" min={0} className="bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm w-36 focus:outline-none focus:border-emerald-500/50" value={form.proyeccion || ''} onChange={e => setForm(f => ({ ...f, proyeccion: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  </div>
                ) : (
                  <div>
                    <h2 className="text-2xl font-black text-white">Semana {selected?.semana}</h2>
                    {selected?.periodo && <div className="text-slate-500 text-sm mt-0.5">{selected.periodo}</div>}
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                {editMode ? (
                  <>
                    <button onClick={() => setEditMode(false)} className="px-3 py-2 rounded-xl text-slate-500 hover:text-white text-sm font-bold transition-colors"><X size={16} /></button>
                    <button onClick={saveWeek} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl font-black text-sm transition-all"><Save size={14} /> Guardar</button>
                  </>
                ) : (
                  selected && <button onClick={() => openEdit(selected)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all">Editar</button>
                )}
              </div>
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4">
                <div className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Venta Total</div>
                <div className="text-2xl font-black text-emerald-400 mt-1">${F(totalVentaSemana)}</div>
                {proyeccion > 0 && (
                  <div className={clsx('text-xs font-bold mt-1 flex items-center gap-1', cumplimiento >= 1 ? 'text-emerald-400' : 'text-amber-400')}>
                    {cumplimiento >= 1 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {(cumplimiento * 100).toFixed(1)}% de ${F(proyeccion)}
                  </div>
                )}
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Compras</div>
                <div className="text-2xl font-black text-white mt-1">${F(totalCompras)}</div>
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
                <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Egresos</div>
                <div className="text-2xl font-black text-white mt-1">${F(totalEgresos)}</div>
              </div>
              <div className={clsx('rounded-2xl p-4 border', utilidad >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20')}>
                <div className={clsx('text-xs font-bold uppercase tracking-widest', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>Utilidad</div>
                <div className={clsx('text-2xl font-black mt-1', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>${F(utilidad)}</div>
              </div>
            </div>

            {/* Sales section */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedSection(s => s === 'ventas' ? null : 'ventas')}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-black text-white">Ventas Diarias por Canal</span>
                <span className="text-slate-500">{expandedSection === 'ventas' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>
              {expandedSection === 'ventas' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-t border-white/5">
                        <th className="px-4 py-2 text-left font-black text-slate-500 uppercase tracking-widest">Canal</th>
                        {DAYS.map(d => <th key={d} className="px-3 py-2 text-right font-black text-slate-500">{d.slice(0, 3)}</th>)}
                        <th className="px-4 py-2 text-right font-black text-slate-400">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {CHANNELS.map(ch => (
                        <tr key={ch} className="hover:bg-white/[0.02]">
                          <td className={clsx('px-4 py-2 font-bold', CHANNEL_COLORS[ch])}>{CHANNEL_LABELS[ch]}</td>
                          {DAYS.map(day => (
                            <td key={day} className="px-2 py-2 text-right">
                              {editMode ? (
                                <input
                                  type="number" min={0}
                                  value={form.ventas[day][ch] || ''}
                                  onChange={e => setVentaVal(day, ch, parseFloat(e.target.value) || 0)}
                                  className="w-20 bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-white text-xs text-right focus:outline-none focus:border-emerald-500/50 tabular-nums"
                                />
                              ) : (
                                <span className="text-slate-400 tabular-nums">{displayWeek.ventas[day][ch] > 0 ? `$${F(displayWeek.ventas[day][ch])}` : '—'}</span>
                              )}
                            </td>
                          ))}
                          <td className={clsx('px-4 py-2 text-right font-black tabular-nums', CHANNEL_COLORS[ch])}>
                            ${F(channelWeekTotal(displayWeek.ventas, ch))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10">
                        <td className="px-4 py-2 font-black text-slate-400 text-xs uppercase tracking-widest">TOTAL DÍA</td>
                        {DAYS.map(day => (
                          <td key={day} className="px-3 py-2 text-right font-black text-emerald-400 tabular-nums text-xs">
                            ${F(dayTotal(displayWeek.ventas[day]))}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-black text-emerald-400 tabular-nums">${F(totalVentaSemana)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Expenses section */}
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpandedSection(s => s === 'egresos' ? null : 'egresos')}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <span className="font-black text-white">Compras y Egresos</span>
                <span className="text-slate-500">{expandedSection === 'egresos' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </button>
              {expandedSection === 'egresos' && (
                <div className="p-5 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Compras de Insumos</div>
                    <div className="space-y-2">
                      {(['efectivo', 'tarjeta'] as const).map(method => (
                        <div key={method} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-slate-300 capitalize">{method === 'efectivo' ? 'Efectivo' : 'Tarjeta'}</span>
                          {editMode ? (
                            <input
                              type="number" min={0}
                              value={form.compras[method] || ''}
                              onChange={e => setForm(f => ({ ...f, compras: { ...f.compras, [method]: parseFloat(e.target.value) || 0 } }))}
                              className="w-32 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm text-right focus:outline-none focus:border-emerald-500/50 tabular-nums"
                            />
                          ) : (
                            <span className="text-slate-400 tabular-nums">${FC(displayWeek.compras[method])}</span>
                          )}
                        </div>
                      ))}
                      <div className="flex items-center justify-between border-t border-white/10 pt-2">
                        <span className="text-sm font-bold text-slate-300">Total Compras</span>
                        <span className="font-black text-white tabular-nums">${F(totalCompras)}</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Egresos Operativos</div>
                    <div className="space-y-2">
                      {(['nomina', 'gastosCorrientes', 'deuda'] as const).map(eg => {
                        const labels = { nomina: 'Nómina', gastosCorrientes: 'Gastos Corrientes', deuda: 'Deuda' };
                        return (
                          <div key={eg} className="flex items-center justify-between gap-3">
                            <span className="text-sm text-slate-300">{labels[eg]}</span>
                            {editMode ? (
                              <input
                                type="number" min={0}
                                value={form[eg] || ''}
                                onChange={e => setForm(f => ({ ...f, [eg]: parseFloat(e.target.value) || 0 }))}
                                className="w-32 bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm text-right focus:outline-none focus:border-emerald-500/50 tabular-nums"
                              />
                            ) : (
                              <span className="text-slate-400 tabular-nums">${FC(displayWeek[eg])}</span>
                            )}
                          </div>
                        );
                      })}
                      <div className="flex items-center justify-between border-t border-white/10 pt-2">
                        <span className="text-sm font-bold text-slate-300">Total Egresos</span>
                        <span className="font-black text-white tabular-nums">${F(totalEgresos)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
