import { useMemo, useState } from 'react';
import { Plus, Store, Trash2, Pencil, TrendingUp, TrendingDown, MapPin, Check } from 'lucide-react';
import { useSession, isPro, getBranches, saveBranches, type Branch } from '../../lib/session';
import { storeGetBranch, getActiveBranch, setActiveBranch, MAIN_BRANCH } from '../../lib/cloudStore';
import { money } from '../../lib/format';
import { ProUpsell } from '../pro/ProUpsell';
import type { POSTransaction } from '../../types/pos';

function txsOf(id: string): POSTransaction[] {
  try { return JSON.parse(storeGetBranch('delivery_calculator_pos_txs', id) || '[]'); } catch { return []; }
}
const sum = (t: POSTransaction[]) => t.reduce((a, x) => a + (Number(x.amount) || 0), 0);

export function BranchesModule({ onUpgrade }: { onUpgrade: () => void }) {
  useSession();
  const branches = getBranches();
  const active = getActiveBranch();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const rows = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d30 = new Date(today); d30.setDate(d30.getDate() - 29);
    const d60 = new Date(today); d60.setDate(d60.getDate() - 59);
    return branches.map((b) => {
      const all = txsOf(b.id);
      const hoy = all.filter((t) => new Date(t.date) >= today);
      const mes = all.filter((t) => new Date(t.date) >= d30);
      const prev = all.filter((t) => { const d = new Date(t.date); return d >= d60 && d < d30; });
      const byHour = new Array(24).fill(0);
      mes.forEach((t) => { byHour[new Date(t.date).getHours()] += t.amount; });
      const peak = byHour.indexOf(Math.max(...byHour));
      const apps = mes.filter((t) => t.destination && t.destination !== 'Tienda');
      const totalMes = sum(mes);
      const totalPrev = sum(prev);
      return {
        b, hoy: sum(hoy), hoyTickets: hoy.length, mes: totalMes, tickets: mes.length,
        promedio: mes.length ? totalMes / mes.length : 0,
        cambio: totalPrev > 0 ? ((totalMes - totalPrev) / totalPrev) * 100 : null,
        apps: totalMes ? (sum(apps) / totalMes) * 100 : 0,
        peak: Math.max(...byHour) > 0 ? peak : null,
      };
    });
  }, [branches]);

  if (!isPro()) {
    return (
      <ProUpsell
        title="Todas tus sucursales en un solo lugar"
        text="El plan Básico es para un negocio con una sucursal. Con Pro agregas todas las que tengas: cada una cobra con su propia caja y tú ves el reporte de todas juntas."
        bullets={['Cada sucursal con sus ventas, tickets, corte e inventario', 'Reporte que junta todas: cuál vende más y cuál va para abajo', 'Horario pico y ticket promedio por sucursal', 'Mismo menú y recetas para todas']}
        onUpgrade={onUpgrade}
      />
    );
  }

  const total = rows.reduce((a, r) => ({ hoy: a.hoy + r.hoy, mes: a.mes + r.mes, tickets: a.tickets + r.tickets }), { hoy: 0, mes: 0, tickets: 0 });
  const best = rows.length > 1 ? [...rows].sort((a, b) => b.mes - a.mes)[0] : null;
  const worst = rows.length > 1 ? [...rows].filter((r) => r.cambio !== null).sort((a, b) => (a.cambio ?? 0) - (b.cambio ?? 0))[0] : null;

  const add = () => {
    if (!name.trim()) return;
    saveBranches([...branches, { id: crypto.randomUUID().slice(0, 8), name: name.trim(), address: address.trim() || undefined }]);
    setName(''); setAddress('');
  };
  const rename = (b: Branch) => {
    const n = prompt('Nombre de la sucursal:', b.name);
    if (n && n.trim()) saveBranches(branches.map((x) => (x.id === b.id ? { ...x, name: n.trim() } : x)));
  };
  const remove = (b: Branch) => {
    if (b.id === MAIN_BRANCH) return;
    if (txsOf(b.id).length > 0 && !confirm(`"${b.name}" tiene ventas registradas. Si la quitas dejará de aparecer en reportes (los datos no se borran). ¿Continuar?`)) return;
    saveBranches(branches.filter((x) => x.id !== b.id));
    if (active === b.id) setActiveBranch(MAIN_BRANCH);
  };
  const input = 'w-full rounded-xl border border-carbon-950/15 bg-white px-3 py-2.5 text-sm text-carbon-900 outline-none focus:border-agave-500';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { l: 'Hoy, todas las sucursales', v: `$${money(total.hoy)}` },
          { l: 'Últimos 30 días', v: `$${money(total.mes)}` },
          { l: 'Tickets (30 días)', v: total.tickets.toLocaleString('es-MX') },
        ].map((k) => (
          <div key={k.l} className="rounded-3xl border border-carbon-950/10 bg-white p-6">
            <div className="text-[11px] font-bold uppercase tracking-wider text-carbon-500">{k.l}</div>
            <div className="mt-2 font-display text-3xl font-bold text-carbon-950 tabular-nums">{k.v}</div>
          </div>
        ))}
      </div>

      {(best || worst) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {best && <div className="rounded-2xl border border-agave-200 bg-agave-50 p-4 text-sm text-agave-900"><b>{best.b.name}</b> es la que más vende: ${money(best.mes)} en 30 días.</div>}
          {worst && (worst.cambio ?? 0) < 0 && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"><b>{worst.b.name}</b> bajó {Math.abs(worst.cambio ?? 0).toFixed(0)}% contra los 30 días anteriores. Revisa qué pasa ahí.</div>}
        </div>
      )}

      <div className="rounded-3xl border border-carbon-950/10 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-carbon-50 text-[11px] uppercase tracking-wider text-carbon-500">
              <tr>
                <th className="text-left px-5 py-3">Sucursal</th>
                <th className="text-right px-4 py-3">Hoy</th>
                <th className="text-right px-4 py-3">30 días</th>
                <th className="text-right px-4 py-3">vs. mes anterior</th>
                <th className="text-right px-4 py-3">Ticket prom.</th>
                <th className="text-right px-4 py-3">Por apps</th>
                <th className="text-right px-4 py-3">Hora pico</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-carbon-950/10">
              {rows.map((r) => (
                <tr key={r.b.id} className={r.b.id === active ? 'bg-agave-50/40' : ''}>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-carbon-900 flex items-center gap-2"><Store size={15} className="text-agave-600" />{r.b.name}</div>
                    {r.b.id === active && <div className="text-[11px] text-agave-700 font-semibold mt-0.5">Este equipo cobra aquí</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">${money(r.hoy)}<div className="text-[11px] text-carbon-500">{r.hoyTickets} tickets</div></td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-carbon-900">${money(r.mes)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {r.cambio === null ? <span className="text-carbon-400">—</span> : (
                      <span className={`inline-flex items-center gap-1 font-semibold ${r.cambio >= 0 ? 'text-agave-700' : 'text-rose-600'}`}>
                        {r.cambio >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{r.cambio >= 0 ? '+' : ''}{r.cambio.toFixed(0)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">${money(r.promedio)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.apps.toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">{r.peak === null ? '—' : `${r.peak}:00`}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.b.id !== active && <button onClick={() => setActiveBranch(r.b.id)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-agave-700 hover:bg-agave-50">Cobrar aquí</button>}
                    <button onClick={() => rename(r.b)} title="Renombrar" className="rounded-lg p-2 text-carbon-600 hover:bg-carbon-100"><Pencil size={14} /></button>
                    {r.b.id !== MAIN_BRANCH && <button onClick={() => remove(r.b)} title="Quitar" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={14} /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-carbon-950/10 bg-white p-6 max-w-2xl">
        <h3 className="font-display text-lg font-bold text-carbon-950">Agregar sucursal</h3>
        <p className="text-sm text-carbon-500 mt-1">Comparte tu menú y recetas. Ventas, tickets, corte, inventario y gastos van por separado.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Nombre (ej. Sucursal Centro)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="relative"><MapPin size={15} className="absolute left-3 top-3 text-carbon-400" /><input className={input + ' pl-9'} placeholder="Dirección (opcional)" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        </div>
        <button onClick={add} disabled={!name.trim()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 disabled:opacity-40 px-5 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Agregar sucursal</button>
        <p className="mt-4 text-xs text-carbon-500 flex gap-1.5"><Check size={14} className="text-agave-600 shrink-0" /> En cada caja o tablet elige "Cobrar aquí" (o el selector arriba del menú) para que sus ventas caigan en la sucursal correcta.</p>
      </div>
    </div>
  );
}
