import { useMemo, useState } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { useCalculator } from '../../hooks/useCalculator';
import { Sparkles, Loader2, Trophy, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

interface RankedProduct {
  id: string;
  name: string;
  quantity: number;
  rank: number;
}

function useMonthlyRanking() {
  const { transactions } = usePOS();
  const { rows } = useCalculator();

  return useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const monthTxs = transactions.filter(tx => {
      const d = new Date(tx.date);
      return d >= start && d <= end;
    });

    // Sum quantities per rowId
    const salesMap = new Map<string, number>();
    monthTxs.forEach(tx => {
      tx.items?.forEach(item => {
        salesMap.set(item.rowId, (salesMap.get(item.rowId) || 0) + item.quantity);
      });
    });

    const rowsById = new Map(rows.map(r => [r.id, r]));

    // Build ranked list from products that actually sold
    const ranked: RankedProduct[] = [];
    salesMap.forEach((qty, rowId) => {
      const row = rowsById.get(rowId);
      if (row) ranked.push({ id: rowId, name: row.name, quantity: qty, rank: 0 });
    });
    ranked.sort((a, b) => b.quantity - a.quantity);
    ranked.forEach((p, i) => { p.rank = i + 1; });

    const top10 = ranked.slice(0, 10);
    const crack    = top10.slice(0, 3);
    const diamante = top10.slice(3, 6);
    const corredor = top10.slice(6, 10);

    // Rezagados: all menu items with < 5 sales (including 0)
    const rezagados: RankedProduct[] = rows
      .map(r => ({ id: r.id, name: r.name, quantity: salesMap.get(r.id) || 0, rank: 0 }))
      .filter(p => p.quantity < 5)
      .sort((a, b) => a.quantity - b.quantity);

    return { crack, diamante, corredor, rezagados, top10 };
  }, [transactions, rows]);
}

const SECTIONS = [
  {
    key: 'crack' as const,
    label: 'CRACK',
    range: '#1 · #2 · #3',
    desc: 'Los 3 más vendidos del mes',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    dot: 'bg-amber-500',
  },
  {
    key: 'diamante' as const,
    label: 'DIAMANTE',
    range: '#4 · #5 · #6',
    desc: 'Posiciones medias altas',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    dot: 'bg-cyan-500',
  },
  {
    key: 'corredor' as const,
    label: 'CORREDOR',
    range: '#7 · #8 · #9 · #10',
    desc: 'Posiciones medias bajas',
    color: 'text-violet-400',
    bg: 'bg-violet-500/10',
    border: 'border-violet-500/30',
    dot: 'bg-violet-500',
  },
  {
    key: 'rezagados' as const,
    label: 'REZAGADO',
    range: '< 5 ventas',
    desc: 'Necesitan atención',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    dot: 'bg-rose-500',
  },
] as const;

interface ComboSuggestion {
  nombre: string;
  productos: string[];
  precio: number;
  razon: string;
}

const COMBO_USAGE_KEY = 'donPuntoComboUsage';

function getComboUsage(): { month: string; count: number } {
  try {
    return JSON.parse(localStorage.getItem(COMBO_USAGE_KEY) || '{}');
  } catch { return { month: '', count: 0 }; }
}

function incrementComboUsage(monthKey: string) {
  const usage = getComboUsage();
  const count = usage.month === monthKey ? usage.count + 1 : 1;
  localStorage.setItem(COMBO_USAGE_KEY, JSON.stringify({ month: monthKey, count }));
  return count;
}

