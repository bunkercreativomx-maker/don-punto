import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Clock, Download, Printer, FileSignature, Plus, Pencil, AlertTriangle, WifiOff, Loader2, X } from 'lucide-react';
import { usePOS } from '../../hooks/usePOS';
import { getTeam, currentBranch, useSession, jobLabel } from '../../lib/session';
import {
  fetchClock, effectivePunches, buildShifts, weekTotals, addCorrection, flushClockQueue, pendingCount, pbDate,
  fmtTime, fmtDay, fmtHours, type ClockRecord, type Shift, type ClockKind, type Punch,
} from '../../lib/attendance';
import { runPrint } from '../../lib/print';
import { PrintArea } from '../print/PrintArea';

type Range = 'semana' | 'pasada' | 'mes' | 'mespasado';
const RANGE_LABEL: Record<Range, string> = { semana: 'Esta semana', pasada: 'Semana pasada', mes: 'Este mes', mespasado: 'Mes pasado' };
function rangeDates(r: Range): [Date, Date] {
  const now = new Date();
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7));
  if (r === 'semana') return [mon, now];
  if (r === 'pasada') { const a = new Date(mon); a.setDate(a.getDate() - 7); const b = new Date(mon.getTime() - 1); return [a, b]; }
  if (r === 'mes') return [new Date(now.getFullYear(), now.getMonth(), 1), now];
  return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, -1)];
}
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fullDT = (d?: Date | null) => (d ? d.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
/** Checada que se corrige: la entrada o la salida del día elegido (en "agregar" no hay) */
const fixTarget = (f: Fix) => (f.mode === 'add' ? undefined : f.kind === 'in' ? f.shift?.inP : f.shift?.outP);
const ACTION_LABEL: Record<string, string> = { add: 'Agregó checada', fix: 'Cambió la hora', void: 'Anuló checada' };

type Fix = { emp: { id: string; name: string }; shift?: Shift; mode: 'fix' | 'add' | 'void'; kind: ClockKind; at: string; reason: string };

export function AttendanceReport() {
  const { operator } = useSession();
  const { settings } = usePOS();
  const [range, setRange] = useState<Range>('semana');
  const [empFilter, setEmpFilter] = useState('');
  const [recs, setRecs] = useState<ClockRecord[] | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [saving, setSaving] = useState(false);
  const [fixErr, setFixErr] = useState('');
  const [printWhat, setPrintWhat] = useState<null | 'report' | { agreement: string }>(null);
  const [agreeEmp, setAgreeEmp] = useState('');
  const [from, to] = useMemo(() => rangeDates(range), [range]);

  const load = useCallback(async () => {
    setLoadErr('');
    await flushClockQueue().catch(() => 0);
    try { setRecs(await fetchClock(from, to)); }
    catch (e) { console.warn('checador', e); setLoadErr('No se pudo cargar el registro. Revisa tu internet.'); setRecs([]); }
  }, [from, to]);
  useEffect(() => { setRecs(null); void load(); }, [load]);

  const team = getTeam().filter((e) => e.pin);
  const data = useMemo(() => {
    const all = recs || [];
    const punches = effectivePunches(all).filter((p) => p.at >= from && p.at <= to && (!empFilter || p.employeeId === empFilter));
    const shifts = buildShifts(punches);
    const weeks = weekTotals(shifts);
    const byId = new Map(all.map((r) => [r.id, r]));
    // Correcciones de checadas de este periodo (aunque se hayan hecho después)
    const inRange = (d: Date | null) => !!d && d >= from && d <= to;
    const recAt = (r?: ClockRecord) => (!r ? null : r.action === 'add' ? pbDate(r.at) : r.offline ? pbDate(r.device_at) : pbDate(r.created));
    const corrections = all.filter((r) => r.action !== 'punch' && (!empFilter || r.employee_id === empFilter))
      .filter((r) => (r.action === 'add' ? inRange(pbDate(r.at)) : inRange(recAt(byId.get(r.ref || '')))));
    return { punches, shifts, weeks, corrections, byId, all };
  }, [recs, from, to, empFilter]);

  const employees = useMemo(() => {
    const m = new Map<string, string>();
    team.forEach((e) => m.set(e.id, e.name));
    (recs || []).forEach((r) => { if (!m.has(r.employee_id)) m.set(r.employee_id, r.employee_name); });
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recs]);

  const openFix = (s: Shift, mode: Fix['mode'], kind: ClockKind) => {
    const target = kind === 'in' ? s.inP : s.outP;
    const base = target?.at || (kind === 'out' && s.inP ? new Date(s.inP.at.getTime() + 8 * 3600_000) : s.outP ? new Date(s.outP.at.getTime() - 8 * 3600_000) : new Date());
    setFixErr('');
    setFix({ emp: { id: s.employeeId, name: s.employeeName }, shift: s, mode, kind, at: toLocalInput(base), reason: '' });
  };
  const saveFix = async () => {
    if (!fix) return;
    const target = fixTarget(fix);
    const reason = fix.reason.trim();
    if (reason.length < 5) return setFixErr('Escribe el motivo (mínimo 5 letras). Queda guardado en la bitácora.');
    const at = new Date(fix.at);
    if (fix.mode !== 'void' && (isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000)) return setFixErr('Revisa la fecha y hora (no puede ser en el futuro).');
    if ((fix.mode === 'fix' || fix.mode === 'void') && !target) return setFixErr('Ese día no tiene esa checada: usa «+ Entrada» / «+ Salida».');
    setSaving(true); setFixErr('');
    try {
      await addCorrection({ action: fix.mode, employee_id: fix.emp.id, employee_name: fix.emp.name, kind: fix.kind, at: fix.mode === 'void' ? undefined : at, ref: target?.id, reason, by_name: operator?.name || 'Dueño' });
      setFix(null);
      await load();
    } catch { setFixErr('No se pudo guardar. Revisa tu internet.'); }
    finally { setSaving(false); }
  };

  const notes = (p?: Punch) => [p?.added && 'agregada a mano', p?.corrected && `corregida (era ${fmtTime(p.originalAt)})`, p?.offline && 'sin conexión'].filter(Boolean).join(', ');
  const shiftNote = (s: Shift) => [!s.inP && 'Falta la entrada', !s.outP && 'Falta la salida', s.inP && notes(s.inP) && `Entrada ${notes(s.inP)}`, s.outP && notes(s.outP) && `Salida ${notes(s.outP)}`].filter(Boolean).join(' · ');

  const exportXlsx = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.shifts.map((s) => ({
      Empleado: s.employeeName, Puesto: (() => { const e = team.find((x) => x.id === s.employeeId); return e ? jobLabel(e) : ''; })(), Fecha: s.day.toLocaleDateString('es-MX'), Entrada: fmtTime(s.inP?.at), Salida: fmtTime(s.outP?.at),
      Horas: Math.round(s.minutes / 6) / 10, Notas: shiftNote(s),
    }))), 'Jornada');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.weeks.map((w) => ({
      Empleado: w.employeeName, 'Semana (lunes)': w.week.toLocaleDateString('es-MX'), Horas: Math.round(w.minutes / 6) / 10,
      'Máximo legal (h)': w.limit, 'Excede': w.minutes > w.limit * 60 ? 'SÍ' : '', 'Días incompletos': w.incomplete,
    }))), 'Totales por semana');
    // Bitácora completa: cada registro tal como quedó guardado (nada se edita ni se borra)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.all.filter((r) => !empFilter || r.employee_id === empFilter).map((r) => ({
      Folio: r.id, Empleado: r.employee_name, Movimiento: r.action === 'punch' ? 'Checada' : ACTION_LABEL[r.action],
      Tipo: r.kind === 'in' ? 'Entrada' : r.kind === 'out' ? 'Salida' : '', 'Guardado (hora del servidor)': fullDT(pbDate(r.created)),
      'Hora del equipo': fullDT(pbDate(r.device_at)), 'Sin conexión': r.offline ? 'SÍ' : '', 'Hora corregida / agregada': fullDT(pbDate(r.at)),
      'Corrige folio': r.ref || '', Motivo: r.reason || '', 'Hecho por': r.by_name || r.employee_name, Sucursal: r.branch || '',
    }))), 'Bitácora');
    XLSX.writeFile(wb, `registro-jornada-${RANGE_LABEL[range].replace(/\s+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };
  const doPrint = (what: NonNullable<typeof printWhat>) => { setPrintWhat(what); runPrint('reporte', () => setPrintWhat(null)); };

  const pending = pendingCount();
  const sel = 'rounded-xl border border-carbon-950/15 bg-white px-3 py-2 text-sm text-carbon-900 outline-none focus:border-agave-500';
  const byEmp = useMemo(() => {
    const m = new Map<string, Shift[]>();
    data.shifts.forEach((s) => { if (!m.has(s.employeeId)) m.set(s.employeeId, []); m.get(s.employeeId)!.push(s); });
    return [...m.values()];
  }, [data.shifts]);
  const biz = settings.businessName || 'El negocio';

  return (
    <div className="rounded-3xl border border-carbon-950/10 bg-white p-4 sm:p-6" data-tour="clock-report">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-bold text-carbon-950 flex items-center gap-2"><Clock size={18} className="text-agave-600" /> Checador · registro de jornada</h3>
          <p className="mt-1 text-xs text-carbon-500 max-w-2xl">Cada empleado checa con su PIN en <b>Checar entrada / salida</b>. La hora la pone el sistema y los registros no se pueden editar ni borrar: las correcciones quedan aparte con su motivo.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={exportXlsx} disabled={!recs} className="inline-flex items-center gap-1.5 rounded-full border border-carbon-950/15 px-3.5 py-2 text-xs font-semibold text-carbon-800 hover:bg-carbon-50 disabled:opacity-40"><Download size={14} /> Hoja de cálculo</button>
          <button onClick={() => doPrint('report')} disabled={!recs} className="inline-flex items-center gap-1.5 rounded-full border border-carbon-950/15 px-3.5 py-2 text-xs font-semibold text-carbon-800 hover:bg-carbon-50 disabled:opacity-40"><Printer size={14} /> Imprimir / PDF</button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap rounded-full bg-carbon-100 p-0.5 text-xs font-semibold">
          {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
            <button key={r} onClick={() => setRange(r)} className={`rounded-full px-3 py-1 ${range === r ? 'bg-white text-carbon-900 shadow-sm' : 'text-carbon-600'}`}>{RANGE_LABEL[r]}</button>
          ))}
        </div>
        <select className={sel} value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}>
          <option value="">Todo el equipo</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={() => { const e = employees.find((x) => x.id === (empFilter || team[0]?.id)) || employees[0]; if (e) { setFixErr(''); setFix({ emp: e, mode: 'add', kind: 'in', at: toLocalInput(new Date()), reason: '' }); } }} disabled={!employees.length}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-agave-700 hover:bg-agave-50 disabled:opacity-40"><Plus size={14} /> Agregar checada olvidada</button>
      </div>
      {pending > 0 && <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-maiz-50 px-3 py-1 text-xs font-semibold text-maiz-800"><WifiOff size={13} /> {pending} checada(s) de este equipo esperando internet para subirse</p>}
      {loadErr ? (
        <p className="mt-4 text-sm font-semibold text-rose-600">{loadErr} <button onClick={() => { setRecs(null); void load(); }} className="ml-2 rounded-full border border-rose-200 px-3 py-1 text-xs font-bold text-rose-700 hover:bg-rose-50">Reintentar</button></p>
      ) : !recs ? <div className="py-10 grid place-items-center"><Loader2 className="w-5 h-5 animate-spin text-carbon-400" /></div>
        : data.shifts.length === 0 ? (
          <p className="mt-5 text-sm text-carbon-500">{team.length === 0 ? 'Primero da de alta a tu equipo con su PIN (arriba). Los meseros para propinas también pueden tener un PIN solo para checar.' : 'Sin checadas en este periodo.'}</p>
        ) : (
          <div className="mt-5 space-y-5">
            {byEmp.map((list) => {
              const weeks = data.weeks.filter((w) => w.employeeId === list[0].employeeId);
              return (
                <div key={list[0].employeeId} className="rounded-2xl border border-carbon-950/10 overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-carbon-50 px-4 py-2.5">
                    <div className="font-semibold text-carbon-900">{list[0].employeeName}{(() => { const e = team.find((x) => x.id === list[0].employeeId); return e ? <span className="ml-2 text-xs font-medium text-carbon-500">{jobLabel(e)}</span> : null; })()}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {weeks.map((w) => {
                        const over = w.minutes > w.limit * 60;
                        return <span key={w.week.getTime()} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${over ? 'bg-rose-100 text-rose-700' : 'bg-white text-carbon-700 border border-carbon-950/10'}`}>
                          {over && <AlertTriangle size={11} className="inline -mt-0.5 mr-1" />}Semana del {w.week.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }).replace(/\./g, '')}: {fmtHours(w.minutes)}{over ? ` (máx. ${w.limit} h)` : ''}
                        </span>;
                      })}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead><tr className="text-left text-[10px] sm:text-[11px] uppercase tracking-wide text-carbon-500">
                        <th className="pl-3 sm:pl-4 pr-1 py-2 font-semibold">Día</th><th className="px-1 sm:px-2 py-2 font-semibold">Entrada</th><th className="px-1 sm:px-2 py-2 font-semibold">Salida</th><th className="px-1 sm:px-2 py-2 font-semibold">Horas</th><th className="pr-3 sm:pr-4 py-2" />
                      </tr></thead>
                      <tbody className="divide-y divide-carbon-950/5">
                        {list.map((s, i) => (
                          <tr key={(s.inP?.id || '') + (s.outP?.id || '') + i} className="align-top">
                            <td className="pl-3 sm:pl-4 pr-1 py-2 text-carbon-800">
                              <div className="whitespace-nowrap">{fmtDay(s.day)}</div>
                              {(() => { const n = shiftNote(s).replace(/^Falta la (entrada|salida)( · )?/, '').replace(/^Falta la (entrada|salida)$/, ''); return n ? <div className="text-[10px] sm:text-[11px] text-carbon-500 leading-snug">{n}</div> : null; })()}
                            </td>
                            <td className="px-1 sm:px-2 py-2 tabular-nums whitespace-nowrap">{s.inP ? fmtTime(s.inP.at) : <button onClick={() => openFix(s, 'add', 'in')} className="font-semibold text-rose-600 underline decoration-dotted" title="Agregar la entrada que falta">Falta +</button>}</td>
                            <td className="px-1 sm:px-2 py-2 tabular-nums whitespace-nowrap">{s.outP ? fmtTime(s.outP.at) : <button onClick={() => openFix(s, 'add', 'out')} className="font-semibold text-rose-600 underline decoration-dotted" title="Agregar la salida que falta">Falta +</button>}</td>
                            <td className="px-1 sm:px-2 py-2 tabular-nums whitespace-nowrap font-semibold text-carbon-900">{s.inP && s.outP ? fmtHours(s.minutes) : '—'}</td>
                            <td className="pr-3 sm:pr-4 py-2 text-right whitespace-nowrap">
                              {(s.inP || s.outP) && <button onClick={() => openFix(s, 'fix', s.inP ? 'in' : 'out')} title="Corregir" aria-label="Corregir" className="rounded-lg p-1.5 sm:px-2 sm:py-1 text-xs font-semibold text-carbon-700 hover:bg-carbon-100"><Pencil size={13} className="inline -mt-0.5" /><span className="hidden sm:inline"> Corregir</span></button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      {data.corrections.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-bold text-carbon-900">Bitácora de correcciones ({data.corrections.length})</h4>
          <div className="mt-2 divide-y divide-carbon-950/10 rounded-2xl border border-carbon-950/10">
            {data.corrections.slice().reverse().map((r) => {
              const orig = r.ref ? data.byId.get(r.ref) : undefined;
              const origAt = orig ? (orig.action === 'add' ? pbDate(orig.at) : orig.offline ? pbDate(orig.device_at) : pbDate(orig.created)) : null;
              return (
                <div key={r.id} className="px-4 py-2.5 text-xs text-carbon-700">
                  <b className="text-carbon-900">{r.employee_name}</b> · {ACTION_LABEL[r.action]} de {r.kind === 'in' ? 'entrada' : 'salida'}
                  {origAt && <> · antes <span className="tabular-nums">{fullDT(origAt)}</span></>}
                  {r.at && <> · ahora <span className="tabular-nums font-semibold">{fullDT(pbDate(r.at))}</span></>}
                  <div className="text-carbon-500">Motivo: “{r.reason}” — {r.by_name || 'Dueño'}, {fullDT(pbDate(r.created))}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-agave-50/60 border border-agave-100 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FileSignature size={16} className="text-agave-700" />
          <span className="text-sm font-bold text-carbon-900 flex-1 min-w-[180px]">Hoja de acuerdo con cada empleado</span>
          <select className={sel} value={agreeEmp} onChange={(e) => setAgreeEmp(e.target.value)}>
            <option value="">Elige empleado</option>
            {team.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button disabled={!agreeEmp} onClick={() => doPrint({ agreement: agreeEmp })} className="inline-flex items-center gap-1.5 rounded-full bg-agave-600 hover:bg-agave-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40"><Printer size={14} /> Imprimir</button>
        </div>
        <p className="mt-1.5 text-xs text-carbon-600">Imprímela, que la firme cada empleado y guárdala. Si el registro está acordado por escrito con el trabajador, vale como prueba de su jornada.</p>
      </div>

      {fix && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-sm no-print">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-carbon-950">{fix.mode === 'add' ? 'Agregar checada' : 'Corregir checada'}</h3>
              <button onClick={() => setFix(null)} className="rounded-lg p-1.5 text-carbon-500 hover:bg-carbon-100"><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              {fix.mode === 'add' && !fix.shift ? (
                <select className={sel + ' w-full'} value={fix.emp.id} onChange={(e) => { const x = employees.find((y) => y.id === e.target.value); if (x) setFix({ ...fix, emp: x }); }}>
                  {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              ) : <div className="font-semibold text-carbon-900">{fix.emp.name}</div>}
              {fix.mode !== 'add' && (
                <div className="text-[11px] font-bold uppercase tracking-wide text-carbon-500 -mb-2">¿Qué quieres hacer?</div>
              )}
              {fix.mode !== 'add' && (
                <div className="flex rounded-full bg-carbon-100 p-0.5 text-xs font-semibold w-fit">
                  {(['fix', 'void'] as const).map((m) => <button key={m} onClick={() => setFix({ ...fix, mode: m })} className={`rounded-full px-3 py-1 ${fix.mode === m ? 'bg-white shadow-sm text-carbon-900' : 'text-carbon-600'}`}>{m === 'fix' ? 'Cambiar hora' : 'Anular (fue un error)'}</button>)}
                </div>
              )}
              <div className="text-[11px] font-bold uppercase tracking-wide text-carbon-500 -mb-2">Checada</div>
              <div className="flex rounded-full bg-carbon-100 p-0.5 text-xs font-semibold w-fit">
                {(['in', 'out'] as const).map((k) => <button key={k} onClick={() => {
                // Al corregir, cambiar entre entrada/salida cambia qué checada del día se corrige (y su hora)
                const t = fix.mode === 'add' ? undefined : k === 'in' ? fix.shift?.inP : fix.shift?.outP;
                setFix({ ...fix, kind: k, at: t ? toLocalInput(t.at) : fix.at });
              }} className={`rounded-full px-3 py-1 ${fix.kind === k ? 'bg-white shadow-sm text-carbon-900' : 'text-carbon-600'}`}>{k === 'in' ? 'Entrada' : 'Salida'}</button>)}
              </div>
              {fixTarget(fix) && <p className="text-xs text-carbon-500">Registrada: <b className="tabular-nums">{fullDT(fixTarget(fix)!.at)}</b>. El registro original se conserva; la corrección queda en la bitácora.</p>}
              {fix.mode !== 'void' && <input type="datetime-local" className={sel + ' w-full'} value={fix.at} max={toLocalInput(new Date())} onChange={(e) => setFix({ ...fix, at: e.target.value })} />}
              <div className="text-[11px] font-bold uppercase tracking-wide text-carbon-500 -mb-2">Motivo (obligatorio)</div>
              <textarea className={sel + ' w-full resize-none'} rows={2} placeholder="Motivo (ej. se le olvidó checar la salida; confirmado con el encargado)" value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} />
              {fixErr && <p className="font-semibold text-rose-600">{fixErr}</p>}
            </div>
            <button onClick={saveFix} disabled={saving} className="mt-4 w-full rounded-2xl bg-agave-600 hover:bg-agave-700 py-3 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Guardando…' : 'GUARDAR'}</button>
          </div>
        </div>
      )}

      {printWhat && (
        <PrintArea kind="reporte">
          {printWhat === 'report' ? (
            <div style={{ fontSize: 11 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700 }}>Registro electrónico de jornada — {biz}</h2>
              <p>{currentBranch().name} · {RANGE_LABEL[range]}: {from.toLocaleDateString('es-MX')} al {to.toLocaleDateString('es-MX')} · Generado {fullDT(new Date())} con Don Punto</p>
              {byEmp.map((list) => (
                <div key={list[0].employeeId} style={{ marginTop: 12, breakInside: 'avoid' }}>
                  <h3 style={{ fontSize: 13, fontWeight: 700 }}>{list[0].employeeName}{(() => { const e = team.find((x) => x.id === list[0].employeeId); return e ? ` · ${jobLabel(e)}` : ''; })()}</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Fecha', 'Entrada', 'Salida', 'Horas', 'Notas'].map((h) => <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '2px 4px' }}>{h}</th>)}</tr></thead>
                    <tbody>{list.map((s, i) => (
                      <tr key={i}><td style={{ padding: '2px 4px' }}>{s.day.toLocaleDateString('es-MX')}</td><td style={{ padding: '2px 4px' }}>{fmtTime(s.inP?.at)}</td><td style={{ padding: '2px 4px' }}>{fmtTime(s.outP?.at)}</td><td style={{ padding: '2px 4px' }}>{s.inP && s.outP ? fmtHours(s.minutes) : '—'}</td><td style={{ padding: '2px 4px' }}>{shiftNote(s)}</td></tr>
                    ))}</tbody>
                  </table>
                  <p style={{ marginTop: 4 }}>{data.weeks.filter((w) => w.employeeId === list[0].employeeId).map((w) => `Semana del ${w.week.toLocaleDateString('es-MX')}: ${fmtHours(w.minutes)}${w.minutes > w.limit * 60 ? ` (excede ${w.limit} h)` : ''}`).join(' · ')}</p>
                </div>
              ))}
              {data.corrections.length > 0 && <>
                <h3 style={{ fontSize: 13, fontWeight: 700, marginTop: 14 }}>Bitácora de correcciones</h3>
                {data.corrections.map((r) => <p key={r.id}>{fullDT(pbDate(r.created))} · {r.employee_name} · {ACTION_LABEL[r.action]} de {r.kind === 'in' ? 'entrada' : 'salida'}{r.at ? ` → ${fullDT(pbDate(r.at))}` : ''} · Motivo: {r.reason} · {r.by_name}</p>)}
              </>}
            </div>
          ) : (() => {
            const e = team.find((x) => x.id === printWhat.agreement);
            return (
              <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center' }}>Acuerdo para el registro electrónico de la jornada de trabajo</h2>
                <p style={{ textAlign: 'center' }}>(Artículo 132, fracción XXXIV, de la Ley Federal del Trabajo)</p>
                <p style={{ marginTop: 14 }}>En ____________________, a ____ de ______________ de ______, <b>{biz}</b>{settings.businessAddress ? `, con domicilio en ${settings.businessAddress}` : ''} (en adelante, “el patrón”), y <b>{e?.name || '____________________'}</b> (en adelante, “la persona trabajadora”), acuerdan lo siguiente:</p>
                <ol style={{ marginTop: 8, paddingLeft: 18, listStyle: 'decimal' }}>
                  <li>La hora de inicio y de término de cada jornada de trabajo se registrará de forma electrónica en el sistema Don Punto, en la opción “Checar entrada / salida” de los equipos del centro de trabajo.</li>
                  <li>La persona trabajadora registrará personalmente su entrada y su salida con un PIN personal, que no debe compartir con nadie. Cada registro guarda la fecha y la hora del sistema, no la del equipo.</li>
                  <li>Los registros no se pueden modificar ni borrar. Si hay un error u olvido, el patrón registrará la corrección con el motivo, y el registro original se conservará junto con la corrección.</li>
                  <li>La persona trabajadora podrá pedir en cualquier momento una copia de sus registros, y avisar al patrón de cualquier error para que se corrija.</li>
                  <li>Ambas partes reconocen este procedimiento como el registro electrónico de la jornada para efectos de la Ley Federal del Trabajo.</li>
                </ol>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 70, textAlign: 'center' }}>
                  <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 4 }}>El patrón<br />{biz}</div>
                  <div style={{ borderTop: '1px solid #000', width: 220, paddingTop: 4 }}>La persona trabajadora<br />{e?.name || ''}</div>
                </div>
                <p style={{ marginTop: 40, fontSize: 9, color: '#555' }}>Formato de referencia. Revísalo con tu contador o abogado laboral, sobre todo cuando la Secretaría del Trabajo publique sus reglas.</p>
              </div>
            );
          })()}
        </PrintArea>
      )}
    </div>
  );
}
