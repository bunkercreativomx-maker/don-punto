import { useState, useMemo, useRef } from 'react';
import {
  Plus, Trash2, Edit3, Save, X, Package, AlertTriangle, ShoppingCart,
  CheckCircle, Camera, Loader2, AlertCircle, ClipboardCheck, History,
  TrendingDown, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Insumo {
  id: string;
  nombre: string;
  unidad: string;
  grupo: string;
  area: string;
  saldoActual: number;
  costoUnitario: number;
  consumoMinDiario: number;
  consumoMaxDiario: number;
  tiempoReposicion: number;
}

interface CompraDelDia {
  id: string;
  fecha: string;
  insumoId: string;
  insumoNombre: string;
  unidad: string;
  cantidad: number;
}

interface RegistroDiario {
  id: string;
  fecha: string;
  insumoId: string;
  insumoNombre: string;
  unidad: string;
  saldoInicial: number;
  comprado: number;
  saldoFinal: number;
  consumido: number;
  costoUnitario?: number;
}

interface CierreDelDia {
  id: string;
  fecha: string;
  costoSaldoActual: number;
  costoCompradoHoy: number;
  registros: RegistroDiario[];
}

interface FacturaItem { nombre: string; cantidad: number; unidad: string; precioUnitario?: number; }

// ─── Constants ────────────────────────────────────────────────────────────────

const GRUPOS = ['Carnes y Proteínas', 'Frutas y Verduras', 'Lácteos', 'Secos y Abarrotes', 'Bebidas', 'Limpieza', 'Otros'];
const AREAS  = ['Cocina', 'Barra', 'Almacén', 'Limpieza', 'General'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const TODAY = () => new Date().toISOString().split('T')[0];

const BLANK_INSUMO: Omit<Insumo, 'id'> = {
  nombre: '', unidad: 'pz', grupo: 'Otros', area: 'General',
  saldoActual: 0, costoUnitario: 0, consumoMinDiario: 0, consumoMaxDiario: 0, tiempoReposicion: 7,
};

// ─── Storage helpers ──────────────────────────────────────────────────────────

function useInsumos(): [Insumo[], (d: Insumo[]) => void] {
  const [items, setState] = useState<Insumo[]>(() => {
    try {
      const raw = localStorage.getItem('donPuntoInsumos2');
      if (raw) return JSON.parse(raw);
      const old = localStorage.getItem('donPuntoInventario');
      if (old) {
        return (JSON.parse(old) as any[]).map(i => ({
          id: i.id,
          nombre: i.nombre || '',
          unidad: i.unidadCompra || 'pz',
          grupo: i.grupo || 'Otros',
          area: i.area || 'General',
          saldoActual: i.existencia || 0,
          costoUnitario: i.costoCompra || 0,
          consumoMinDiario: i.consumoMinDiario || 0,
          consumoMaxDiario: i.consumoMaxDiario || 0,
          tiempoReposicion: i.tiempoReposicion || 7,
        }));
      }
      return [];
    } catch { return []; }
  });
  const set = (d: Insumo[]) => { setState(d); localStorage.setItem('donPuntoInsumos2', JSON.stringify(d)); };
  return [items, set];
}

function useComprasHoy(): [CompraDelDia[], (d: CompraDelDia[]) => void] {
  const [items, setState] = useState<CompraDelDia[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoComprasHoy') || '[]'); } catch { return []; }
  });
  const set = (d: CompraDelDia[]) => { setState(d); localStorage.setItem('donPuntoComprasHoy', JSON.stringify(d)); };
  return [items, set];
}

function useHistorial(): [RegistroDiario[], (d: RegistroDiario[]) => void] {
  const [items, setState] = useState<RegistroDiario[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoHistorial') || '[]'); } catch { return []; }
  });
  const set = (d: RegistroDiario[]) => { setState(d); localStorage.setItem('donPuntoHistorial', JSON.stringify(d)); };
  return [items, set];
}