export function MenuEngineeringModule() {
  const { crack, diamante, corredor, rezagados, top10 } = useMonthlyRanking();
  const [combos, setCombos] = useState<ComboSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const monthLabel = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
  const hasData = top10.length > 0;

  const usage = getComboUsage();
  const usosRestantes = usage.month === monthKey ? Math.max(0, 2 - usage.count) : 2;

  const sectionData: Record<typeof SECTIONS[number]['key'], RankedProduct[]> = {
    crack,
    diamante,
    corredor,
    rezagados,
  };

  async function generateCombos() {
    if (!hasData || usosRestantes === 0) return;
    setLoading(true);
    setError(null);
    setCombos([]);
    try {
      const res = await fetch('/api/combos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: top10.map(p => ({ name: p.name, quantity: p.quantity, price: 0 })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      incrementComboUsage(monthKey);
      setCombos(data.combos || []);
    } catch {
      setError('No se pudo conectar con el generador. Verifica la configuración del servidor.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-black text-slate-500 uppercase tracking-widest">
          Período: {monthLabel}
        </span>
        {hasData && (
          <span className="text-xs text-slate-600 font-bold">
            {top10.length} productos en ranking · {rezagados.length} rezagados
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="text-center py-20 border border-white/5 rounded-2xl bg-slate-900/30">
          <Trophy size={40} className="mx-auto text-slate-600 mb-4" />
          <div className="text-slate-400 font-bold mb-2">Sin ventas registradas este mes</div>
          <div className="text-slate-600 text-sm">
            Registra ventas en el Punto de Venta para ver el Radar de Menú.
          </div>
        </div>
      ) : (
        <>
          {/* 4 sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {SECTIONS.map(section => {
              const items = sectionData[section.key];
              return (
                <div key={section.key} className={clsx('rounded-2xl border p-5', section.bg, section.border)}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className={clsx('text-xs font-black uppercase tracking-widest', section.color)}>
                        {section.label}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">{section.desc}</div>
                    </div>
                    <span className={clsx(
                      'text-[10px] font-black px-2.5 py-1 rounded-full border',
                      section.bg, section.color, section.border
                    )}>
                      {section.range}
                    </span>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-slate-600 text-sm italic py-3">
                      Sin productos en esta sección este mes.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {items.map(product => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 bg-slate-950/40 rounded-xl px-3 py-2.5"
                        >
                          {section.key !== 'rezagados' ? (
                            <div className={clsx(
                              'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0',
                              section.dot
                            )}>
                              {product.rank}
                            </div>
                          ) : (
                            <div className={clsx(
                              'w-7 h-7 rounded-full flex items-center justify-center shrink-0',
                              section.bg, section.border, 'border'
                            )}>
                              <div className={clsx('w-2 h-2 rounded-full', section.dot)} />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white truncate">{product.name}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className={clsx('text-sm font-black tabular-nums', section.color)}>
                              {product.quantity}
                            </div>
                            <div className="text-[10px] text-slate-600 font-bold">ventas</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* AI Combo Generator */}
          <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-sm font-black text-white">Generador de Combos con IA</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Basado en tus top {top10.length} productos del mes &nbsp;·&nbsp;
                  <span className={usosRestantes === 0 ? 'text-rose-400' : 'text-indigo-400'}>
                    {usosRestantes} {usosRestantes === 1 ? 'uso restante' : 'usos restantes'} este mes
                  </span>
                </div>
              </div>
              <button
                onClick={generateCombos}
                disabled={loading || usosRestantes === 0}
                className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                title={usosRestantes === 0 ? 'Límite alcanzado — disponible el próximo mes' : ''}
              >
                {loading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Sparkles size={16} />}
                {loading ? 'Generando...' : usosRestantes === 0 ? 'Límite del mes' : 'Generar Combos'}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-3 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            {combos.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {combos.map((combo, i) => (
                  <div
                    key={i}
                    className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-black text-white text-sm leading-snug">{combo.nombre}</div>
                      <div className="text-indigo-300 font-black text-sm shrink-0 bg-indigo-500/20 px-2 py-0.5 rounded-lg">
                        ${combo.precio}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {combo.productos.map((p, j) => (
                        <span
                          key={j}
                          className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full"
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-slate-400 leading-relaxed">{combo.razon}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
