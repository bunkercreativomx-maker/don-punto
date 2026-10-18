import { useMemo, useState } from 'react';
import { Plus, Trash2, UserCog, ShieldCheck, Power } from 'lucide-react';
import { useSession, isPro, getTeam, saveTeam, getBranches, type Employee, type Role } from '../../lib/session';
import { usePOS } from '../../hooks/usePOS';
import { storeGet } from '../../lib/cloudStore';
import { money } from '../../lib/format';
import { ProUpsell } from '../pro/ProUpsell';
import type { Cancellation } from '../../types/pos';

const ROLE_INFO: Record<Role, string> = {
  mesero: 'Toma órdenes y las manda a cocina. No cobra, no hace descuentos ni borra.',
  cajero: 'Cobra y ve solo lo que dejes abierto a la caja.',
  gerente: 'Todo menos Ajustes, Financiero, Equipo y Sucursales.',
};

export function TeamModule({ onUpgrade, adminPin }: { onUpgrade: () => void; adminPin: string }) {
  useSession();
  const team = getTeam();
  const branches = getBranches();
  const { transactions } = usePOS();
  const [form, setForm] = useState<{ name: string; pin: string; role: Role; branchId: string }>({ name: '', pin: '', role: 'cajero', branchId: '' });
  const [error, setError] = useState('');
  const [range, setRange] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  const stats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'semana') start.setDate(start.getDate() - 6);
    if (range === 'mes') start.setDate(1);
    let cancels: Cancellation[] = [];
    try { cancels = JSON.parse(storeGet('donPuntoCancelaciones') || '[]'); } catch { /* vacío */ }
    const map = new Map<string, { name: string; ventas: number; tickets: number; descuentos: number; cancelaciones: number; cancelado: number; ordenes: number; atendido: number }>();
    const get = (id: string, name: string) => {
      if (!map.has(id)) map.set(id, { name, ventas: 0, tickets: 0, descuentos: 0, cancelaciones: 0, cancelado: 0, ordenes: 0, atendido: 0 });
      return map.get(id)!;
    };
    transactions.filter((t) => new Date(t.date) >= start).forEach((t) => {
      const r = get(t.employeeId || 'sin', t.employeeName || 'Sin identificar');
      r.ventas += t.amount; r.tickets += 1; r.descuentos += t.discountAmount || 0;
      // Mesero que tomó la orden (para propinas / comisiones)
      if (t.waiterId) { const w = get(t.waiterId, t.waiterName || 'Mesero'); w.ordenes += 1; w.atendido += t.amount; }
    });
    cancels.filter((c) => new Date(c.date) >= start).forEach((c) => {
      const r = get(c.byId || 'sin', c.byName || 'Sin identificar');
      r.cancelaciones += 1; r.cancelado += c.amount;
    });
    return [...map.values()].sort((a, b) => b.ventas + b.atendido - (a.ventas + a.atendido));
  }, [transactions, range]);

  if (!isPro()) {
    return (
      <ProUpsell
        title="Cada empleado con su propio PIN"
        text="Hoy todos en tu negocio usan el mismo PIN. Con Pro, cada cajero entra con el suyo y sabes exactamente quién cobró, quién hizo descuentos y quién canceló tickets."
        bullets={['PIN propio por empleado y por sucursal', 'Rol de cajero o gerente con permisos distintos', 'Reporte por cajero: ventas, descuentos y cancelaciones', 'Al abrir la caja se pide "¿Quién cobra?"']}
        onUpgrade={onUpgrade}
      />
    );
  }

  const add = () => {
    setError('');
    const name = form.name.trim();
    const pin = form.pin.trim();
    if (!name) return setError('Escribe el nombre.');
    if (!/^\d{4,6}$/.test(pin)) return setError('El PIN debe ser de 4 a 6 números.');
    if (pin === (adminPin || '1234')) return setError('Ese PIN es el del dueño. Usa otro.');
    if (team.some((e) => e.pin === pin)) return setError('Otro empleado ya usa ese PIN.');
    saveTeam([...team, { id: crypto.randomUUID(), name, pin, role: form.role, branchId: form.branchId || undefined, active: true }]);
    setForm({ name: '', pin: '', role: 'cajero', branchId: '' });
  };
  const update = (id: string, patch: Partial<Employee>) => saveTeam(team.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => { if (confirm('¿Eliminar a este empleado? Sus ventas pasadas se conservan.')) saveTeam(team.filter((e) => e.id !== id)); };
  const input = 'w-full rounded-xl border border-carbon-950/15 bg-white px-3 py-2.5 text-sm text-carbon-900 outline-none focus:border-agave-500';

  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3 space-y-6">
        <div className="rounded-3xl border border-carbon-950/10 bg-white p-6">
          <h3 className="font-display text-lg font-bold text-carbon-950 flex items-center gap-2"><UserCog size={18} className="text-agave-600" /> Agregar empleado</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nombre (ej. Juan)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} placeholder="PIN de 4 a 6 números" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="mesero">Mesero</option>
              <option value="cajero">Cajero</option>
              <option value="gerente">Gerente</option>
            </select>
            <select className={input} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <p className="mt-2 text-xs text-carbon-500">{ROLE_INFO[form.role]}</p>
          {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}
          <button onClick={add} className="mt-4 inline-flex items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 px-5 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Agregar</button>
        </div>

        <div className="rounded-3xl border border-carbon-950/10 bg-white p-6">
          <h3 className="font-display text-lg font-bold text-carbon-950">Tu equipo ({team.length})</h3>
          {team.length === 0 ? (
            <p className="mt-3 text-sm text-carbon-500">Aún no hay empleados. Cuando agregues el primero, al abrir la caja se pedirá "¿Quién cobra?".</p>
          ) : (
            <div className="mt-4 divide-y divide-carbon-950/10">
              {team.map((e) => (
                <div key={e.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${e.active ? 'bg-agave-50 text-agave-700' : 'bg-carbon-100 text-carbon-400'}`}>{e.name.slice(0, 1).toUpperCase()}</div>
                  <div className="flex-1 min-w-[140px]">
                    <div className={`font-semibold ${e.active ? 'text-carbon-900' : 'text-carbon-400 line-through'}`}>{e.name}</div>
                    <div className="text-xs text-carbon-500">PIN •••• · {branches.find((b) => b.id === e.branchId)?.name || 'Todas las sucursales'}</div>
                  </div>
                  <select value={e.role} onChange={(ev) => update(e.id, { role: ev.target.value as Role })} className="rounded-lg border border-carbon-950/15 bg-white px-2 py-1.5 text-xs font-semibold text-carbon-800">
                    <option value="mesero">Mesero</option>
                    <option value="cajero">Cajero</option>
                    <option value="gerente">Gerente</option>
                  </select>
                  <button onClick={() => { const pin = prompt(`Nuevo PIN para ${e.name} (4 a 6 números):`) || ''; if (/^\d{4,6}$/.test(pin) && pin !== adminPin && !team.some((x) => x.pin === pin && x.id !== e.id)) update(e.id, { pin }); else if (pin) alert('PIN inválido o ya en uso.'); }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-carbon-700 hover:bg-carbon-100">Cambiar PIN</button>
                  <button onClick={() => update(e.id, { active: !e.active })} title={e.active ? 'Desactivar' : 'Activar'} className="rounded-lg p-2 text-carbon-600 hover:bg-carbon-100"><Power size={15} /></button>
                  <button onClick={() => remove(e.id)} title="Eliminar" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-2 rounded-3xl border border-carbon-950/10 bg-white p-6 h-fit">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-carbon-950 flex items-center gap-2"><ShieldCheck size={18} className="text-agave-600" /> Por persona</h3>
          <div className="flex rounded-full bg-carbon-100 p-0.5 text-xs font-semibold">
            {(['hoy', 'semana', 'mes'] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 capitalize ${range === r ? 'bg-white text-carbon-900 shadow-sm' : 'text-carbon-600'}`}>{r}</button>
            ))}
          </div>
        </div>
        {stats.length === 0 ? <p className="mt-4 text-sm text-carbon-500">Sin ventas en este periodo.</p> : (
          <div className="mt-4 space-y-3">
            {stats.map((r) => (
              <div key={r.name} className="rounded-2xl border border-carbon-950/10 p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-carbon-900">{r.name}</div>
                  <div className="font-display text-lg font-bold text-carbon-950 tabular-nums">${money(r.ventas)}</div>
                </div>
                {r.ordenes > 0 && <div className="mt-1 text-xs text-agave-700 font-semibold">Como mesero: {r.ordenes} {r.ordenes === 1 ? 'orden' : 'órdenes'} · ${money(r.atendido)}</div>}
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div><div className="text-carbon-500">Tickets</div><div className="font-semibold text-carbon-800 tabular-nums">{r.tickets}</div></div>
                  <div><div className="text-carbon-500">Descuentos</div><div className={`font-semibold tabular-nums ${r.descuentos > 0 ? 'text-maiz-800' : 'text-carbon-800'}`}>${money(r.descuentos)}</div></div>
                  <div><div className="text-carbon-500">Cancelado</div><div className={`font-semibold tabular-nums ${r.cancelaciones > 0 ? 'text-rose-600' : 'text-carbon-800'}`}>{r.cancelaciones} · ${money(r.cancelado)}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