function useCierresDiarios(): [CierreDelDia[], (d: CierreDelDia[]) => void] {
  const [items, setState] = useState<CierreDelDia[]>(() => {
    try { return JSON.parse(localStorage.getItem('donPuntoCierresDiarios') || '[]'); } catch { return []; }
  });
  const set = (d: CierreDelDia[]) => { setState(d); localStorage.setItem('donPuntoCierresDiarios', JSON.stringify(d)); };
  return [items, set];
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function getStatus(ins: Insumo): 'ok' | 'warning' | 'critical' {
  const avg = (ins.consumoMinDiario + ins.consumoMaxDiario) / 2;
  const min = ins.consumoMinDiario * ins.tiempoReposicion;
  const punto = avg * ins.tiempoReposicion + min;
  if (ins.saldoActual <= min) return 'critical';
  if (ins.saldoActual <= punto) return 'warning';
  return 'ok';
}

const STATUS_META = {
  ok:       { label: 'OK',         color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', Icon: CheckCircle },
  warning:  { label: 'Pedir pronto', color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  Icon: AlertTriangle },
  critical: { label: 'Crítico',    color: 'text-rose-400',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    Icon: AlertTriangle },
};

// ─── Factura Modal ────────────────────────────────────────────────────────────

function FacturaModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (items: FacturaItem[]) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FacturaItem[]>([]);

  function handleFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setItems([]);
    setError(null);
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const { base64, mimeType } = await fileToBase64(file);
      const res = await fetch('/api/factura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      if (!data.items?.length) {
        setError('No se detectaron productos. Intenta con una foto más clara o mejor iluminación.');
      } else {
        setItems(data.items);
      }
    } catch (err: any) {
      const msg = err?.message || 'desconocido';
      setError(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div>
            <div className="font-black text-white">Subir Factura</div>
            <div className="text-xs text-slate-500 mt-0.5">Toma o sube una foto para actualizar el inventario automáticamente</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors"><X size={20} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {!preview ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-white/10 hover:border-teal-500/40 rounded-2xl py-14 flex flex-col items-center gap-3 transition-colors group"
            >
              <Camera size={36} className="text-slate-600 group-hover:text-teal-400 transition-colors" />
              <div className="text-slate-400 font-bold text-sm">Toca para tomar foto o subir imagen</div>
              <div className="text-slate-600 text-xs">JPG, PNG, WEBP — funciona con facturas, tickets o notas de compra</div>
            </button>
          ) : (
            <div className="space-y-3">
              <img src={preview} alt="Factura" className="w-full rounded-xl max-h-52 object-contain bg-slate-950 border border-white/5" />
              <button onClick={() => { setPreview(null); setFile(null); setItems([]); }} className="text-xs text-slate-500 hover:text-white transition-colors flex items-center gap-1">
                <X size={12} /> Cambiar foto
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />

          {preview && items.length === 0 && (
            <button
              onClick={analyze}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-black text-sm transition-all active:scale-95"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              {loading ? 'Analizando factura con IA...' : 'Analizar Factura'}
            </button>
          )}

          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="shrink-0" /> {error}
            </div>
          )}

          {items.length > 0 && (
            <div className="space-y-3">
              <div className="text-xs font-black text-teal-400 uppercase tracking-widest">
                {items.length} productos detectados — edita si es necesario
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-950/60 rounded-xl px-3 py-2">
                    <input
                      className="flex-1 bg-transparent text-white text-sm font-bold outline-none min-w-0"
                      value={item.nombre}
                      onChange={e => setItems(p => p.map((it, j) => j === i ? { ...it, nombre: e.target.value } : it))}
                    />
                    <input
                      type="number" min={0} step={0.01}
                      className="w-12 bg-slate-800 border border-white/10 rounded-lg px-1.5 py-1 text-white text-xs text-right outline-none tabular-nums"
                      value={item.cantidad}
                      onChange={e => setItems(p => p.map((it, j) => j === i ? { ...it, cantidad: parseFloat(e.target.value) || 0 } : it))}
                    />
                    <span className="text-xs text-teal-400 font-bold w-8 shrink-0 truncate">{item.unidad}</span>
                    <span className="text-slate-600 text-xs">$</span>
                    <input
                      type="number" min={0} step={0.01}
                      className="w-12 bg-slate-800 border border-white/10 rounded-lg px-1.5 py-1 text-white text-xs text-right outline-none tabular-nums"
                      value={item.precioUnitario || ''}
                      onChange={e => setItems(p => p.map((it, j) => j === i ? { ...it, precioUnitario: parseFloat(e.target.value) || 0 } : it))}
                      placeholder="0.00"
                    />
                    <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-slate-600 hover:text-rose-400 transition-colors shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {items.length > 0 && (
          <div className="p-5 border-t border-white/5 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl text-slate-500 hover:text-white font-bold text-sm transition-colors bg-slate-800/50">Cancelar</button>
            <button
              onClick={() => onConfirm(items.filter(it => it.nombre.trim() && it.cantidad > 0))}
              className="flex-1 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-black text-sm transition-all active:scale-95"
            >
              Agregar al Inventario
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Module ──────────────────────────────────────────────────────────────

type View = 'inventario' | 'cierre' | 'historial' | 'pedido';

export function InventoryModule() {
  const [insumos, setInsumos] = useInsumos();
  const [comprasHoy, setComprasHoy] = useComprasHoy();
  const [historial, setHistorial] = useHistorial();
  const [cierresDiarios, setCierresDiarios] = useCierresDiarios();

  const [view, setView] = useState<View>('inventario');
  const [showFactura, setShowFactura] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Insumo, 'id'>>(BLANK_INSUMO);
  const [historialTab, setHistorialTab] = useState<'diario' | 'mensual'>('diario');

  // Cierre del día state: saldoFinal per insumo
  const [cierreValues, setCierreValues] = useState<Record<string, string>>({});

  const today = TODAY();

  const comprasDeHoy = useMemo(() => comprasHoy.filter(c => c.fecha === today), [comprasHoy, today]);

  // Sum of purchases per insumo for today
  const compradoHoyMap = useMemo(() => {
    const map = new Map<string, number>();
    comprasDeHoy.forEach(c => {
      map.set(c.insumoId, (map.get(c.insumoId) || 0) + c.cantidad);
    });
    return map;
  }, [comprasDeHoy]);

  const analyzed = useMemo(() => insumos.map(i => ({ ...i, status: getStatus(i) })), [insumos]);
  const alertas = analyzed.filter(i => i.status !== 'ok');
  const costoSaldoActual = insumos.reduce((s, i) => s + i.saldoActual * i.costoUnitario, 0);
  const costoCompradoHoy = comprasDeHoy.reduce((s, c) => {
    const ins = insumos.find(i => i.id === c.insumoId);
    return s + (ins ? c.cantidad * ins.costoUnitario : 0);
  }, 0);

  function openAdd() { setEditId(null); setForm(BLANK_INSUMO); setShowForm(true); }
  function openEdit(i: Insumo) { setEditId(i.id); setForm({ ...i }); setShowForm(true); }
  function saveForm() {
    if (!form.nombre.trim()) return;
    if (editId) setInsumos(insumos.map(i => i.id === editId ? { ...form, id: editId } : i));
    else setInsumos([...insumos, { ...form, id: crypto.randomUUID() }]);
    setShowForm(false);
    setForm(BLANK_INSUMO);
    setEditId(null);
  }
  function removeInsumo(id: string) { setInsumos(insumos.filter(i => i.id !== id)); }

  // ── Factura confirm ──
  function handleFacturaConfirm(items: FacturaItem[]) {
    const updated = [...insumos];
    const newCompras: CompraDelDia[] = [];

    items.forEach(item => {
      const nombreNorm = item.nombre.trim().toLowerCase();
      let idx = updated.findIndex(i => i.nombre.trim().toLowerCase() === nombreNorm);

      if (idx === -1) {
        // Create new insumo
        const newIns: Insumo = {
          id: crypto.randomUUID(),
          nombre: item.nombre.trim(),
          unidad: item.unidad,
          grupo: 'Otros',
          area: 'General',
          saldoActual: item.cantidad,
          costoUnitario: item.precioUnitario || 0,
          consumoMinDiario: 0,
          consumoMaxDiario: 0,
          tiempoReposicion: 7,
        };
        updated.push(newIns);
        idx = updated.length - 1;
        newCompras.push({ id: crypto.randomUUID(), fecha: today, insumoId: newIns.id, insumoNombre: newIns.nombre, unidad: item.unidad, cantidad: item.cantidad });
      } else {
        // Si el insumo ya existe y no tiene costo, asignar el de la factura
        const costoActualizado = updated[idx].costoUnitario === 0 && item.precioUnitario ? item.precioUnitario : updated[idx].costoUnitario;
        updated[idx] = { ...updated[idx], saldoActual: updated[idx].saldoActual + item.cantidad, unidad: item.unidad, costoUnitario: costoActualizado };
        newCompras.push({ id: crypto.randomUUID(), fecha: today, insumoId: updated[idx].id, insumoNombre: updated[idx].nombre, unidad: item.unidad, cantidad: item.cantidad });
      }
    });

    setInsumos(updated);
    setComprasHoy([...comprasHoy, ...newCompras]);
    setShowFactura(false);
  }

  // ── Cierre del día ──
  function initCierre() {
    const vals: Record<string, string> = {};
    insumos.forEach(i => { vals[i.id] = ''; });
    setCierreValues(vals);
    setView('cierre');
  }

  function saveCierre() {
    const registros: RegistroDiario[] = [];
    const updatedInsumos = insumos.map(ins => {
      const saldoFinalStr = cierreValues[ins.id];
      if (saldoFinalStr === '' || saldoFinalStr === undefined) return ins;
      const saldoFinal = parseFloat(saldoFinalStr) || 0;
      const comprado = compradoHoyMap.get(ins.id) || 0;
      const saldoInicial = ins.saldoActual - comprado;
      const consumido = Math.max(0, saldoInicial + comprado - saldoFinal);
      registros.push({
        id: crypto.randomUUID(),
        fecha: today,
        insumoId: ins.id,
        insumoNombre: ins.nombre,
        unidad: ins.unidad,
        saldoInicial,
        comprado,
        saldoFinal,
        consumido,
        costoUnitario: ins.costoUnitario,
      });
      return { ...ins, saldoActual: saldoFinal };
    });
    setInsumos(updatedInsumos);
    setHistorial([...historial, ...registros]);

    // Guardar Cierre del Día con costos para Financiero
    const cierre: CierreDelDia = {
      id: crypto.randomUUID(),
      fecha: today,
      costoSaldoActual,
      costoCompradoHoy,
      registros,
    };
    setCierresDiarios([...cierresDiarios, cierre]);

    setView('inventario');
    setCierreValues({});
  }

  // ── Historial grouping ──
  const historialPorFecha = useMemo(() => {
    const map = new Map<string, RegistroDiario[]>();
    [...historial].sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach(r => {
      const arr = map.get(r.fecha) || [];
      arr.push(r);
      map.set(r.fecha, arr);
    });
    return Array.from(map.entries());
  }, [historial]);

  const historialMensual = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    historial.forEach(r => {
      const [y, m] = r.fecha.split('-');
      const key = `${y}-${m}`;
      const inner = map.get(key) || new Map<string, number>();
      inner.set(r.insumoNombre, (inner.get(r.insumoNombre) || 0) + r.consumido);
      map.set(key, inner);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [historial]);

  const F = (v: number) => v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const VIEW_TABS: { key: View; label: string; icon: any; color: string }[] = [
    { key: 'inventario', label: 'Inventario', icon: Package, color: 'teal' },
    { key: 'cierre',     label: 'Cierre del Día', icon: ClipboardCheck, color: 'amber' },
    { key: 'historial',  label: 'Historial', icon: History, color: 'violet' },
    { key: 'pedido',     label: 'Pedido', icon: ShoppingCart, color: 'rose' },
  ];

  return (
    <div className="space-y-6">
      {showFactura && <FacturaModal onClose={() => setShowFactura(false)} onConfirm={handleFacturaConfirm} />}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
          <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">Total Insumos</div>
          <div className="text-2xl font-black text-white mt-1">{insumos.length}</div>
        </div>
        <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4">
          <div className="text-xs text-teal-400 font-bold uppercase tracking-widest">Valor Saldo Actual</div>
          <div className="text-2xl font-black text-teal-400 mt-1">${F(costoSaldoActual)}</div>
          <div className="text-[10px] text-teal-500 mt-2">Saldo en existencia × costo unit.</div>
        </div>
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4">
          <div className="text-xs text-violet-400 font-bold uppercase tracking-widest">Comprado Hoy</div>
          <div className="text-2xl font-black text-violet-400 mt-1">${F(costoCompradoHoy)}</div>
          <div className="text-[10px] text-violet-500 mt-2">{comprasDeHoy.length} compras del día</div>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4">
          <div className="text-xs text-amber-400 font-bold uppercase tracking-widest">Alertas de Stock</div>
          <div className="text-2xl font-black text-amber-400 mt-1">{alertas.length}</div>
        </div>
      </div>

      {/* Tabs + Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex bg-slate-900/50 border border-white/5 rounded-xl p-1 gap-1 flex-wrap">
          {VIEW_TABS.map(tab => {
            const Icon = tab.icon;
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => tab.key === 'cierre' ? initCierre() : setView(tab.key)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black transition-all',
                  active
                    ? tab.color === 'teal'   ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                    : tab.color === 'amber'  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                    : tab.color === 'violet' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                    : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
                    : 'text-slate-500 hover:text-white'
                )}
              >
                <Icon size={13} />
                {tab.label}
                {tab.key === 'pedido' && alertas.length > 0 && (
                  <span className={clsx('text-[10px] rounded-full px-1.5', active ? 'bg-white/20' : 'bg-rose-500/20 text-rose-400')}>
                    {alertas.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFactura(true)}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white px-4 py-2.5 rounded-xl font-black text-sm transition-all shadow-lg shadow-teal-500/20 active:scale-95"
          >
            <Camera size={16} /> SUBIR FACTURA
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-white/10 text-white px-4 py-2.5 rounded-xl font-black text-sm transition-all active:scale-95"
          >
            <Plus size={16} strokeWidth={3} /> INSUMO
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-black text-white">{editId ? 'Editar Insumo' : 'Nuevo Insumo'}</span>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-white"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-slate-500 font-bold mb-1">NOMBRE</label>
              <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Tomate roma" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">UNIDAD</label>
              <input className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} placeholder="kg, pz, l..." />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">GRUPO</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" value={form.grupo} onChange={e => setForm(f => ({ ...f, grupo: e.target.value }))}>
                {GRUPOS.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">ÁREA</label>
              <select className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none" value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))}>
                {AREAS.map(a => <option key={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">SALDO ACTUAL</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.saldoActual || ''} onChange={e => setForm(f => ({ ...f, saldoActual: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">COSTO UNITARIO ($)</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.costoUnitario || ''} onChange={e => setForm(f => ({ ...f, costoUnitario: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">CONSUMO MÍN/DÍA</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.consumoMinDiario || ''} onChange={e => setForm(f => ({ ...f, consumoMinDiario: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">CONSUMO MÁX/DÍA</label>
              <input type="number" min={0} step={0.01} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.consumoMaxDiario || ''} onChange={e => setForm(f => ({ ...f, consumoMaxDiario: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-bold mb-1">TIEMPO REPOS. (días)</label>
              <input type="number" min={1} className="w-full bg-slate-800 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-teal-500/50" value={form.tiempoReposicion || ''} onChange={e => setForm(f => ({ ...f, tiempoReposicion: parseInt(e.target.value) || 7 }))} />
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

      {/* ── INVENTARIO view ── */}
      {view === 'inventario' && (
        <>
          {insumos.length === 0 && !showForm ? (
            <div className="text-center py-20 border border-white/5 rounded-2xl bg-slate-900/30">
              <Package size={40} className="mx-auto text-slate-600 mb-4" />
              <div className="text-slate-400 font-bold mb-2">Sin insumos registrados</div>
              <div className="text-slate-600 text-sm mb-6">Sube una factura para agregar insumos automáticamente, o agrégalos manualmente.</div>
              <div className="flex gap-3 justify-center">
                <button onClick={() => setShowFactura(true)} className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-white px-5 py-3 rounded-xl font-black text-sm transition-all shadow-lg shadow-teal-500/20">
                  <Camera size={16} /> Subir Factura
                </button>
                <button onClick={openAdd} className="flex items-center gap-2 bg-slate-800 border border-white/10 text-white px-5 py-3 rounded-xl font-black text-sm transition-all">
                  <Plus size={16} /> Manual
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Insumo</th>
                    <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Saldo Actual</th>
                    <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Comprado Hoy</th>
                    <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Valor</th>
                    <th className="px-4 py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest">Estado</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {analyzed.map(i => {
                    const meta = STATUS_META[i.status];
                    const compHoy = compradoHoyMap.get(i.id) || 0;
                    return (
                      <tr key={i.id} className="hover:bg-white/[0.02] transition-colors group">
                        <td className="px-4 py-3">
                          <div className="font-bold text-white">{i.nombre}</div>
                          <div className="text-xs text-slate-500">{i.grupo} · {i.area}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-white tabular-nums">
                          {i.saldoActual} <span className="text-slate-500 font-normal text-xs">{i.unidad}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-xs">
                          {compHoy > 0
                            ? <span className="text-teal-400 font-bold">+{compHoy} {i.unidad}</span>
                            : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400 tabular-nums text-xs">
                          {i.costoUnitario > 0 ? `$${F(i.saldoActual * i.costoUnitario)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black', meta.bg, meta.color)}>
                            <meta.Icon size={10} /> {meta.label}
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
          )}

          {/* Today's purchases log */}
          {comprasDeHoy.length > 0 && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-5">
              <div className="text-xs font-black text-teal-400 uppercase tracking-widest mb-3">Compras de Hoy ({today})</div>
              <div className="space-y-1.5">
                {comprasDeHoy.map(c => (
                  <div key={c.id} className="flex items-center justify-between text-sm">
                    <span className="text-slate-300 font-bold">{c.insumoNombre}</span>
                    <span className="text-teal-400 font-black tabular-nums">+{c.cantidad} {c.unidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CIERRE DEL DÍA view ── */}
      {view === 'cierre' && (
        <div className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-sm text-amber-300">
            Ingresa cuánto quedó de cada insumo al finalizar el día. Deja en blanco los que no contabilizaste hoy.
          </div>
          {insumos.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No hay insumos para cerrar.</div>
          ) : (
            <>
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Insumo</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Inicial</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Comprado</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Quedaron</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Consumido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {insumos.map(ins => {
                      const compHoy = compradoHoyMap.get(ins.id) || 0;
                      const saldoInicial = ins.saldoActual - compHoy;
                      const saldoFinalStr = cierreValues[ins.id] ?? '';
                      const saldoFinal = saldoFinalStr !== '' ? parseFloat(saldoFinalStr) || 0 : null;
                      const consumido = saldoFinal !== null ? Math.max(0, saldoInicial + compHoy - saldoFinal) : null;
                      return (
                        <tr key={ins.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{ins.nombre}</div>
                            <div className="text-xs text-slate-500">{ins.unidad}</div>
                          </td>
                          <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{saldoInicial}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {compHoy > 0 ? <span className="text-teal-400 font-bold">+{compHoy}</span> : <span className="text-slate-600">0</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number" min={0} step={0.01}
                              placeholder="—"
                              className="w-20 bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-sm text-right outline-none focus:border-amber-500/50 tabular-nums"
                              value={saldoFinalStr}
                              onChange={e => setCierreValues(prev => ({ ...prev, [ins.id]: e.target.value }))}
                            />
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {consumido !== null
                              ? <span className="font-bold text-amber-400">{F(consumido)} {ins.unidad}</span>
                              : <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setView('inventario')} className="px-5 py-2.5 rounded-xl text-slate-500 hover:text-white font-bold text-sm transition-colors bg-slate-800/50">Cancelar</button>
                <button
                  onClick={saveCierre}
                  className="flex items-center gap-2 px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-amber-500/20"
                >
                  <ClipboardCheck size={16} /> Guardar Cierre del Día
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── HISTORIAL view ── */}
      {view === 'historial' && (
        <div className="space-y-4">
          <div className="flex bg-slate-900/50 border border-white/5 rounded-xl p-1 gap-1 w-fit">
            <button onClick={() => setHistorialTab('diario')} className={clsx('px-4 py-2 rounded-lg text-xs font-black transition-all', historialTab === 'diario' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-white')}>Diario</button>
            <button onClick={() => setHistorialTab('mensual')} className={clsx('px-4 py-2 rounded-lg text-xs font-black transition-all', historialTab === 'mensual' ? 'bg-violet-500 text-white' : 'text-slate-500 hover:text-white')}>Mensual</button>
          </div>

          {historial.length === 0 ? (
            <div className="text-center py-16 border border-white/5 rounded-2xl bg-slate-900/30">
              <History size={36} className="mx-auto text-slate-600 mb-3" />
              <div className="text-slate-400 font-bold">Sin historial aún</div>
              <div className="text-slate-600 text-sm mt-1">El historial se genera al hacer el Cierre del Día.</div>
            </div>
          ) : historialTab === 'diario' ? (
            <div className="space-y-4">
              {historialPorFecha.map(([fecha, registros]) => (
                <div key={fecha} className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{fecha}</span>
                    <span className="text-xs text-slate-600">{registros.length} insumos</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="px-4 py-2 text-left text-[10px] font-black text-slate-600 uppercase tracking-widest">Insumo</th>
                        <th className="px-4 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Inicial</th>
                        <th className="px-4 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Comprado</th>
                        <th className="px-4 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Final</th>
                        <th className="px-4 py-2 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Consumido</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {registros.map(r => (
                        <tr key={r.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-2.5 font-bold text-white">{r.insumoNombre} <span className="text-slate-600 font-normal text-xs">{r.unidad}</span></td>
                          <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{r.saldoInicial}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {r.comprado > 0 ? <span className="text-teal-400">+{r.comprado}</span> : <span className="text-slate-600">0</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{r.saldoFinal}</td>
                          <td className="px-4 py-2.5 text-right font-black text-violet-400 tabular-nums">{F(r.consumido)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {historialMensual.map(([mesKey, consumoMap]) => {
                const [y, m] = mesKey.split('-');
                const label = `${MONTHS[parseInt(m) - 1]} ${y}`;
                const entries = Array.from(consumoMap.entries()).sort((a, b) => b[1] - a[1]);
                return (
                  <div key={mesKey} className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/5">
                      <span className="text-xs font-black text-violet-400 uppercase tracking-widest">{label}</span>
                    </div>
                    <div className="p-4 space-y-2">
                      {entries.map(([nombre, total]) => (
                        <div key={nombre} className="flex items-center justify-between text-sm">
                          <span className="text-slate-300 font-bold">{nombre}</span>
                          <span className="text-violet-400 font-black tabular-nums">{F(total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PEDIDO view ── */}
      {view === 'pedido' && (
        <div className="space-y-4">
          {alertas.length === 0 ? (
            <div className="text-center py-16 border border-white/5 rounded-2xl bg-slate-900/30">
              <CheckCircle size={36} className="mx-auto text-emerald-500 mb-3" />
              <div className="text-emerald-400 font-black mb-1">Inventario OK</div>
              <div className="text-slate-600 text-sm">Todos los insumos están por encima del punto de pedido.</div>
            </div>
          ) : (
            <>
              <div className="text-sm text-slate-400 font-bold">{alertas.length} insumos requieren atención</div>
              <div className="bg-slate-900/40 border border-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="px-4 py-3 text-left text-xs font-black text-slate-500 uppercase tracking-widest">Insumo</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Saldo</th>
                      <th className="px-4 py-3 text-right text-xs font-black text-slate-500 uppercase tracking-widest">Mín Requerido</th>
                      <th className="px-4 py-3 text-center text-xs font-black text-slate-500 uppercase tracking-widest">Prioridad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {alertas.sort((a, b) => (a.status === 'critical' ? -1 : 1)).map(i => {
                      const meta = STATUS_META[i.status];
                      const minReq = i.consumoMinDiario * i.tiempoReposicion;
                      return (
                        <tr key={i.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3">
                            <div className="font-bold text-white">{i.nombre}</div>
                            <div className="text-xs text-slate-500">{i.grupo}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-rose-400 tabular-nums">{i.saldoActual} {i.unidad}</td>
                          <td className="px-4 py-3 text-right text-slate-400 tabular-nums text-xs">{F(minReq)} {i.unidad}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black', meta.bg, meta.color)}>
                              <meta.Icon size={10} /> {meta.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
