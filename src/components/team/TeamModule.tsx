import { useMemo, useState } from 'react';
import { Plus, Trash2, UserCog, ShieldCheck, Power } from 'lucide-react';
import { useSession, isPro, getTeam, saveTeam, getBranches, teamLimit, roleAllowed, usableTeam, isSystemUser, CLOCK_JOBS, type Employee, type Role } from '../../lib/session';
import { usePOS } from '../../hooks/usePOS';
import { storeGet } from '../../lib/cloudStore';
import { money } from '../../lib/format';
import { ProUpsell } from '../pro/ProUpsell';
import { AttendanceReport } from './AttendanceReport';
import type { Cancellation } from '../../types/pos';

const ROLE_INFO: Record<Role, string> = {
  mesero: 'Toma órdenes y las manda a cocina. No cobra, no hace descuentos ni borra.',
  cajero: 'Cobra y ve solo lo que dejes abierto a la caja.',
  gerente: 'Todo menos Ajustes, Financiero, Equipo y Sucursales.',
};

export function TeamModule({ onUpgrade, adminPin }: { onUpgrade: () => void; adminPin: string }) {
  useSession();
  const allTeam = getTeam();
  const team = allTeam.filter((e) => !e.tipsOnly);
  const systemTeam = team.filter(isSystemUser);
  const tipsTeam = allTeam.filter((e) => e.tipsOnly);
  const [tipName, setTipName] = useState('');
  const [tipBranch, setTipBranch] = useState('');
  const branches = getBranches();
  const { transactions } = usePOS();
  // job: 'r:<rol>' = usa el sistema; 'j:<puesto>' = solo checa; 'otro' = solo checa con puesto escrito
  const [form, setForm] = useState<{ name: string; pin: string; job: string; other: string; branchId: string }>({ name: '', pin: '', job: 'r:cajero', other: '', branchId: '' });
  const formRole: Role | null = form.job.startsWith('r:') ? (form.job.slice(2) as Role) : null;
  const [error, setError] = useState('');
  const [range, setRange] = useState<'hoy' | 'semana' | 'mes'>('hoy');

  const stats = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (range === 'semana') start.setDate(start.getDate() - 6);
    if (range === 'mes') start.setDate(1);
    let cancels: Cancellation[] = [];
    try { cancels = JSON.parse(storeGet('donPuntoCancelaciones') || '[]'); } catch { /* vacío */ }
    const map = new Map<string, { name: string; ventas: number; tickets: number; descuentos: number; cancelaciones: number; cancelado: number; ordenes: number; atendido: number; propinas: number }>();
    const get = (id: string, name: string) => {
      if (!map.has(id)) map.set(id, { name, ventas: 0, tickets: 0, descuentos: 0, cancelaciones: 0, cancelado: 0, ordenes: 0, atendido: 0, propinas: 0 });
      return map.get(id)!;
    };
    transactions.filter((t) => new Date(t.date) >= start).forEach((t) => {
      const r = get(t.employeeId || 'sin', t.employeeName || 'Sin identificar');
      r.ventas += t.amount; r.tickets += 1; r.descuentos += t.discountAmount || 0;
      // Mesero que tomó la orden (para propinas / comisiones)
      if (t.waiterId) { const w = get(t.waiterId, t.waiterName || 'Mesero'); w.ordenes += 1; w.atendido += t.amount; }
      // Propina: del mesero que atendió; si no hubo mesero, de quien cobró (las de apps no son del personal)
      if ((t.tip || 0) > 0 && !['Uber', 'Didi', 'Rappi'].includes(t.paymentMethod)) (t.waiterId ? get(t.waiterId, t.waiterName || 'Mesero') : r).propinas += t.tip || 0;
    });
    cancels.filter((c) => new Date(c.date) >= start).forEach((c) => {
      const r = get(c.byId || 'sin', c.byName || 'Sin identificar');
      r.cancelaciones += 1; r.cancelado += c.amount;
    });
    return [...map.values()].sort((a, b) => b.ventas + b.atendido - (a.ventas + a.atendido));
  }, [transactions, range]);

  const pro = isPro();
  const limit = teamLimit();
  const full = systemTeam.length >= limit;
  const usable = new Set(usableTeam().map((e) => e.id));

  const add = () => {
    setError('');
    if (formRole && full) return setError('Tu plan Básico incluye 1 cajero. Para agregar más personal que use el sistema cámbiate a Pro. El personal que solo checa (cocina, hostess…) no tiene límite.');
    if (formRole && !roleAllowed(formRole)) return setError('Meseros y gerentes son del plan Pro.');
    const jobTitle = form.job === 'otro' ? form.other.trim() : form.job.startsWith('j:') ? form.job.slice(2) : '';
    if (!formRole && !jobTitle) return setError('Escribe el puesto.');
    const name = form.name.trim();
    const pin = form.pin.trim();
    if (!name) return setError('Escribe el nombre.');
    if (!/^\d{4,6}$/.test(pin)) return setError('El PIN debe ser de 4 a 6 números.');
    if (pin === (adminPin || '1234')) return setError('Ese PIN es el del dueño. Usa otro.');
    if (allTeam.some((e) => e.pin === pin)) return setError('Otro empleado ya usa ese PIN.');
    saveTeam([...allTeam, formRole
      ? { id: crypto.randomUUID(), name, pin, role: formRole, branchId: form.branchId || undefined, active: true }
      : { id: crypto.randomUUID(), name, pin, role: 'cajero', clockOnly: true, jobTitle, branchId: form.branchId || undefined, active: true }]);
    setForm({ name: '', pin: '', job: 'r:cajero', other: '', branchId: '' });
  };
  const update = (id: string, patch: Partial<Employee>) => saveTeam(allTeam.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => { if (confirm('¿Eliminar a este empleado? Sus ventas pasadas se conservan.')) saveTeam(allTeam.filter((e) => e.id !== id)); };
  const addTipWaiter = () => {
    const name = tipName.trim();
    if (!name) return;
    saveTeam([...allTeam, { id: crypto.randomUUID(), name, pin: '', role: 'mesero', branchId: tipBranch || undefined, active: true, tipsOnly: true }]);
    setTipName('');
  };
  // Meseros para propinas: PIN opcional que SOLO sirve para checar entrada/salida (no entran al sistema)
  const setClockPin = (e: Employee) => {
    const pin = (prompt(`PIN para que ${e.name} cheque su entrada y salida (4 a 6 números).\nSolo sirve para el checador, no para entrar al sistema.${e.pin ? '\nDéjalo vacío para quitarlo.' : ''}`) ?? '__cancel').trim();
    if (pin === '__cancel') return;
    if (!pin) { if (e.pin) update(e.id, { pin: '' }); return; }
    if (!/^\d{4,6}$/.test(pin) || pin === (adminPin || '1234') || allTeam.some((x) => x.pin === pin && x.id !== e.id)) { alert('PIN inválido o ya en uso.'); return; }
    update(e.id, { pin });
  };
  // Cambiar el puesto de alguien ya dado de alta (entre roles del sistema y puestos que solo checan)
  const changeJob = (e: Employee, v: string) => {
    if (v.startsWith('r:')) {
      const role = v.slice(2) as Role;
      if (!isSystemUser(e) && systemTeam.length >= limit) { alert('Tu plan Básico incluye 1 cajero. Para que más personal use el sistema cámbiate a Pro.'); return; }
      update(e.id, { role, clockOnly: false, jobTitle: undefined });
      return;
    }
    const jobTitle = v === 'otro' ? (prompt('¿Cuál es el puesto?', e.clockOnly ? e.jobTitle || '' : '') || '').trim() : v.slice(2);
    if (!jobTitle) return;
    update(e.id, { clockOnly: true, jobTitle, role: 'cajero' });
  };
  const jobValue = (e: Employee) => (!e.clockOnly ? `r:${e.role}` : CLOCK_JOBS.includes(e.jobTitle || '') ? `j:${e.jobTitle}` : `c:${e.jobTitle || ''}`);
  const jobOptions = (custom?: string) => (
    <>
      <optgroup label="Usa el sistema">
        <option value="r:mesero" disabled={!pro}>Mesero{pro ? '' : ' (Pro)'}</option>
        <option value="r:cajero">Cajero</option>
        <option value="r:gerente" disabled={!pro}>Gerente{pro ? '' : ' (Pro)'}</option>
      </optgroup>
      <optgroup label="Solo checa entrada / salida">
        {CLOCK_JOBS.map((j) => <option key={j} value={`j:${j}`}>{j}</option>)}
        {custom && <option value={`c:${custom}`}>{custom}</option>}
        <option value="otro">Otro puesto…</option>
      </optgroup>
    </>
  );
  const input = 'w-full rounded-xl border border-carbon-950/15 bg-white px-3 py-2.5 text-sm text-carbon-900 outline-none focus:border-agave-500';

  return (
    <div className="space-y-6">
    <div className="grid gap-6 xl:grid-cols-5">
      <div className="xl:col-span-3 space-y-6">
        <div className="rounded-3xl border border-carbon-950/10 bg-white p-6">
          <h3 className="font-display text-lg font-bold text-carbon-950 flex items-center gap-2"><UserCog size={18} className="text-agave-600" /> Agregar empleado</h3>
          {!pro && <p className="mt-1 text-xs text-carbon-500">Plan Básico: 2 usuarios — tú (dueño) y 1 cajero con su propio PIN.</p>}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Nombre (ej. Juan)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className={input} placeholder="PIN de 4 a 6 números" inputMode="numeric" maxLength={6} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })} />
            <select className={input} value={form.job} onChange={(e) => setForm({ ...form, job: e.target.value })} aria-label="Puesto">
              {jobOptions()}
            </select>

            {pro && <select className={input} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>}
            {form.job === 'otro' && <input className={input + ' sm:col-span-2'} placeholder="Escribe el puesto (ej. Parrillero)" value={form.other} onChange={(e) => setForm({ ...form, other: e.target.value })} autoFocus />}
          </div>
          <p className="mt-2 text-xs text-carbon-500">{formRole ? ROLE_INFO[formRole] : 'Solo checa su entrada y salida con su PIN. No entra al sistema y no cuenta en el límite de tu plan.'}</p>
          {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}
          <button onClick={add} disabled={!!formRole && full} className="mt-4 disabled:opacity-40 inline-flex items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 px-5 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Agregar</button>
        </div>

        <div className="rounded-3xl border border-carbon-950/10 bg-white p-6">
          <h3 className="font-display text-lg font-bold text-carbon-950">Tu equipo ({team.length})</h3>
          {!pro && <p className="mt-0.5 text-xs text-carbon-500">Usan el sistema: {systemTeam.length} de {limit}. El personal que solo checa no tiene límite.</p>}
          {team.length === 0 ? (
            <p className="mt-3 text-sm text-carbon-500">Aún no hay empleados. Cuando agregues el primero, al abrir la caja se pedirá "¿Quién cobra?".</p>
          ) : (
            <div className="mt-4 divide-y divide-carbon-950/10">
              {team.map((e) => (
                <div key={e.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${e.active ? 'bg-agave-50 text-agave-700' : 'bg-carbon-100 text-carbon-400'}`}>{e.name.slice(0, 1).toUpperCase()}</div>
                  <div className="flex-1 min-w-[140px]">
                    <div className={`font-semibold ${e.active ? 'text-carbon-900' : 'text-carbon-400 line-through'}`}>{e.name}</div>
                    <div className="text-xs text-carbon-500">{e.clockOnly ? 'Solo checa · ' : ''}PIN •••• · {branches.find((b) => b.id === e.branchId)?.name || 'Todas las sucursales'}</div>
                    {e.active && isSystemUser(e) && !usable.has(e.id) && <div className="text-[11px] font-semibold text-maiz-800">No puede entrar con el plan Básico</div>}
                  </div>
                  <select value={jobValue(e)} onChange={(ev) => changeJob(e, ev.target.value)} aria-label={`Puesto de ${e.name}`} className="max-w-[170px] rounded-lg border border-carbon-950/15 bg-white px-2 py-1.5 text-xs font-semibold text-carbon-800">
                    {jobOptions(e.clockOnly && !CLOCK_JOBS.includes(e.jobTitle || '') ? e.jobTitle : undefined)}
                  </select>
                  <button onClick={() => { const pin = prompt(`Nuevo PIN para ${e.name} (4 a 6 números):`) || ''; if (/^\d{4,6}$/.test(pin) && pin !== (adminPin || '1234') && !allTeam.some((x) => x.pin === pin && x.id !== e.id)) update(e.id, { pin }); else if (pin) alert('PIN inválido o ya en uso.'); }} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-carbon-700 hover:bg-carbon-100">Cambiar PIN</button>
                  <button onClick={() => update(e.id, { active: !e.active })} title={e.active ? 'Desactivar' : 'Activar'} className="rounded-lg p-2 text-carbon-600 hover:bg-carbon-100"><Power size={15} /></button>
                  <button onClick={() => remove(e.id)} title="Eliminar" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-carbon-950/10 bg-white p-6" data-tour="tip-waiters">
          <h3 className="font-display text-lg font-bold text-carbon-950">Meseros para propinas ({tipsTeam.length})</h3>
          <p className="mt-1 text-xs text-carbon-500">No entran al sistema y no cuentan en el límite de tu plan. La caja elige al mesero al cobrar y su propina sale a su nombre en el corte. Dales un <b>PIN para checar</b> y registran su entrada y salida en el checador.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input className={input + ' flex-1 min-w-[160px]'} placeholder="Nombre del mesero (ej. Pepe)" value={tipName} onChange={(e) => setTipName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTipWaiter(); }} />
            {pro && branches.length > 1 && <select className={input + ' w-auto'} value={tipBranch} onChange={(e) => setTipBranch(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>}
            <button onClick={addTipWaiter} disabled={!tipName.trim()} className="disabled:opacity-40 inline-flex items-center gap-2 rounded-full bg-agave-600 hover:bg-agave-700 px-5 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> Agregar</button>
          </div>
          {tipsTeam.length > 0 && (
            <div className="mt-4 divide-y divide-carbon-950/10">
              {tipsTeam.map((e) => (
                <div key={e.id} className="py-2.5 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${e.active ? 'bg-maiz-50 text-maiz-800' : 'bg-carbon-100 text-carbon-400'}`}>{e.name.slice(0, 1).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold truncate ${e.active ? 'text-carbon-900' : 'text-carbon-400 line-through'}`}>{e.name}</div>
                    <div className="text-xs text-carbon-500">{e.pin ? 'Checa con PIN ••••' : 'Sin PIN para checar'}{branches.length > 1 ? ` · ${branches.find((b) => b.id === e.branchId)?.name || 'Todas las sucursales'}` : ''}</div>
                  </div>
                  <button onClick={() => setClockPin(e)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-carbon-700 hover:bg-carbon-100 whitespace-nowrap">{e.pin ? 'Cambiar PIN' : 'PIN para checar'}</button>
                  <button onClick={() => update(e.id, { active: !e.active })} title={e.active ? 'Desactivar' : 'Activar'} className="rounded-lg p-2 text-carbon-600 hover:bg-carbon-100"><Power size={15} /></button>
                  <button onClick={() => remove(e.id)} title="Eliminar" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {!pro && <div className="xl:col-span-3 xl:row-start-2">
        <ProUpsell
          title="¿Necesitas más personal?"
          text="Tu plan Básico incluye al dueño y 1 cajero. Con Pro agregas todos los empleados que quieras: meseros que mandan órdenes a cocina, más cajeros y gerentes."
          bullets={['Empleados ilimitados, cada uno con su PIN', 'Meseros: toman órdenes y las mandan a cocina, sin cobrar', 'Gerentes con permisos distintos', 'PIN por sucursal']}
          onUpgrade={onUpgrade}
        />
      </div>}
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
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div><div className="text-carbon-500">Propinas</div><div className={`font-semibold tabular-nums ${r.propinas > 0 ? 'text-agave-700' : 'text-carbon-800'}`}>${money(r.propinas)}</div></div>
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
    <AttendanceReport />
    </div>
  );
}
