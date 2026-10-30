import { useEffect, useState, type ReactNode } from 'react';
import { Wallet, ArrowDownCircle, ArrowUpCircle, Lock, FileText, X, Trash2 } from 'lucide-react';
import type { POSTransaction, POSSettings, CashShift, CashDeclaration } from '../../types/pos';
import type { ProductRowData, Category } from '../../types/calculator';
import { useCashShift, openShift as doOpen, addMovement, removeMovement, closeShift, getShifts, getEvents, getCancellations, onOpenShiftRequest } from '../../lib/cashShift';
import { buildCorte, type CorteData } from '../../lib/corte';
import { currentBranch } from '../../lib/session';
import { money } from '../../lib/format';
import { CorteCaja } from './CorteCaja';
import { CorteZTicket } from './CorteZTicket';
import { PrintArea } from '../print/PrintArea';
import { runPrint } from '../../lib/print';

interface Props { transactions: POSTransaction[]; settings: POSSettings; rows: ProductRowData[]; categories: Category[] }

export function corteForShift(shift: CashShift, p: Props): CorteData {
  return buildCorte({
    allTxs: p.transactions, shifts: getShifts(), shift,
    from: new Date(shift.openedAt), to: shift.closedAt ? new Date(shift.closedAt) : new Date(),
    cancellations: getCancellations(), events: getEvents(), rows: p.rows, categories: p.categories,
    ivaPct: p.settings.ivaPercentage, businessName: p.settings.businessName,
  });
}

const inputCls = 'w-full bg-white border-2 border-carbon-950/10 rounded-2xl px-4 py-3 text-xl font-black text-carbon-950 outline-none focus:border-indigo-500 tabular-nums';
const btnPrimary = 'flex-[2] bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black py-4 rounded-2xl transition-all active:scale-95';
const btnGhost = 'flex-grow py-4 rounded-2xl font-bold text-slate-500 hover:text-carbon-950';

