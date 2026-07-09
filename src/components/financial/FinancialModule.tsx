import { useState, useMemo } from 'react';
import { Plus, Trash2, Save, TrendingUp, TrendingDown, DollarSign, ChevronDown, ChevronUp, Search, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { usePOS } from '../../hooks/usePOS';

// ── Tipos ──────────────────────────────────────────────
interface CustomExpense {
  id: string;
  concept: string;
  amount: number;
}

interface PeriodExpenses {
  luz: number;
  telefonica: number;
  agua: number;
  internet: number;
  renta: number;
  comprasInsumos: number;
  comprasEquipos: number;
  nomina: number;
  custom: CustomExpense[];
}

type DatePreset = 'today' | 'week' | 'month' | 'custom';

const FIXED_EXPENSES: { key: keyof PeriodExpenses; label: string }[] = [
  { key: 'luz',            label: 'Luz' },
  { key: 'telefonica',     label: 'Telefónica' },
  { key: 'agua',           label: 'Agua' },
  { key: 'internet',       label: 'Internet' },
  { key: 'renta',          label: 'Renta' },
  { key: 'comprasInsumos', label: 'Compras de insumos' },
  { key: 'comprasEquipos', label: 'Compras de equipos' },
  { key: 'nomina',         label: 'Nómina' },
];

const F = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const FC = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Helpers ────────────────────────────────────────────
function getPresetRange(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let from: Date;

  switch (preset) {
    case 'today':
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'week': {
      const dayOfWeek = now.getDay(); // 0=domingo
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Lunes = 0
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
      break;
    }
    case 'month':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      from = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { from, to };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Componente ─────────────────────────────────────────
export function FinancialModule() {
  const { transactions } = usePOS();

  // Date filter
  const [preset, setPreset] = useState<DatePreset>('month');
  const [customFrom, setCustomFrom] = useState(dateStr(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customTo, setCustomTo] = useState(dateStr(new Date()));

  // Expenses state (persisted in localStorage)
  const [expenses, setExpenses] = useState<PeriodExpenses>(() => {
    const saved = localStorage.getItem('donPuntoFinancialExpenses');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          luz: parsed.luz ?? 0,
          telefonica: parsed.telefonica ?? 0,
          agua: parsed.agua ?? 0,
          internet: parsed.internet ?? 0,
          renta: parsed.renta ?? 0,
          comprasInsumos: parsed.comprasInsumos ?? 0,
          comprasEquipos: parsed.comprasEquipos ?? 0,
          nomina: parsed.nomina ?? 0,
          custom: parsed.custom ?? [],
        };
      } catch { /* ignore */ }
    }
    return {
      luz: 0, telefonica: 0, agua: 0, internet: 0, renta: 0,
      comprasInsumos: 0, comprasEquipos: 0, nomina: 0, custom: [],
    };
  });

  const [newCustomConcept, setNewCustomConcept] = useState('');
  const [newCustomAmount, setNewCustomAmount] = useState('');

  // UI state
  const [expandedSection, setExpandedSection] = useState<'ventas' | 'gastos' | null>('ventas');

  // Persist expenses
  function saveExpenses(e: PeriodExpenses) {
    setExpenses(e);
    localStorage.setItem('donPuntoFinancialExpenses', JSON.stringify(e));
  }

  // Calculate date range
  const { from, to } = useMemo(() => {
    if (preset === 'custom') {
      return { from: new Date(customFrom + 'T00:00:00'), to: new Date(customTo + 'T23:59:59') };
    }
    return getPresetRange(preset);
  }, [preset, customFrom, customTo]);

  // Filter POS transactions by date range
  const filteredTxs = useMemo(() => {
    return transactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= from && d <= to;
    });
  }, [transactions, from, to]);

  // Sales summary
  const salesSummary = useMemo(() => {
    const total = filteredTxs.reduce((s, tx) => s + tx.amount, 0);
    const byDestination = filteredTxs.reduce((acc, tx) => {
      const dest = tx.destination || 'Tienda';
      acc[dest] = (acc[dest] || 0) + tx.amount;
      return acc;
    }, { Tienda: 0, Uber: 0, Didi: 0, Rappi: 0 } as Record<string, number>);

    return { total, byDestination };
  }, [filteredTxs]);

  // Total expenses
  const totalExpenses = useMemo(() => {
    const fixed = expenses.luz + expenses.telefonica + expenses.agua + expenses.internet
      + expenses.renta + expenses.comprasInsumos + expenses.comprasEquipos + expenses.nomina;
    const customTotal = expenses.custom.reduce((s, e) => s + e.amount, 0);
    return fixed + customTotal;
  }, [expenses]);

  const utilidad = salesSummary.total - totalExpenses;
  const utilidadPct = salesSummary.total > 0 ? (utilidad / salesSummary.total) * 100 : 0;

  // ── Update fixed expense ──
  function updateFixed(key: keyof PeriodExpenses, val: number) {
    if (key === 'custom') return;
    saveExpenses({ ...expenses, [key]: val });
  }

  // ── Add custom expense ──
  function addCustomExpense() {
    const concept = newCustomConcept.trim();
    const amount = parseFloat(newCustomAmount);
    if (!concept || !amount || amount <= 0) return;
    const newExpense: CustomExpense = { id: crypto.randomUUID(), concept, amount };
    saveExpenses({ ...expenses, custom: [...expenses.custom, newExpense] });
    setNewCustomConcept('');
    setNewCustomAmount('');
  }

  function removeCustomExpense(id: string) {
    saveExpenses({ ...expenses, custom: expenses.custom.filter(e => e.id !== id) });
  }

  // ── Preset button ──
  function PresetBtn({ p, label }: { p: DatePreset; label: string }) {
    return (
      <button
        onClick={() => setPreset(p)}
        className={clsx(
          'px-4 py-2 rounded-xl text-xs font-bold transition-all border',
          preset === p
            ? 'bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20'
            : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white'
        )}
      >
        {label}
      </button>
    );
  }

  // ── Format range text ──
  const rangeText = `${from.toLocaleDateString('es-MX')} — ${to.toLocaleDateString('es-MX')}`;

  return (
    <div className="space-y-6">
      {/* ── Date Filter ── */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <Calendar size={16} className="text-emerald-400" />
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Período</span>
          <span className="text-xs text-slate-600 ml-2">{rangeText}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PresetBtn p="today" label="Hoy" />
          <PresetBtn p="week" label="Esta Semana" />
          <PresetBtn p="month" label="Este Mes" />
          <PresetBtn p="custom" label="Personalizado" />
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500/50"
              />
              <span className="text-slate-600 text-xs">a</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
          <div className="text-xs text-emerald-400 font-bold uppercase tracking-widest">Ventas</div>
          <div className="text-3xl font-black text-emerald-400 mt-1">${F(salesSummary.total)}</div>
          <div className="text-[10px] text-slate-500 mt-1 font-medium">{filteredTxs.length} transacciones</div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
          <div className="text-xs text-rose-400 font-bold uppercase tracking-widest">Gastos</div>
          <div className="text-3xl font-black text-rose-400 mt-1">${F(totalExpenses)}</div>
        </div>
        <div className={clsx('rounded-2xl p-5 border', utilidad >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20')}>
          <div className={clsx('text-xs font-bold uppercase tracking-widest', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            Utilidad
          </div>
          <div className={clsx('text-3xl font-black mt-1', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            ${F(utilidad)}
          </div>
          <div className={clsx('text-xs font-bold mt-1 flex items-center gap-1', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {utilidad >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {utilidadPct.toFixed(1)}%
          </div>
        </div>
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Transacciones</div>
          <div className="text-3xl font-black text-white mt-1">{filteredTxs.length}</div>
          <div className="text-[10px] text-slate-600 mt-1 font-medium">{filteredTxs.filter(tx => tx.amount > 0).length} con monto</div>
        </div>
      </div>

      {/* ── Ventas del POS ── */}
      <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => setExpandedSection(s => s === 'ventas' ? null : 'ventas')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <span className="font-black text-white">Ventas del Período (desde POS)</span>
          <span className="text-slate-500">{expandedSection === 'ventas' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>
        {expandedSection === 'ventas' && (
          <div className="px-5 pb-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {Object.entries(salesSummary.byDestination).map(([dest, amount]) => {
                const colors: Record<string, string> = {
                  Tienda: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
                  Uber: 'text-green-400 bg-green-500/10 border-green-500/20',
                  Didi: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
                  Rappi: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
                };
                return (
                  <div key={dest} className={clsx('rounded-xl border p-3', colors[dest] || 'text-slate-400 bg-slate-800/30 border-white/5')}>
                    <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{dest}</div>
                    <div className="font-black text-sm mt-0.5">${F(amount)}</div>
                  </div>
                );
              })}
            </div>

            {/* Transaction table */}
            {filteredTxs.length > 0 ? (
              <div className="overflow-x-auto max-h-64 overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-left py-2 pr-3 font-bold text-slate-500">Fecha</th>
                      <th className="text-left py-2 pr-3 font-bold text-slate-500">Cliente</th>
                      <th className="text-left py-2 pr-3 font-bold text-slate-500">Origen</th>
                      <th className="text-right py-2 font-bold text-slate-500">Monto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredTxs.map(tx => (
                      <tr key={tx.id} className="hover:bg-white/[0.02]">
                        <td className="py-1.5 pr-3 text-slate-400 tabular-nums">
                          {new Date(tx.date).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' })}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-300 truncate max-w-[120px]">{tx.customerName || '—'}</td>
                        <td className="py-1.5 pr-3">
                          <span className={clsx(
                            'text-[10px] font-bold px-1.5 py-0.5 rounded',
                            tx.destination === 'Tienda' && 'text-indigo-400 bg-indigo-500/10',
                            tx.destination === 'Uber' && 'text-green-400 bg-green-500/10',
                            tx.destination === 'Didi' && 'text-orange-400 bg-orange-500/10',
                            tx.destination === 'Rappi' && 'text-rose-400 bg-rose-500/10',
                          )}>
                            {tx.destination}
                          </span>
                        </td>
                        <td className="py-1.5 text-right font-bold text-emerald-400 tabular-nums">${F(tx.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600 text-sm">
                <Search size={24} className="mx-auto mb-2 opacity-30" />
                No hay ventas en este período
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Gastos ── */}
      <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => setExpandedSection(s => s === 'gastos' ? null : 'gastos')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
        >
          <span className="font-black text-white">Gastos del Período</span>
          <span className="text-slate-500">{expandedSection === 'gastos' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
        </button>
        {expandedSection === 'gastos' && (
          <div className="px-5 pb-5 space-y-4">
            {/* Fixed expenses */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {FIXED_EXPENSES.map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between gap-3 bg-slate-950/40 rounded-xl px-4 py-3 border border-white/5">
                  <span className="text-sm font-bold text-slate-300">{label}</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      value={(expenses[key] as number) || ''}
                      onChange={e => updateFixed(key, parseFloat(e.target.value) || 0)}
                      className="w-36 bg-slate-800 border border-white/10 rounded-xl px-3 pl-6 py-2 text-white text-sm text-right focus:outline-none focus:border-emerald-500/50 tabular-nums"
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Custom expenses */}
            {expenses.custom.length > 0 && (
              <div className="border-t border-white/5 pt-4">
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Gastos Extras</div>
                <div className="space-y-2">
                  {expenses.custom.map(ce => (
                    <div key={ce.id} className="flex items-center justify-between gap-3 bg-amber-500/5 rounded-xl px-4 py-3 border border-amber-500/10">
                      <span className="text-sm font-bold text-amber-300">{ce.concept}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-amber-400 tabular-nums">${FC(ce.amount)}</span>
                        <button onClick={() => removeCustomExpense(ce.id)} className="text-slate-600 hover:text-rose-400 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add custom expense */}
            <div className="border-t border-white/5 pt-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="flex-1 w-full">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Concepto</label>
                  <input
                    type="text"
                    value={newCustomConcept}
                    onChange={e => setNewCustomConcept(e.target.value)}
                    placeholder="Ej. Reparación equipo"
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="w-full sm:w-36">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Monto</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      value={newCustomAmount}
                      onChange={e => setNewCustomAmount(e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 pl-6 py-2 text-white text-sm text-right focus:outline-none focus:border-amber-500/50 tabular-nums"
                      onKeyDown={e => e.key === 'Enter' && addCustomExpense()}
                    />
                  </div>
                </div>
                <button
                  onClick={addCustomExpense}
                  disabled={!newCustomConcept.trim() || !parseFloat(newCustomAmount) || parseFloat(newCustomAmount) <= 0}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-black text-sm transition-all active:scale-95"
                >
                  <Plus size={15} strokeWidth={3} /> AGREGAR GASTO
                </button>
              </div>
            </div>

            {/* Expenses total */}
            <div className="flex items-center justify-between border-t border-white/10 pt-4">
              <span className="text-base font-bold text-slate-300">Total Gastos</span>
              <span className="text-xl font-black text-rose-400 tabular-nums">${F(totalExpenses)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Resumen Final ── */}
      <div className={clsx(
        'rounded-2xl border p-6',
        utilidad >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'
      )}>
        <div className="text-center">
          <div className="text-xs font-black uppercase tracking-widest mb-1 text-slate-500">RESULTADO DEL PERÍODO</div>
          <div className="text-sm text-slate-400 mb-4">{rangeText}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
            <div>
              <div className="text-xs text-slate-500 font-bold uppercase">Ventas</div>
              <div className="text-2xl font-black text-emerald-400">${F(salesSummary.total)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 font-bold uppercase">Gastos</div>
              <div className="text-2xl font-black text-rose-400">${F(totalExpenses)}</div>
            </div>
            <div>
              <div className={clsx('text-xs font-bold uppercase', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                {utilidad >= 0 ? 'GANANCIA' : 'PÉRDIDA'}
              </div>
              <div className={clsx('text-2xl font-black', utilidad >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                ${F(Math.abs(utilidad))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
