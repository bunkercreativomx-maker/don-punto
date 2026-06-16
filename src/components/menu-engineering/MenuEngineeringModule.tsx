import { useState, useMemo } from 'react';
import { Plus, Trash2, Star, TrendingDown, Eye, Frown, Target, Edit3, Save, X, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface MenuDish {
  id: string;
  nombre: string;
  ventas: number;
  costo: number;
  pvp: number;
  categoria: string;
}

type Classification = 'ESTRELLA' | 'VACA' | 'ENIGMA' | 'PERRO';

interface AnalyzedDish extends MenuDish {
  margenContribucion: number;
  porcentajeCosto: number;
  totalVentas: number;
  totalMC: number;
  indicePopularidad: number;
  clasificacionRentabilidad: 'ALTO' | 'BAJO';
  clasificacionPopularidad: 'ALTO' | 'BAJO';
  clasificacion: Classification;
}

const CLASSIFICATION_META: Record<Classification, { color: string; bg: string; border: string; icon: typeof Star; desc: string; action: string }> = {
  ESTRELLA: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: Star,
    desc: 'Alta rentabilidad · Alta popularidad',
    action: 'Mantén y promociona activamente',
  },
  VACA: {
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
    icon: TrendingDown,
    desc: 'Alta rentabilidad · Baja popularidad',
    action: 'Reposiciona en el menú, mejora visibilidad',
  },
  ENIGMA: {
    color: 'text-indigo-400',
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/30',
    icon: Eye,
    desc: 'Baja rentabilidad · Alta popularidad',
    action: 'Aumenta precio o reduce costo',
  },
  PERRO: {
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    icon: Frown,
    desc: 'Baja rentabilidad · Baja popularidad',
    action: 'Evalúa eliminar o rediseñar',
  },
};

const BLANK_DISH: Omit<MenuDish, 'id'> = { nombre: '', ventas: 0, costo: 0, pvp: 0, categoria: '' };

function useLocalDishes(): [MenuDish[], (d: MenuDish[]) => void] {
  const [dishes, setDishesState] = useState<MenuDish[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('donPuntoMenuEngineering') || '[]');
    } catch { return []; }
  });
  const setDishes = (d: MenuDish[]) => {
    setDishesState(d);
    localStorage.setItem('donPuntoMenuEngineering', JSON.stringify(d));
  };
  return [dishes, setDishes];
}

function classify(dishes: MenuDish[]): AnalyzedDish[] {
  if (!dishes.length) return [];
  const totalVentasAll = dishes.reduce((s, d) => s + d.ventas, 0);
  const weightedMC = dishes.map(d => (d.pvp - d.costo) * d.ventas);
  const totalMCAll = weightedMC.reduce((s, v) => s + v, 0);
  const avgMC = totalVentasAll > 0 ? totalMCAll / totalVentasAll : 0;
  const popularityThreshold = totalVentasAll > 0 ? 0.7 * (1 / dishes.length) : 0;

  return dishes.map((d) => {
    const mc = d.pvp - d.costo;
    const ip = totalVentasAll > 0 ? d.ventas / totalVentasAll : 0;
    const rentabilidad: 'ALTO' | 'BAJO' = mc >= avgMC ? 'ALTO' : 'BAJO';
    const popularidad: 'ALTO' | 'BAJO' = ip >= popularityThreshold ? 'ALTO' : 'BAJO';
    let clasificacion: Classification = 'PERRO';
    if (rentabilidad === 'ALTO' && popularidad === 'ALTO') clasificacion = 'ESTRELLA';
    else if (rentabilidad === 'ALTO' && popularidad === 'BAJO') clasificacion = 'VACA';
    else if (rentabilidad === 'BAJO' && popularidad === 'ALTO') clasificacion = 'ENIGMA';
    return {
      ...d,
      margenContribucion: mc,
      porcentajeCosto: d.pvp > 0 ? d.costo / d.pvp : 0,
      totalVentas: d.ventas * d.pvp,
      totalMC: mc * d.ventas,
      indicePopularidad: ip,
      clasificacionRentabilidad: rentabilidad,
      clasificacionPopularidad: popularidad,
      clasificacion,
    };
  });
}