function Modal({ title, kicker, onClose, children }: { title: string; kicker: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[66] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print">
      <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-md shadow-[0_12px_32px_-18px_rgba(13,16,14,0.3)] overflow-hidden">
        <div className="p-6 bg-slate-800/30 border-b border-carbon-950/10 flex items-start justify-between">
          <div>
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">{kicker}</h4>
            <h3 className="text-xl font-bold text-carbon-950">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-carbon-950"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Barra de turno de caja en el Punto de Venta: abrir con fondo, retiros/depósitos y cierre con declaración */
export function CashShiftBar(props: Props) {
  const { openShift } = useCashShift();
  const [modal, setModal] = useState<null | 'open' | 'move' | 'close' | 'result'>(null);
  const [amount, setAmount] = useState('');
  const [moveType, setMoveType] = useState<'retiro' | 'deposito'>('retiro');
  const [reason, setReason] = useState('');
  const [decl, setDecl] = useState({ efectivo: '', tarjeta: '', transferencia: '' });
  const [closed, setClosed] = useState<CashShift | null>(null);
  const [printData, setPrintData] = useState<CorteData | null>(null);
  const [thermalData, setThermalData] = useState<CorteData | null>(null);

  useEffect(() => onOpenShiftRequest(() => { setAmount(''); setModal('open'); }), []);

  const printCorte = (shift: CashShift) => {
    setPrintData(corteForShift(shift, props));
    runPrint('reporte', () => setPrintData(null));
  };
  /** Corte Z (o X si el turno sigue abierto) en la impresora de tickets */
  const printThermal = (shift: CashShift) => {
    setThermalData(corteForShift(shift, props));
    runPrint('corte', () => setThermalData(null));
  };

  const shiftSales = openShift ? props.transactions.filter((t) => t.shiftId === openShift.id) : [];
  const salesTotal = shiftSales.reduce((a, t) => a + t.amount, 0);

  const resultData = closed ? corteForShift(closed, props) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-carbon-950/10 bg-white px-4 py-2.5 no-print">
        <Wallet size={16} className={openShift ? 'text-agave-600' : 'text-slate-500'} />
        {openShift ? (
          <>
            <div className="text-xs text-carbon-700 mr-auto">
              <b className="text-carbon-950">Turno {openShift.number} abierto</b> desde {new Date(openShift.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {openShift.openedByName ? ` · ${openShift.openedByName}` : ''} · Fondo ${money(openShift.openingFloat)} · {shiftSales.length} cuentas · ${money(salesTotal)}
            </div>
            <button onClick={() => { setAmount(''); setReason(''); setMoveType('retiro'); setModal('move'); }} className="inline-flex items-center gap-1.5 rounded-xl border border-carbon-950/10 px-3 py-1.5 text-[11px] font-bold text-carbon-700 hover:bg-carbon-50"><ArrowUpCircle size={14} /> Retiro / depósito</button>
            <button onClick={() => printThermal(openShift)} className="inline-flex items-center gap-1.5 rounded-xl border border-carbon-950/10 px-3 py-1.5 text-[11px] font-bold text-carbon-700 hover:bg-carbon-50" title="Corte parcial sin cerrar la caja"><FileText size={14} /> Corte X</button>
            <button onClick={() => { setDecl({ efectivo: '', tarjeta: '', transferencia: '' }); setModal('close'); }} className="inline-flex items-center gap-1.5 rounded-xl bg-carbon-900 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-carbon-800"><Lock size={14} /> Cerrar turno</button>
          </>
        ) : (
          <>
            <div className="text-xs text-carbon-600 mr-auto"><b className="text-carbon-900">Caja sin turno.</b> Abre el turno para empezar a vender; así todas las ventas entran a tu corte.</div>
            <button onClick={() => { setAmount(''); setModal('open'); }} className="inline-flex items-center gap-1.5 rounded-xl bg-agave-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-agave-700"><Wallet size={14} /> Abrir turno</button>
          </>
        )}
      </div>

      {modal === 'open' && (
        <Modal kicker="Apertura de caja" title="Abrir turno" onClose={() => setModal(null)}>
          <div className="p-6 space-y-3">
            <p className="text-xs font-semibold text-carbon-700">Para vender necesitas un turno abierto: así cada venta (tienda y apps) entra a tu corte.</p>
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Fondo inicial en efectivo</label>
            <input autoFocus type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} />
            <p className="text-xs text-carbon-500">Lo que hay en el cajón al empezar (para dar cambio).</p>
          </div>
          <div className="p-6 pt-0 flex gap-4">
            <button onClick={() => setModal(null)} className={btnGhost}>CANCELAR</button>
            <button onClick={() => { doOpen(Number(amount) || 0); setModal(null); }} className={btnPrimary}>ABRIR TURNO</button>
          </div>
        </Modal>
      )}

      {modal === 'move' && openShift && (
        <Modal kicker={`Turno ${openShift.number}`} title="Retiro o depósito de efectivo" onClose={() => setModal(null)}>
          <div className="p-6 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['retiro', 'deposito'] as const).map((t) => (
                <button key={t} onClick={() => setMoveType(t)} className={`py-3 rounded-xl text-xs font-black border inline-flex items-center justify-center gap-1.5 ${moveType === t ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-white border-carbon-950/10 text-carbon-700'}`}>
                  {t === 'retiro' ? <ArrowUpCircle size={14} /> : <ArrowDownCircle size={14} />} {t === 'retiro' ? 'RETIRO' : 'DEPÓSITO'}
                </button>
              ))}
            </div>
            <input autoFocus type="number" min="0" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className={inputCls} />
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={moveType === 'retiro' ? 'Motivo (ej. pago de gas, compra de tortillas)' : 'Motivo (ej. más cambio)'} className="w-full bg-white border border-carbon-950/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-indigo-500" />
            {(openShift.movements || []).length > 0 && (
              <div className="rounded-xl border border-carbon-950/10 divide-y divide-carbon-950/5">
                {openShift.movements.map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-carbon-700">{new Date(m.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · <b>{m.type === 'retiro' ? 'Retiro' : 'Depósito'}</b>{m.reason ? ` · ${m.reason}` : ''}</span>
                    <span className="flex items-center gap-2 font-bold tabular-nums">${money(m.amount)}
                      <button onClick={() => removeMovement(m.id)} className="text-rose-400 hover:text-rose-600" title="Quitar"><Trash2 size={13} /></button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-6 pt-0 flex gap-4">
            <button onClick={() => setModal(null)} className={btnGhost}>CERRAR</button>
            <button disabled={!(Number(amount) > 0)} onClick={() => { addMovement(moveType, Number(amount), reason); setAmount(''); setReason(''); }} className={btnPrimary}>REGISTRAR</button>
          </div>
        </Modal>
      )}

      {modal === 'close' && openShift && (
        <Modal kicker={`Turno ${openShift.number}`} title="Declaración del cajero" onClose={() => setModal(null)}>
          <div className="p-6 space-y-3">
            <p className="text-xs text-carbon-600">Cuenta lo que hay y escríbelo. El sistema te dice después si sobra o falta.</p>
            {([
              ['efectivo', 'Efectivo en caja (contado, con fondo)'],
              ['tarjeta', 'Tarjeta (total de vouchers / terminal)'],
              ['transferencia', 'Transferencias recibidas'],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">{label}</label>
                <input type="number" min="0" inputMode="decimal" value={decl[k]} onChange={(e) => setDecl({ ...decl, [k]: e.target.value })} placeholder="0.00" className={inputCls} />
              </div>
            ))}
          </div>
          <div className="p-6 pt-0 flex gap-4">
            <button onClick={() => setModal(null)} className={btnGhost}>CANCELAR</button>
            <button disabled={decl.efectivo === ''} onClick={() => {
              const d: CashDeclaration = { efectivo: Number(decl.efectivo) || 0, tarjeta: Number(decl.tarjeta) || 0, transferencia: Number(decl.transferencia) || 0, otros: 0 };
              const s = closeShift(d);
              if (s) { setClosed(s); setModal('result'); } else setModal(null);
            }} className={btnPrimary}>CERRAR TURNO</button>
          </div>
        </Modal>
      )}

      {modal === 'result' && closed && resultData && (
        <Modal kicker={`Turno ${closed.number} cerrado`} title="Resultado del corte" onClose={() => { setModal(null); setClosed(null); }}>
          <div className="p-6 space-y-2 text-sm">
            <div className="flex justify-between"><span>Venta total</span><b className="tabular-nums">${money(resultData.total)}</b></div>
            <div className="rounded-xl border border-carbon-950/10 divide-y divide-carbon-950/5 my-2">
              {resultData.pagosVentas.map((l) => (
                <div key={l.label} className={`flex justify-between px-3 py-1.5 text-xs ${l.amount ? 'text-carbon-900' : 'text-carbon-400'}`}>
                  <span>{l.label} <span className="text-carbon-400">· {l.count || 0}</span></span><b className="tabular-nums">${money(l.amount)}</b>
                </div>
              ))}
            </div>
            <div className="flex justify-between"><span>Esperado en caja</span><b className="tabular-nums">${money(resultData.saldoFinal)}</b></div>
            <div className="flex justify-between"><span>Declarado</span><b className="tabular-nums">${money(resultData.declaradoTotal)}</b></div>
            <div className={`mt-3 rounded-2xl p-4 flex justify-between items-center ${Math.abs(resultData.diferencia) < 0.5 ? 'bg-emerald-500/10 text-emerald-700' : resultData.diferencia > 0 ? 'bg-maiz-50 text-maiz-800' : 'bg-rose-50 text-rose-700'}`}>
              <span className="text-xs font-black uppercase">{Math.abs(resultData.diferencia) < 0.005 ? 'Cuadra exacto' : resultData.diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
              <span className="text-2xl font-black tabular-nums">${money(Math.abs(resultData.diferencia))}</span>
            </div>
          </div>
          <div className="p-6 pt-0 space-y-3">
            <button onClick={() => printThermal(closed)} className={btnPrimary + ' w-full'}>IMPRIMIR CORTE Z</button>
            <div className="flex gap-3">
              <button onClick={() => printCorte(closed)} className="flex-1 py-3 rounded-2xl border border-carbon-950/10 bg-white text-carbon-800 text-xs font-black hover:bg-carbon-50">HOJA CARTA / PDF</button>
              <button onClick={() => { setModal(null); setClosed(null); }} className="flex-1 py-3 rounded-2xl font-bold text-slate-500 hover:text-carbon-950 text-xs">LISTO</button>
            </div>
          </div>
        </Modal>
      )}

      {thermalData && (
        <PrintArea kind="corte" paper={props.settings.paperSize}>
          <CorteZTicket d={thermalData} />
        </PrintArea>
      )}
      {printData && (
        <PrintArea kind="reporte">
          <CorteCaja d={printData} branchName={currentBranch().name} />
        </PrintArea>
      )}
    </>
  );
}
