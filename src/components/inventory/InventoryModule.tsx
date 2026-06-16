import { useState, useMemo } from 'react';
import { Plus, Trash2, Edit3, Save, X, Package, AlertTriangle, ShoppingCart, CheckCircle, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

interface Insumo {
  id: string;
  nombre: string;
  marca: string;
  grupo: string;
  proveedor: string;
  unidadCompra: string;
  rendimiento: number;
  unidadEstandar: string;
  costoCompra: number;
  area: string;
  existencia: number;
  consumoMinDiario: number;
  consumoMaxDiario: number;
  tiempoReposicion: number;
}

interface AnalyzedInsumo extends Insumo {
  costoUnitario: number;
  existenciaEstandar: number;
  consumoMedioDiario: number;
  existenciaMinima: number;
  existenciaMaxima: number;
  puntoPedido: number;
  costoInventario: number;
  status: 'ok' | 'warning' | 'critical';
  cantidadPedido: number;
  totalPedido: number;
}

const GRUPOS = ['Carnes, Pescados y Mariscos', 'Frutas y Verduras', 'Lácteos', 'Secos', 'Abarrotes', 'Limpieza', 'Bebidas', 'Otros'];
const AREAS = ['Cocina caliente', 'Cocina fría', 'Barra', 'Almacén', 'Limpieza', 'General'];
const UNIDADES_ESTANDAR = ['KG', 'L', 'PZ', 'ML', 'GR'];
const UNIDADES_COMPRA = ['KG', 'L', 'PZ', 'ML', 'GR', 'CJ', 'PAQ'];

const BLANK: Omit<Insumo, 'id'> = {
  nombre: '', marca: '', grupo: 'Secos', proveedor: '', unidadCompra: 'PZ',
  rendimiento: 1, unidadEstandar: 'KG', costoCompra: 0, area: 'General',
  existencia: 0, consumoMinDiario: 0, consumoMaxDiario: 0, tiempoReposicion: 7,
};

function useLocalInsumos(): [Insumo[], (d: Insumo[]) => void] {
  const [items, setItemsState] = useState<Insumo[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoInventario') || '[]'); } catch { return []; }
  });
  const setItems = (d: Insumo[]) => {
    setItemsState(d);
    localStorage.setItem('donPuntoInventario', JSON.stringify(d));
  };
  return [items, setItems];
}

function analyzeInsumo(i: Insumo): AnalyzedInsumo {
  const costoUnitario = i.rendimiento > 0 ? i.costoCompra / i.rendimiento : 0;
  const existenciaEstandar = i.existencia * i.rendimiento;
  const consumoMedioDiario = (i.consumoMinDiario + i.consumoMaxDiario) / 2;
  const existenciaMinima = i.consumoMinDiario * i.tiempoReposicion;
  const existenciaMaxima = i.consumoMaxDiario * i.tiempoReposicion;
  const puntoPedido = consumoMedioDiario * i.tiempoReposicion + existenciaMinima;
  const costoInventario = i.existencia * i.costoCompra;

  let status: 'ok' | 'warning' | 'critical' = 'ok';
  if (existenciaEstandar <= existenciaMinima) status = 'critical';
  else if (existenciaEstandar <= puntoPedido) status = 'warning';

  const cantidadPedido = status !== 'ok' ? Math.max(0, Math.ceil((existenciaMaxima - existenciaEstandar) / i.rendimiento)) : 0;
  const totalPedido = cantidadPedido * i.costoCompra;

  return { ...i, costoUnitario, existenciaEstandar, consumoMedioDiario, existenciaMinima, existenciaMaxima, puntoPedido, costoInventario, status, cantidadPedido, totalPedido };
}