export function MenuEngineeringModule() {
  const [dishes, setDishes] = useLocalDishes();
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<MenuDish, 'id'>>(BLANK_DISH);
  const [showForm, setShowForm] = useState(false);
  const [filterClass, setFilterClass] = useState<Classification | 'TODOS'>('TODOS');

  const analyzed = useMemo(() => classify(dishes), [dishes]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { ESTRELLA: 0, VACA: 0, ENIGMA: 0, PERRO: 0 };
    analyzed.forEach(d => c[d.clasificacion]++);
    return c;
  }, [analyzed]);

  const totals = useMemo(() => {
    const totalVentas = analyzed.reduce((s, d) => s + d.totalVentas, 0);
    const totalMC = analyzed.reduce((s, d) => s + d.totalMC, 0);
    const avgCostPct = analyzed.length > 0 ? analyzed.reduce((s, d) => s + d.porcentajeCosto, 0) / analyzed.length : 0;
    return { totalVentas, totalMC, avgCostPct };
  }, [analyzed]);

  const filtered = filterClass === 'TODOS' ? analyzed : analyzed.filter(d => d.clasificacion === filterClass);

  function openAdd() {
    setEditId(null);
    setForm(BLANK_DISH);
    setShowForm(true);
  }

  function openEdit(d: MenuDish) {
    setEditId(d.id);
    setForm({ nombre: d.nombre, ventas: d.ventas, costo: d.costo, pvp: d.pvp, categoria: d.categoria });
    setShowForm(true);
  }

  function saveForm() {
    if (!form.nombre.trim()) return;
    if (editId) {
      setDishes(dishes.map(d => d.id === editId ? { ...form, id: editId } : d));
    } else {
      setDishes([...dishes, { ...form, id: crypto.randomUUID() }]);
    }
    setShowForm(false);
    setForm(BLANK_DISH);
    setEditId(null);
  }

  function removeDish(id: string) {
    setDishes(dishes.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.entries(CLASSIFICATION_META) as [Classification, typeof CLASSIFICATION_META[Classification]][]).map(([cls, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={cls}
              onClick={() => setFilterClass(filterClass === cls ? 'TODOS' : cls)}
              className={clsx(
                'rounded-2xl border p-4 text-left transition-all',
                meta.bg, meta.border,
                filterClass === cls ? 'ring-2 ring-white/20' : 'opacity-80 hover:opacity-100'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon size={16} className={meta.color} />
                <span className={clsx('text-xs font-black uppercase tracking-widest', meta.color)}>{cls}</span>
              </div>
              <div className={clsx('text-3xl font-black', meta.color)}>{counts[cls]}</div>
              <div className="text-slate-500 text-xs mt-1">{meta.desc}</div>
            </button>
          );
        })}
      </div>

      {/* KPI row */}
      {dishes.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Platillos</div>
            <div className="text-2xl font-black text-white mt-1">{dishes.length}</div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">% Costo Promedio</div>
            <div className={clsx('text-2xl font-black mt-1', totals.avgCostPct > 0.35 ? 'text-rose-400' : 'text-emerald-400')}>
              {(totals.avgCostPct * 100).toFixed(1)}%
            </div>
          </div>
          <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">MC Total Ponderado</div>
            <div className="text-2xl font-black text-white mt-1">${totals.totalMC.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>
          </div>
        </div>
      )}

      {/* Header + add button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-slate-400 font-bold">
            {filterClass === 'TODOS' ? `${dishes.length} platillos` : `${filtered.length} ${filterClass}`}
          </span>
          {filterClass !== 'TODOS' && (
            <button onClick={() => setFilterClass('TODOS')} className="text-xs text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
              <X size={12} /> Quitar filtro
            </button>
          )}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-rose-500 hover:bg-rose-400 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-rose-500/20 active:scale-95"
        >
          <Plus size={16} strokeWidth={3} /> AGREGAR PLATILLO
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-white">{editId ? 'Editar Platillo' : 'Nuevo Platillo'}</span>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="col-span-2 lg:col-span-2">
              <label className="block text-xs text-slate-500 font-bold mb-1">NOMBRE</label>
              <input
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500/50"
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Guacamole"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">CATEGORÍA</label>
              <input
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500/50"
                value={form.categoria}
                onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                placeholder="Ej. Entradas"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">NO. VENTAS</label>
              <input
                type="number" min={0}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500/50"
                value={form.ventas || ''}
                onChange={e => setForm(f => ({ ...f, ventas: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">COSTO ($)</label>
              <input
                type="number" min={0}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500/50"
                value={form.costo || ''}
                onChange={e => setForm(f => ({ ...f, costo: parseFloat(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">PVP ($)</label>
              <input
                type="number" min={0}
                className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-rose-500/50"
                value={form.pvp || ''}
                onChange={e => setForm(f => ({ ...f, pvp: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-slate-500 hover:text-white text-sm font-bold transition-colors">Cancelar</button>
            <button onClick={saveForm} className="flex items-center gap-2 px-5 py-2 bg-rose-500 hover:bg-rose-400 text-white rounded-xl font-black text-sm transition-all active:scale-95">
              <Save size={14} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {dishes.length === 0 && !showForm && (
        <div className="text-center py-20 border border-white/5 rounded-2xl bg-slate-900/30">
          <Target size={40} className="mx-auto text-slate-600 mb-4" />
          <div className="text-slate-400 font-bold mb-2">Sin platillos registrados</div>
          <div className="text-slate-600 text-sm mb-6">Agrega tus platillos con sus ventas y costos para ver la clasificación automática.</div>
          <button onClick={openAdd} className="bg-rose-500 hover:bg-rose-400 text-white px-6 py-3 rounded-xl font-black text-sm transition-all shadow-lg shadow-rose-500/20">
            Agregar primer platillo
          </button>
        </div>
      )}

      {/* Matrix quadrant (when 4+ dishes) */}
      {analyzed.length >= 4 && (
        <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5">
          <div className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Matriz de Ingeniería</div>
          <div className="grid grid-cols-2 gap-3 aspect-square max-w-[480px] mx-auto">
            {(['ESTRELLA', 'ENIGMA', 'VACA', 'PERRO'] as Classification[]).map(cls => {
              const meta = CLASSIFICATION_META[cls];
              const Icon = meta.icon;
              const items = analyzed.filter(d => d.clasificacion === cls);
              return (
                <div key={cls} className={clsx('rounded-xl border p-3 flex flex-col', meta.bg, meta.border)}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className={meta.color} />
                    <span className={clsx('text-xs font-black', meta.color)}>{cls}</span>
                    <span className={clsx('ml-auto text-xs font-black', meta.color)}>{items.length}</span>
                  </div>
                  <div className="space-y-1 overflow-auto flex-1 no-scrollbar">
                    {items.map(d => (
                      <div key={d.id} className="text-xs text-slate-300 truncate">· {d.nombre}</div>
                    ))}
                    {items.length === 0 && <div className="text-xs text-slate-600 italic">Ninguno</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-2 text-center text-xs text-slate-600">
            <div>← Baja popularidad · Alta popularidad →</div>
            <div className="col-span-2 mt-1">↑ Alta rentabilidad · Baja rentabilidad ↓</div>
          </div>
        </div>
      )}

      {/* Dish table */}
      {filtered.length > 0 && (
        <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left">
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Platillo</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Ventas</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-right">PVP</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-right">Costo</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-right">MC</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-right">% Costo</th>
                <th className="px-4 py-3 text-xs font-black text-slate-500 uppercase tracking-widest text-center">Clase</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(d => {
                const meta = CLASSIFICATION_META[d.clasificacion];
                const Icon = meta.icon;
                return (
                  <tr key={d.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{d.nombre}</div>
                      {d.categoria && <div className="text-xs text-slate-500">{d.categoria}</div>}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{d.ventas.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">${d.pvp.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">${d.costo.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400 tabular-nums">${d.margenContribucion.toFixed(2)}</td>
                    <td className={clsx('px-4 py-3 text-right font-bold tabular-nums', d.porcentajeCosto > 0.35 ? 'text-rose-400' : 'text-slate-300')}>
                      {(d.porcentajeCosto * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black', meta.bg, meta.color)}>
                        <Icon size={10} />{d.clasificacion}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(d)} className="text-slate-500 hover:text-white transition-colors"><Edit3 size={14} /></button>
                        <button onClick={() => removeDish(d.id)} className="text-slate-500 hover:text-rose-400 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Recommendations */}
      {analyzed.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(Object.entries(CLASSIFICATION_META) as [Classification, typeof CLASSIFICATION_META[Classification]][]).map(([cls, meta]) => {
            const items = analyzed.filter(d => d.clasificacion === cls);
            if (!items.length) return null;
            return (
              <div key={cls} className={clsx('rounded-2xl border p-4', meta.bg, meta.border)}>
                <div className={clsx('text-xs font-black uppercase tracking-widest mb-2', meta.color)}>{cls} — {meta.action}</div>
                <div className="space-y-1">
                  {items.map(d => (
                    <div key={d.id} className="flex justify-between text-sm">
                      <span className="text-slate-300">{d.nombre}</span>
                      <span className="text-slate-500 tabular-nums">{d.ventas} ventas · MC ${d.margenContribucion.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
