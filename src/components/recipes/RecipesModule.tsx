import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit3, Save, X, BookOpen, ChevronLeft, ChefHat } from 'lucide-react';
import clsx from 'clsx';

interface Ingredient {
  id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  costoUnitario: number;
}

interface Recipe {
  id: string;
  nombre: string;
  familia: string;
  porciones: number;
  pvp: number;
  tiempoMin: number;
  equipo: string;
  conservacion: string;
  ingredientes: Ingredient[];
}

const BLANK_RECIPE: Omit<Recipe, 'id'> = {
  nombre: '', familia: '', porciones: 1, pvp: 0, tiempoMin: 0, equipo: '', conservacion: '', ingredientes: [],
};

const BLANK_ING: Omit<Ingredient, 'id'> = { nombre: '', cantidad: 0, unidad: 'KG', costoUnitario: 0 };

const UNIDADES = ['KG', 'GR', 'L', 'ML', 'PZ', 'TZA', 'CDTA', 'CDA', 'PIEZA'];
const FAMILIAS = ['Entradas', 'Sopas', 'Ensaladas', 'Platos Fuertes', 'Postres', 'Bebidas', 'Bases', 'Salsas', 'Desayunos', 'Guarniciones', 'Otro'];

function useLocalRecipes(): [Recipe[], (d: Recipe[]) => void] {
  const [recipes, setState] = useState<Recipe[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoRecetario') || '[]'); } catch { return []; }
  });
  const setRecipes = (d: Recipe[]) => {
    setState(d);
    localStorage.setItem('donPuntoRecetario', JSON.stringify(d));
  };
  return [recipes, setRecipes];
}

function totalCost(r: Recipe): number {
  return r.ingredientes.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0);
}

function costPct(r: Recipe): number {
  const tc = totalCost(r);
  return r.pvp > 0 ? tc / r.pvp : 0;
}

