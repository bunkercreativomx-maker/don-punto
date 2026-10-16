import { useMemo, useState } from 'react';
import { Plus, Search, Trash2, Gift, MessageCircle, Download, X, Phone, Pencil } from 'lucide-react';
import { useSession, isPro, getBranches } from '../../lib/session';
import { getClients, saveClients, addClient, getLoyalty, saveLoyalty, normPhone, type Client, type LoyaltyConfig } from '../../lib/clients';
import { storeGetBranch } from '../../lib/cloudStore';
import { money } from '../../lib/format';
import { ProUpsell } from '../pro/ProUpsell';
import type { POSTransaction } from '../../types/pos';

const fmtDate = (s?: string) => (s ? new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const daysSince = (s?: string) => (s ? Math.floor((Date.now() - new Date(s).getTime()) / 86400000) : Infinity);
const wa = (phone: string, text: string) => `https://wa.me/52${normPhone(phone)}?text=${encodeURIComponent(text)}`;

export function ClientsModule({ onUpgrade }: { onUpgrade: () => void }) {
  useSession();
  const [clients, setClients] = useState<Client[]>(getClients);
  const [loyalty, setLoyalty] = useState<LoyaltyConfig>(getLoyalty);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', notes: '' });
  const [open, setOpen] = useState<Client | null>(null);
  const [filter, setFilter] = useState<'todos' | 'frecuentes' | 'perdidos'>('todos');

  const persist = (list: Client[]) => { setClients(list); saveClients(list); };

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clients
      .filter((c) => !t || c.name.toLowerCase().includes(t) || (c.phone || '').includes(t.replace(/\D/g, '') || '¬'))
      .filter((c) => filter === 'todos' || (filter === 'frecuentes' ? c.visits >= 3 : c.visits > 0 && daysSince(c.lastVisit) > 30))
      .sort((a, b) => (b.lastVisit || b.createdAt).localeCompare(a.lastVisit || a.createdAt));
  }, [clients, q, filter]);

  const history = useMemo(() => {
    if (!open) return [];
    const out: (POSTransaction & { branch: string })[] = [];
    getBranches().forEach((b) => {
      try {
        (JSON.parse(storeGetBranch('delivery_calculator_pos_txs', b.id) || '[]') as POSTransaction[])
          .filter((t) => t.clientId === open.id).forEach((t) => out.push({ ...t, branch: b.name }));
      } catch { /* vacío */ }
    });
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);
  }, [open]);

  if (!isPro()) {
    return (
      <ProUpsell
        title="Que tus clientes regresen"
        text="Guarda a tus clientes con su teléfono, mira lo que compran y prémialos por volver. Un cliente que regresa vale mucho más que uno nuevo."
        bullets={['Lista de clientes con teléfono y notas ("sin cebolla")', 'Historial de compras y cuánto ha gastado cada uno', 'Recompensas por visita: "tu orden 10 va por la casa"', 'Clientes que dejaron de venir, con botón para escribirles por WhatsApp']}
        onUpgrade={onUpgrade}
      />
    );
  }

  const total = clients.length;
  const frecuentes = clients.filter((c) => c.visits >= 3).length;
  const perdidos = clients.filter((c) => c.visits > 0 && daysSince(c.lastVisit) > 30).length;

  const add = () => {
    if (!form.name.trim()) return;
    if (form.phone && clients.some((c) => c.phone && c.phone === normPhone(form.phone))) { alert('Ya hay un cliente con ese teléfono.'); return; }
    addClient(form.name, form.phone, form.notes.trim() || undefined);
    setClients(getClients());
    setForm({ name: '', phone: '', notes: '' });
  };
  const exportCsv = () => {
    const rows = [['Nombre', 'Teléfono', 'Visitas', 'Total gastado', 'Última visita', 'Notas'], ...clients.map((c) => [c.name, c.phone || '', c.visits, c.total.toFixed(2), c.lastVisit ? c.lastVisit.slice(0, 10) : '', c.notes || ''])];
    const csv = '\ufeff' + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `clientes-don-punto-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };
  const updateLoyalty = (patch: Partial<LoyaltyConfig>) => { const l = { ...loyalty, ...patch }; setLoyalty(l); saveLoyalty(l); };
  const input = 'w-full rounded-xl border border-carbon-950/15 bg-white px-3 py-2.5 text-sm text-carbon-900 outline-none focus:border-agave-500';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { k: 'todos' as const, l: 'Clientes', v: total },
          { k: 'frecuentes' as const, l: 'Frecuentes (3+ visitas)', v: frecuentes },
          { k: 'perdidos' as const, l: 'No vienen hace 30+ días', v: perdidos },
        ].map((x) => (
          <button key={x.k} onClick={() => setFilter(x.k)} className={`text-left rounded-3xl border p-6 transition-colors ${filter === x.k ? 'border-agave-400 bg-agave-50' : 'border-carbon-950/10 bg-white hover:border-agave-300'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-carbon-500">{x.l}</div>
            <div className="mt-2 font-display text-3xl font-bold text-carbon-950 tabular-nums">{x.v}</div>
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-3xl border border-carbon-950/10 bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-3 text-carbon-400" />
              <input className={input + ' pl-9'} placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button onClick={exportCsv} disabled={!clients.length} className="inline-flex items-center gap-2 rounded-full border border-carbon-950/15 px-4 py-2.5 text-sm font-semibold text-carbon-700 hover:bg-carbon-50 disabled:opacity-40"><Download size={15} /> Excel</button>
          </div>
          {list.length === 0 ? (
            <p className="mt-6 text-sm text-carbon-500">{total === 0 ? 'Aún no tienes clientes. Agrégalos aquí o desde el Punto de Venta al cobrar.' : 'Nadie coincide con la búsqueda.'}</p>
          ) : (
            <div className="mt-4 divide-y divide-carbon-950/10">
              {list.map((c) => (
                <div key={c.id} className="py-3 flex flex-wrap items-center gap-3">
                  <button onClick={() => setOpen(c)} className="flex items-center gap-3 flex-1 min-w-[180px] text-left">
                    <div className="w-9 h-9 rounded-full bg-agave-50 text-agave-700 flex items-center justify-center text-sm font-bold">{c.name.slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0">
                      <div className="font-semibold text-carbon-900 truncate">{c.name}</div>
                      <div className="text-xs text-carbon-500">{c.visits} {c.visits === 1 ? 'visita' : 'visitas'} · ${money(c.total)} · última {fmtDate(c.lastVisit)}</div>
                    </div>
                  </button>
                  {loyalty.enabled && (
                    <div className="flex items-center gap-1" title={`${c.stamps} de ${loyalty.every - 1} visitas para su recompensa`}>
                      {Array.from({ length: Math.min(loyalty.every - 1, 12) }).map((_, i) => (
                        <span key={i} className={`w-2 h-2 rounded-full ${i < c.stamps ? 'bg-maiz-500' : 'bg-carbon-200'}`} />
                      ))}
                      {c.stamps >= loyalty.every - 1 && <Gift size={15} className="ml-1 text-maiz-600" />}
                    </div>
                  )}
                  {c.phone && (
                    <a href={wa(c.phone, filter === 'perdidos' ? `¡Hola ${c.name}! Te extrañamos 😊 Ven esta semana y te consentimos.` : `¡Hola ${c.name}!`)} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-agave-700 hover:bg-agave-50" title="WhatsApp"><MessageCircle size={16} /></a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-carbon-950/10 bg-white p-6">
            <h3 className="font-display text-lg font-bold text-carbon-950">Nuevo cliente</h3>
            <div className="mt-4 space-y-3">
              <input className={input} placeholder="Nombre" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <input className={input} placeholder="Teléfono / WhatsApp" inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              <input className={input} placeholder="Nota (ej. sin cebolla)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <button onClick={add} disabled={!form.name.trim()} className="w-full inline-flex justify-center items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 disabled:opacity-40 px-5 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Guardar cliente</button>
            </div>
          </div>

          <div className="rounded-3xl border border-maiz-200 bg-maiz-50/60 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-carbon-950 flex items-center gap-2"><Gift size={18} className="text-maiz-700" /> Recompensa por visita</h3>
              <button onClick={() => updateLoyalty({ enabled: !loyalty.enabled })} className={`relative w-11 h-6 rounded-full transition-colors ${loyalty.enabled ? 'bg-agave-500' : 'bg-carbon-300'}`} aria-label="Activar recompensas">
                <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${loyalty.enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <div className={`mt-4 space-y-3 ${loyalty.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
              <label className="block text-sm text-carbon-700">En la visita número
                <input type="number" min={2} max={50} className={input + ' mt-1'} value={loyalty.every} onChange={(e) => updateLoyalty({ every: Math.max(2, Number(e.target.value) || 10) })} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <select className={input} value={loyalty.type} onChange={(e) => updateLoyalty({ type: e.target.value as LoyaltyConfig['type'] })}>
                  <option value="percent">% de descuento</option>
                  <option value="amount">$ de descuento</option>
                </select>
                <input type="number" min={1} className={input} value={loyalty.value} onChange={(e) => updateLoyalty({ value: Math.max(1, Number(e.target.value) || 1) })} />
              </div>
              <input className={input} placeholder="Texto del ticket" value={loyalty.label} onChange={(e) => updateLoyalty({ label: e.target.value })} />
              <p className="text-xs text-carbon-600">Ejemplo: visita 10 con 100% = la décima orden gratis. En el Punto de Venta aparece el botón "Aplicar recompensa" cuando el cliente la gana.</p>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-3xl bg-white p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-2xl font-bold text-carbon-950">{open.name}</h3>
                <div className="mt-1 text-sm text-carbon-500 flex items-center gap-2">{open.phone ? <><Phone size={13} />{open.phone}</> : 'Sin teléfono'}</div>
              </div>
              <button onClick={() => setOpen(null)} className="rounded-lg p-2 hover:bg-carbon-100"><X size={18} /></button>
            </div>
            {open.notes && <p className="mt-3 rounded-xl bg-maiz-50 px-3 py-2 text-sm text-maiz-900">{open.notes}</p>}
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-2xl bg-carbon-50 p-3"><div className="text-xs text-carbon-500">Visitas</div><div className="font-display text-xl font-bold">{open.visits}</div></div>
              <div className="rounded-2xl bg-carbon-50 p-3"><div className="text-xs text-carbon-500">Ha gastado</div><div className="font-display text-xl font-bold">${money(open.total)}</div></div>
              <div className="rounded-2xl bg-carbon-50 p-3"><div className="text-xs text-carbon-500">Promedio</div><div className="font-display text-xl font-bold">${money(open.visits ? open.total / open.visits : 0)}</div></div>
            </div>
            <h4 className="mt-6 text-sm font-bold text-carbon-900">Últimas compras</h4>
            {history.length === 0 ? <p className="mt-2 text-sm text-carbon-500">Sin compras registradas todavía.</p> : (
              <div className="mt-2 divide-y divide-carbon-950/10 text-sm">
                {history.map((t) => (
                  <div key={t.id} className="py-2 flex justify-between gap-3">
                    <div className="min-w-0"><div className="text-carbon-800 truncate">{t.notes || 'Venta'}</div><div className="text-xs text-carbon-500">{fmtDate(t.date)} · {t.branch}{t.rewardApplied ? ' · 🎁 recompensa' : ''}</div></div>
                    <div className="font-semibold tabular-nums">${money(t.amount)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              <button onClick={() => { const name = prompt('Nombre:', open.name); if (!name) return; const phone = prompt('Teléfono:', open.phone || '') ?? open.phone; const notes = prompt('Nota:', open.notes || '') ?? open.notes; const next = clients.map((c) => (c.id === open.id ? { ...c, name: name.trim(), phone: normPhone(phone) || undefined, notes: notes || undefined } : c)); persist(next); setOpen(next.find((c) => c.id === open.id) || null); }} className="inline-flex items-center gap-2 rounded-full border border-carbon-950/15 px-4 py-2 text-sm font-semibold text-carbon-700 hover:bg-carbon-50"><Pencil size={14} /> Editar</button>
              <button onClick={() => { if (confirm(`¿Borrar a ${open.name}? Sus ventas pasadas se conservan.`)) { persist(clients.filter((c) => c.id !== open.id)); setOpen(null); } }} className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Borrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