const STATUS_META = {
  ok: { label: 'OK', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
  warning: { label: 'Pedir pronto', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: AlertTriangle },
  critical: { label: 'Crítico', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: AlertTriangle },
};

export function InventoryModule() {
  const [insumos, setInsumos] = useLocalInsumos();
  const [form, setForm] = useState<Omit<Insumo, 'id'>>(BLANK);
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeView, setActiveView] = useState<'inventario' | 'pedido'>('inventario');
  const [filterGrupo, setFilterGrupo] = useState<string>('TODOS');
  const [filterStatus, setFilterStatus] = useState<'all' | 'ok' | 'warning' | 'critical'>('all');

  const analyzed = useMemo(() => insumos.map(analyzeInsumo), [insumos]);

  const orderItems = useMemo(() => analyzed.filter(i => i.status !== 'ok'), [analyzed]);
  const totalInventory = useMemo(() => analyzed.reduce((s, i) => s + i.costoInventario, 0), [analyzed]);
  const totalOrder = useMemo(() => orderItems.reduce((s, i) => s + i.totalPedido, 0), [orderItems]);

  const grupos = useMemo(() => ['TODOS', ...Array.from(new Set(insumos.map(i => i.grupo)))], [insumos]);

  const filtered = useMemo(() => {
    let res = analyzed;
    if (filterGrupo !== 'TODOS') res = res.filter(i => i.grupo === filterGrupo);
    if (filterStatus !== 'all') res = res.filter(i => i.status === filterStatus);
    return res;
  }, [analyzed, filterGrupo, filterStatus]);

  function openAdd() {
    setEditId(null);
    setForm(BLANK);
    setShowForm(true);
  }

  function openEdit(item: Insumo) {
    setEditId(item.id);
    setForm({ nombre: item.nombre, marca: item.marca, grupo: item.grupo, proveedor: item.proveedor, unidadCompra: item.unidadCompra, rendimiento: item.rendimiento, unidadEstandar: item.unidadEstandar, costoCompra: item.costoCompra, area: item.area, existencia: item.existencia, consumoMinDiario: item.consumoMinDiario, consumoMaxDiario: item.consumoMaxDiario, tiempoReposicion: item.tiempoReposicion });
    setShowForm(true);
  }

  function saveForm() {
    if (!form.nombre.trim()) return;
    if (editId) {
      setInsumos(insumos.map(i => i.id === editId ? { ...form, id: editId } : i));
    } else {
      setInsumos([...insumos, { ...form, id: crypto.randomUUID() }]);
    }
    setShowForm(false);
    setForm(BLANK);
    setEditId(null);
  }

  function updateExistencia(id: string, val: number) {
    setInsumos(insumos.map(i => i.id === id ? { ...i, existencia: val } : i));
  }

  function removeInsumo(id: string) {
    setInsumos(insumos.filter(i => i.id !== id));
  }

  const F = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Insumos</div>
          <div className="text-2xl font-black text-white mt-1">{insumos.length}</div>
        </div>
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4">
          <div className="text-xs text-teal-400 font-bold uppercase tracking-widest">Valor Inventario</div>
          <div className="text-2xl font-black text-teal-400 mt-1">${F(totalInventory)}</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="text-xs text-amber-400 font-bold uppercase tracking-widest">Alertas de Stock</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{orderItems.length}</div>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4">
          <div className="text-xs text-rose-400 font-bold uppercase tracking-widest">Total Pedido</div>
          <div className="text-2xl font-black text-rose-400 mt-1">${F(totalOrder)}</div>
        </div>
      </div>

      {/* View toggle + actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex bg-slate-900/50 border border-white/5 rounded-xl p-1 gap-1">
          <button
            onClick={() => setActiveView('inventario')}
            className={clsx('px-4 py-2 rounded-lg text-sm font-black transition-all', activeView === 'inventario' ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20' : 'text-slate-500 hover:text-white')}
          >
            Inventario
          </button>
          <button
            onClick={() => setActiveView('pedido')}
            className={clsx('px-4 py-2 rounded-lg text-sm font-black transition-all flex items-center gap-2', activeView === 'pedido' ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20' : 'text-slate-500 hover:text-white')}
          >
            <ShoppingCart size={14} />
            Pedido
            {orderItems.length > 0 && (
              <span className={clsx('text-xs rounded-full px-1.5 py-0.5', activeView === 'pedido' ? 'bg-white/20' : 'bg-rose-500/20 text-rose-400')}>{orderItems.length}</span>
            )}
          </button>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-teal-500/20 active:scale-95"
        >
          <Plus size={16} strokeWidth={3} /> AGREGAR INSUMO
        </button>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <span className="font-black text-white">{editId ? 'Editar Insumo' : 'Nuevo Insumo'}</span>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white transition-colors"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 font-bold mb-1">NOMBRE</label>
              <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Leche entera" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">MARCA</label>
              <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.marca} onChange={e => setForm(f => ({ ...f, marca: e.target.value }))} placeholder="Ej. Alpura" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">GRUPO</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))}>
                {GRUPOS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">PROVEEDOR</label>
              <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.proveedor} onChange={e => setForm(f => ({ ...f, proveedor: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">ÁREA</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">COSTO COMPRA ($)</label>
              <input type="number" min={0} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.costoCompra || ''} onChange={e => setForm(f => ({ ...f, costoCompra: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">U. COMPRA</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.unidadCompra} onChange={e => setForm(f => ({ ...f, unidadCompra: e.target.value }))}>
                {UNIDADES_COMPRA.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">RENDIMIENTO</label>
              <input type="number" min={0} step={0.001} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.rendimiento || ''} onChange={e => setForm(f => ({ ...f, rendimiento: parseFloat(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">U. ESTÁNDAR</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.unidadEstandar} onChange={e => setForm(f => ({ ...f, unidadEstandar: e.target.value }))}>
                {UNIDADES_ESTANDAR.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">EXISTENCIA ACTUAL (u. compra)</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.existencia || ''} onChange={e => setForm(f => ({ ...f, existencia: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">CONSUMO MÍN DIARIO (u. est.)</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.consumoMinDiario || ''} onChange={e => setForm(f => ({ ...f, consumoMinDiario: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">CONSUMO MÁX DIARIO (u. est.)</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.consumoMaxDiario || ''} onChange={e => setForm(f => ({ ...f, consumoMaxDiario: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">TIEMPO REPOSICIÓN (días)</label>
              <input type="number" min={1} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500/50" value={form.tiempoReposicion || ''} onChange={e => setForm(f => ({ ...f, tiempoReposicion: parseInt(e.target.value) || 7 }))} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-slate-500 hover:text-white text-sm font-bold transition-colors">Cancelar</button>
            <button onClick={saveForm} className="flex items-center gap-2 px-5 py-2 bg-teal-500 hover:bg-teal-400 text-white rounded-xl font-black text-sm transition-all active:scale-95">
              <Save size={14} /> Guardar
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {insumos.length === 0 && !showForm && (
        <div className="text-center py-20 border border-white/5 rounded-2xl bg-slate-900/30">
          <Package size={40} className="mx-auto text-slate-600 mb-4" />
          <div className="text-slate-400 font-bold mb-2">Sin insumos registrados</div>
          <div className="text-slate-600 text-sm mb-6">Agrega tus ingredientes y materiales para controlar el inventario.</div>
          <button onClick={openAdd} className="bg-teal-500 hover:bg-teal-400 text-white px-6 py-3 rounded-xl font-black text-sm transition-all shadow-lg shadow-teal-500/20">
            Agregar primer insumo
          </button>
        </div>
      )}

      {/* Inventario view */}
      {activeView === 'inventario' && analyzed.length > 0 && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <select
              value={filterGrupo}
              onChange={e => setFilterGrupo(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-300 focus:outline-none"
            >
              {grupos.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <div className="flex bg-slate-900/50 border border-white/5 rounded-xl p-1 gap-1">
              {(['all', 'ok', 'warning', 'critical'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={clsx('px-3 py-1.5 rounded-lg text-xs font-black transition-all', filterStatus === s ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white')}>
                  {s === 'all' ? 'TODOS' : s === 'ok' ? 'OK' : s === 'warning' ? 'ALERTA' : 'CRÍTICO'}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Insumo</th>
                  <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Grupo</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Existencia</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Mín</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Costo Inv.</th>
                  <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Costo Unit.</th>
                  <th className="px-4 py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest">Estado</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(i => {
                  const meta = STATUS_META[i.status];
                  const Icon = meta.icon;
                  return (
                    <tr key={i.id} className="hover:bg-white/[0.02] transition-colors group">
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">{i.nombre}</div>
                        <div className="text-xs text-slate-500">{i.marca} · {i.proveedor}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{i.grupo}</td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number" min={0} step={0.01}
                          value={i.existencia}
                          onChange={e => updateExistencia(i.id, parseFloat(e.target.value) || 0)}
                          className="w-20 bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-teal-500/50 tabular-nums"
                        />
                        <span className="text-xs text-slate-500 ml-1">{i.unidadCompra}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 tabular-nums text-xs">{F(i.existenciaMinima)} {i.unidadEstandar}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">${F(i.costoInventario)}</td>
                      <td className="px-4 py-3 text-right text-slate-400 tabular-nums text-xs">${F(i.costoUnitario)}/{i.unidadEstandar}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black', meta.bg, meta.color)}>
                          <Icon size={10} />{meta.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(i)} className="text-slate-500 hover:text-white transition-colors"><Edit3 size={14} /></button>
                          <button onClick={() => removeInsumo(i.id)} className="text-slate-500 hover:text-rose-400 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pedido view */}
      {activeView === 'pedido' && (
        <div className="space-y-4">
          {orderItems.length === 0 ? (
            <div className="text-center py-16 border border-white/5 rounded-2xl bg-slate-900/30">
              <CheckCircle size={36} className="mx-auto text-emerald-500 mb-3" />
              <div className="text-emerald-400 font-black mb-1">Inventario OK</div>
              <div className="text-slate-600 text-sm">Todos los insumos están por encima del punto de pedido.</div>
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-400 font-bold">
                {orderItems.length} insumos requieren pedido · Total estimado: <span className="text-rose-400">${F(totalOrder)}</span>
              </div>
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Insumo</th>
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Proveedor</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Existencia</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Cant. Pedido</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Costo Unit.</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Total</th>
                      <th className="px-4 py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest">Prioridad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {orderItems.sort((a, b) => (a.status === 'critical' ? -1 : 1)).map(i => {
                      const meta = STATUS_META[i.status];
                      const Icon = meta.icon;
                      return (
                        <tr key={i.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{i.nombre}</div>
                            <div className="text-xs text-slate-500">{i.grupo}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{i.proveedor || '—'}</td>
                          <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{i.existencia} {i.unidadCompra}</td>
                          <td className="px-4 py-3 text-right font-bold text-white tabular-nums">{i.cantidadPedido} {i.unidadCompra}</td>
                          <td className="px-4 py-3 text-right text-slate-400 tabular-nums">${F(i.costoCompra)}</td>
                          <td className="px-4 py-3 text-right font-bold text-teal-400 tabular-nums">${F(i.totalPedido)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black', meta.bg, meta.color)}>
                              <Icon size={10} />{meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-white/10">
                      <td colSpan={5} className="px-4 py-3 text-right font-black text-slate-400 uppercase text-xs tracking-widest">TOTAL PEDIDO</td>
                      <td className="px-4 py-3 text-right font-black text-teal-400 text-lg tabular-nums">${F(totalOrder)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