export function RecipesModule() {
  const [recipes, setRecipes] = useLocalRecipes();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<Omit<Recipe, 'id'>>(BLANK_RECIPE);
  const [ingForm, setIngForm] = useState<Omit<Ingredient, 'id'>>(BLANK_ING);
  const [showIngForm, setShowIngForm] = useState(false);
  const [editIngId, setEditIngId] = useState<string | null>(null);
  const [filterFamilia, setFilterFamilia] = useState<string>('TODOS');

  const selected = useMemo(() => recipes.find(r => r.id === selectedId) || null, [recipes, selectedId]);

  const familias = useMemo(() => ['TODOS', ...Array.from(new Set(recipes.map(r => r.familia).filter(Boolean)))], [recipes]);

  const filteredRecipes = filterFamilia === 'TODOS' ? recipes : recipes.filter(r => r.familia === filterFamilia);

  const F = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function openNew() {
    setForm(BLANK_RECIPE);
    setEditMode(true);
    setSelectedId(null);
  }

  function openEdit(r: Recipe) {
    setForm({ nombre: r.nombre, familia: r.familia, porciones: r.porciones, pvp: r.pvp, tiempoMin: r.tiempoMin, equipo: r.equipo, conservacion: r.conservacion, ingredientes: [...r.ingredientes] });
    setEditMode(true);
    setSelectedId(r.id);
  }

  function saveRecipe() {
    if (!form.nombre.trim()) return;
    if (selectedId && recipes.find(r => r.id === selectedId)) {
      setRecipes(recipes.map(r => r.id === selectedId ? { ...form, id: selectedId } : r));
    } else {
      const newId = crypto.randomUUID();
      setRecipes([...recipes, { ...form, id: newId }]);
      setSelectedId(newId);
    }
    setEditMode(false);
  }

  function deleteRecipe(id: string) {
    setRecipes(recipes.filter(r => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function addIngredient() {
    if (!ingForm.nombre.trim()) return;
    const newIng: Ingredient = { ...ingForm, id: crypto.randomUUID() };
    if (editIngId) {
      setForm(f => ({ ...f, ingredientes: f.ingredientes.map(i => i.id === editIngId ? newIng : i) }));
      setEditIngId(null);
    } else {
      setForm(f => ({ ...f, ingredientes: [...f.ingredientes, newIng] }));
    }
    setIngForm(BLANK_ING);
    setShowIngForm(false);
  }

  function removeIngredient(id: string) {
    setForm(f => ({ ...f, ingredientes: f.ingredientes.filter(i => i.id !== id) }));
  }

  function openEditIng(ing: Ingredient) {
    setIngForm({ nombre: ing.nombre, cantidad: ing.cantidad, unidad: ing.unidad, costoUnitario: ing.costoUnitario });
    setEditIngId(ing.id);
    setShowIngForm(true);
  }

  const recipeTotal = (r: Omit<Recipe, 'id'>) => r.ingredientes.reduce((s, i) => s + i.cantidad * i.costoUnitario, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
      {/* Left: recipe list */}
      <div className={clsx('lg:col-span-4 flex flex-col gap-4', editMode && selectedId === null ? 'hidden lg:flex' : '')}>
        <div className="flex items-center justify-between">
          <select
            value={filterFamilia}
            onChange={e => setFilterFamilia(e.target.value)}
            className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none"
          >
            {familias.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={openNew} className="flex items-center gap-2 bg-orange-500 hover:bg-orange-400 text-white px-4 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-orange-500/20 active:scale-95">
            <Plus size={15} strokeWidth={3} /> NUEVA
          </button>
        </div>

        {filteredRecipes.length === 0 ? (
          <div className="text-center py-16 border border-white/5 rounded-2xl bg-slate-900/30 flex-1">
            <ChefHat size={36} className="mx-auto text-slate-600 mb-3" />
            <div className="text-slate-500 font-bold mb-1">Sin recetas</div>
            <div className="text-slate-600 text-sm">Crea tu primer receta estándar.</div>
          </div>
        ) : (
          <div className="space-y-2 overflow-auto custom-scrollbar">
            {filteredRecipes.map(r => {
              const tc = totalCost(r);
              const cp = costPct(r);
              return (
                <button
                  key={r.id}
                  onClick={() => { setSelectedId(r.id); setEditMode(false); }}
                  className={clsx(
                    'w-full text-left rounded-xl border p-3 transition-all',
                    selectedId === r.id ? 'bg-orange-500/10 border-orange-500/30' : 'bg-slate-900/40 border-white/5 hover:border-white/10'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-white text-sm">{r.nombre}</div>
                      {r.familia && <div className="text-xs text-slate-500 mt-0.5">{r.familia}</div>}
                    </div>
                    <div className={clsx('text-xs font-black px-2 py-0.5 rounded-full shrink-0', cp > 0.35 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400')}>
                      {(cp * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-slate-500">
                    <span>{r.ingredientes.length} ingredientes</span>
                    <span>Costo: ${F(tc)}</span>
                    {r.pvp > 0 && <span>PVP: ${F(r.pvp)}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: detail / edit */}
      <div className="lg:col-span-8">
        {/* View mode */}
        {selected && !editMode && (
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-black text-white">{selected.nombre}</div>
                {selected.familia && <div className="text-slate-500 text-sm mt-1">{selected.familia}</div>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selected)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-all">
                  <Edit3 size={14} /> Editar
                </button>
                <button onClick={() => deleteRecipe(selected.id)} className="flex items-center gap-1.5 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-sm font-bold transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Info pills */}
            <div className="flex flex-wrap gap-2 text-xs">
              {selected.porciones > 1 && <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full">{selected.porciones} porciones</span>}
              {selected.tiempoMin > 0 && <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full">{selected.tiempoMin} min</span>}
              {selected.equipo && <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full">{selected.equipo}</span>}
              {selected.conservacion && <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full">🧊 {selected.conservacion}</span>}
            </div>

            {/* Cost KPIs */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500 font-bold uppercase">Costo Total</div>
                <div className="text-xl font-black text-white mt-1">${F(totalCost(selected))}</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                <div className="text-xs text-slate-500 font-bold uppercase">PVP</div>
                <div className="text-xl font-black text-white mt-1">{selected.pvp > 0 ? `$${F(selected.pvp)}` : '—'}</div>
              </div>
              <div className={clsx('rounded-xl p-3 text-center', costPct(selected) > 0.35 ? 'bg-rose-500/10' : 'bg-emerald-500/10')}>
                <div className={clsx('text-xs font-bold uppercase', costPct(selected) > 0.35 ? 'text-rose-400' : 'text-emerald-400')}>% Costo</div>
                <div className={clsx('text-xl font-black mt-1', costPct(selected) > 0.35 ? 'text-rose-400' : 'text-emerald-400')}>
                  {selected.pvp > 0 ? `${(costPct(selected) * 100).toFixed(1)}%` : '—'}
                </div>
              </div>
            </div>

            {/* Ingredient table */}
            {selected.ingredientes.length > 0 && (
              <div>
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Ingredientes</div>
                <div className="rounded-xl overflow-hidden border border-white/5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/30 border-b border-white/5">
                        <th className="px-3 py-2 text-left text-xs font-black text-slate-500">Ingrediente</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Cantidad</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">U.</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Costo Unit.</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selected.ingredientes.map(i => (
                        <tr key={i.id} className="hover:bg-white/[0.02]">
                          <td className="px-3 py-2 text-slate-300">{i.nombre}</td>
                          <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{i.cantidad}</td>
                          <td className="px-3 py-2 text-right text-slate-500 text-xs">{i.unidad}</td>
                          <td className="px-3 py-2 text-right text-slate-400 tabular-nums">${F(i.costoUnitario)}</td>
                          <td className="px-3 py-2 text-right font-bold text-white tabular-nums">${F(i.cantidad * i.costoUnitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-black text-slate-500 uppercase tracking-widest">TOTAL</td>
                        <td className="px-3 py-2 text-right font-black text-orange-400 tabular-nums">${F(totalCost(selected))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit mode */}
        {editMode && (
          <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 space-y-5">
            <div className="flex items-center justify-between">
              <span className="font-black text-white text-lg">{selectedId && recipes.find(r => r.id === selectedId) ? 'Editar Receta' : 'Nueva Receta'}</span>
              <button onClick={() => setEditMode(false)} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
            </div>

            {/* Basic info */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="col-span-2 lg:col-span-2">
                <label className="block text-xs text-slate-500 font-bold mb-1">NOMBRE DE LA RECETA</label>
                <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Chilaquiles Verdes con Chorizo" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold mb-1">FAMILIA</label>
                <input list="familias-list" className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.familia} onChange={e => setForm(f => ({ ...f, familia: e.target.value }))} placeholder="Ej. Desayunos" />
                <datalist id="familias-list">{FAMILIAS.map(f => <option key={f} value={f} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold mb-1">PVP ($)</label>
                <input type="number" min={0} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.pvp || ''} onChange={e => setForm(f => ({ ...f, pvp: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold mb-1">PORCIONES</label>
                <input type="number" min={1} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.porciones || ''} onChange={e => setForm(f => ({ ...f, porciones: parseInt(e.target.value) || 1 }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold mb-1">TIEMPO (min)</label>
                <input type="number" min={0} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.tiempoMin || ''} onChange={e => setForm(f => ({ ...f, tiempoMin: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 font-bold mb-1">EQUIPO PRINCIPAL</label>
                <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.equipo} onChange={e => setForm(f => ({ ...f, equipo: e.target.value }))} placeholder="Ej. Estufa, Freidora" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 font-bold mb-1">CONSERVACIÓN</label>
                <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-orange-500/50" value={form.conservacion} onChange={e => setForm(f => ({ ...f, conservacion: e.target.value }))} placeholder="Ej. Refrigerar hasta 3 días en recipiente hermético" />
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-black text-slate-500 uppercase tracking-widest">Ingredientes</div>
                <button onClick={() => { setIngForm(BLANK_ING); setEditIngId(null); setShowIngForm(true); }} className="text-xs flex items-center gap-1.5 text-orange-400 hover:text-orange-300 font-bold transition-colors">
                  <Plus size={13} strokeWidth={3} /> Agregar
                </button>
              </div>

              {showIngForm && (
                <div className="bg-slate-800/50 rounded-xl p-3 mb-3 space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 font-bold mb-1">INGREDIENTE</label>
                      <input className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500/50" value={ingForm.nombre} onChange={e => setIngForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Tomate verde" />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 font-bold mb-1">CANTIDAD</label>
                      <input type="number" min={0} step={0.001} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500/50" value={ingForm.cantidad || ''} onChange={e => setIngForm(f => ({ ...f, cantidad: parseFloat(e.target.value) || 0 }))} />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 font-bold mb-1">UNIDAD</label>
                      <select className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500/50" value={ingForm.unidad} onChange={e => setIngForm(f => ({ ...f, unidad: e.target.value }))}>
                        {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-slate-500 font-bold mb-1">COSTO UNITARIO ($/{ingForm.unidad})</label>
                      <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-orange-500/50" value={ingForm.costoUnitario || ''} onChange={e => setIngForm(f => ({ ...f, costoUnitario: parseFloat(e.target.value) || 0 }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowIngForm(false)} className="text-xs text-slate-500 hover:text-white px-3 py-1.5 font-bold">Cancelar</button>
                    <button onClick={addIngredient} className="text-xs flex items-center gap-1.5 bg-orange-500 hover:bg-orange-400 text-white px-3 py-1.5 rounded-lg font-black transition-all">
                      <Save size={12} /> Guardar
                    </button>
                  </div>
                </div>
              )}

              {form.ingredientes.length > 0 && (
                <div className="rounded-xl overflow-hidden border border-white/5 mb-3">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800/30 border-b border-white/5">
                        <th className="px-3 py-2 text-left text-xs font-black text-slate-500">Ingrediente</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Cant.</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">U.</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Costo/U.</th>
                        <th className="px-3 py-2 text-right text-xs font-black text-slate-500">Subtotal</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {form.ingredientes.map(i => (
                        <tr key={i.id} className="group">
                          <td className="px-3 py-2 text-slate-300">{i.nombre}</td>
                          <td className="px-3 py-2 text-right text-slate-400 tabular-nums">{i.cantidad}</td>
                          <td className="px-3 py-2 text-right text-slate-500 text-xs">{i.unidad}</td>
                          <td className="px-3 py-2 text-right text-slate-400 tabular-nums">${i.costoUnitario}</td>
                          <td className="px-3 py-2 text-right font-bold text-white tabular-nums">${F(i.cantidad * i.costoUnitario)}</td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEditIng(i)} className="text-slate-500 hover:text-white transition-colors"><Edit3 size={12} /></button>
                              <button onClick={() => removeIngredient(i.id)} className="text-slate-500 hover:text-rose-400 transition-colors"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10">
                        <td colSpan={4} className="px-3 py-2 text-right text-xs font-black text-slate-500 uppercase tracking-widest">TOTAL COSTO</td>
                        <td className="px-3 py-2 text-right font-black text-orange-400 tabular-nums">${F(recipeTotal(form))}</td>
                        <td />
                      </tr>
                      {form.pvp > 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right text-xs font-black text-slate-500 uppercase tracking-widest">% COSTO</td>
                          <td className={clsx('px-3 py-2 text-right font-black tabular-nums', (recipeTotal(form) / form.pvp) > 0.35 ? 'text-rose-400' : 'text-emerald-400')}>
                            {((recipeTotal(form) / form.pvp) * 100).toFixed(1)}%
                          </td>
                          <td />
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={() => setEditMode(false)} className="px-4 py-2 rounded-xl text-slate-500 hover:text-white text-sm font-bold transition-colors">Cancelar</button>
              <button onClick={saveRecipe} className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white rounded-xl font-black text-sm transition-all active:scale-95">
                <Save size={14} /> Guardar Receta
              </button>
            </div>
          </div>
        )}

        {/* No selection */}
        {!selected && !editMode && (
          <div className="text-center py-24 border border-white/5 rounded-2xl bg-slate-900/30">
            <BookOpen size={40} className="mx-auto text-slate-600 mb-4" />
            <div className="text-slate-500 font-bold">Selecciona una receta o crea una nueva</div>
          </div>
        )}
      </div>
    </div>
  );
}
