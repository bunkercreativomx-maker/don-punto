import { useEffect, useState } from 'react';
import { Clock, LogIn, LogOut, CheckCircle2, WifiOff, Loader2 } from 'lucide-react';
import { PinPad } from '../access/PinPad';
import { findClockEmployee, lastPunch, punch, fmtTime, type ClockKind } from '../../lib/attendance';
import type { Employee } from '../../lib/session';

/** Checador: el empleado escribe su PIN y marca entrada o salida. No inicia sesión ni abre la caja. */
export function ClockModal({ onClose, ownerPin }: { onClose: () => void; ownerPin: string }) {
  const [emp, setEmp] = useState<Employee | null>(null);
  const [last, setLast] = useState<{ kind: ClockKind; at: Date } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ kind: ClockKind; at: Date; offline: boolean } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!emp) return;
    let alive = true;
    lastPunch(emp.id).then((l) => { if (alive) setLast(l); });
    return () => { alive = false; };
  }, [emp]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [done, onClose]);

  if (!emp) {
    return (
      <PinPad
        title="Checador"
        subtitle="Escribe tu PIN para registrar tu entrada o tu salida."
        onClose={onClose}
        onSubmit={(pin) => {
          if (pin === (ownerPin || '1234')) return 'PIN incorrecto';
          const e = findClockEmployee(pin);
          if (!e) return 'PIN incorrecto';
          setEmp(e);
          return true;
        }}
      />
    );
  }

  // Sugerencia: si lo último fue entrada (en las últimas 36 h) toca salida
  const suggested: ClockKind = last?.kind === 'in' ? 'out' : 'in';
  const go = async (kind: ClockKind) => {
    setBusy(true); setErr('');
    try { setDone({ kind, ...(await punch(emp, kind)) }); }
    catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };
  const btn = (kind: ClockKind) => {
    const primary = kind === suggested;
    const Icon = kind === 'in' ? LogIn : LogOut;
    return (
      <button type="button" disabled={busy || last === undefined} onClick={() => go(kind)}
        className={`h-20 rounded-2xl font-bold text-base flex flex-col items-center justify-center gap-1 transition disabled:opacity-50 ${primary ? (kind === 'in' ? 'bg-agave-600 hover:bg-agave-700 text-white' : 'bg-carbon-900 hover:bg-carbon-800 text-white') : 'bg-carbon-50 hover:bg-carbon-100 text-carbon-800 border border-carbon-950/10'}`}>
        <Icon size={22} /> {kind === 'in' ? 'ENTRADA' : 'SALIDA'}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="bg-white border border-carbon-950/10 rounded-3xl w-full max-w-sm shadow-[0_24px_60px_-24px_rgba(13,16,14,0.35)] overflow-hidden">
        {done ? (
          <div className="p-8 text-center" role="status">
            <CheckCircle2 size={48} className="mx-auto text-agave-600" />
            <h3 className="mt-3 font-display text-2xl font-bold text-carbon-950">{done.kind === 'in' ? 'Entrada registrada' : 'Salida registrada'}</h3>
            <p className="mt-1 text-carbon-700"><b>{emp.name}</b> · <span className="tabular-nums">{fmtTime(done.at)}</span></p>
            <p className="mt-1 text-xs text-carbon-500">{done.at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            {done.offline && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-maiz-50 px-3 py-1 text-xs font-semibold text-maiz-800"><WifiOff size={13} /> Sin internet: se guardó en este equipo y se sube solo al volver la conexión</p>}
            <button type="button" onClick={onClose} className="mt-5 w-full rounded-2xl bg-carbon-100 hover:bg-carbon-200 py-3 text-sm font-bold text-carbon-800">Listo</button>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-agave-50 text-agave-700 flex items-center justify-center"><Clock size={22} /></div>
              <div className="min-w-0">
                <div className="font-display text-xl font-bold text-carbon-950 truncate">Hola, {emp.name}</div>
                <div className="text-xs text-carbon-500">
                  {last === undefined ? <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Revisando tu última checada…</span>
                    : last ? `Última: ${last.kind === 'in' ? 'entrada' : 'salida'} ${last.at.toLocaleDateString('es-MX', { weekday: 'short' })} ${fmtTime(last.at)}` : 'Sin checadas recientes'}
                </div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">{btn('in')}{btn('out')}</div>
            <p className="mt-3 text-[11px] text-carbon-500 text-center">La hora la pone el sistema, no este equipo. Si te equivocas, avísale al encargado para que lo corrija.</p>
            {err && <p className="mt-2 text-center text-sm font-semibold text-rose-600">{err}</p>}
            <button type="button" disabled={busy} onClick={onClose} className="mt-3 w-full py-2.5 text-sm font-semibold text-carbon-600 hover:text-carbon-900">Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}
