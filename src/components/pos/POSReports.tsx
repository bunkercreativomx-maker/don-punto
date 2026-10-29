import { useState, useMemo } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { Calendar, Trash2, TrendingUp, Wallet, Percent, FileText, Store, Bike, Printer, Scissors } from 'lucide-react';
import { CorteTicket } from './CorteTicket';
import { AdvancedReports } from './AdvancedReports';

import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import { money } from '../../lib/format';
import { PrintArea } from '../print/PrintArea';
import { runPrint } from '../../lib/print';
import { CorteCaja } from './CorteCaja';
import { buildCorte, dayRange, type CorteData } from '../../lib/corte';
import { useCashShift, getEvents, getCancellations } from '../../lib/cashShift';
import { useCalculator } from '../../hooks/useCalculator';
import { currentBranch } from '../../lib/session';
import { X } from 'lucide-react';

const localDay = (d: Date = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function POSReports({ onUpgrade }: { onUpgrade?: () => void } = {}) {
  const { transactions, summaries, removeTransaction, settings, updateSettings, calculateSummaryInfo } = usePOS();
  const [selectedDate, setSelectedDate] = useState(localDay());
  const { rows, categories } = useCalculator();
  const { shifts } = useCashShift();

  // Día local (no UTC): una venta a las 7 pm en Juárez es del mismo día
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => localDay(new Date(tx.date)) === selectedDate);
  }, [transactions, selectedDate]);

  // Corte de caja detallado
  const [corteMode, setCorteMode] = useState<'turno' | 'fechas'>(shifts.length ? 'turno' : 'fechas');
  const [shiftId, setShiftId] = useState<string>(shifts[0]?.id || '');
  const [fromDay, setFromDay] = useState(localDay());
  const [toDay, setToDay] = useState(localDay());
  const [preview, setPreview] = useState<CorteData | null>(null);
  const [printData, setPrintData] = useState<CorteData | null>(null);
  const makeCorte = (): CorteData | null => {
    const base = { allTxs: transactions, shifts, cancellations: getCancellations(), events: getEvents(), rows, categories, ivaPct: settings.ivaPercentage, businessName: settings.businessName };
    if (corteMode === 'turno') {
      const sh = shifts.find((x) => x.id === shiftId) || shifts[0];
      if (!sh) return null;
      return buildCorte({ ...base, shift: sh, from: new Date(sh.openedAt), to: sh.closedAt ? new Date(sh.closedAt) : new Date() });
    }
    const a = fromDay <= toDay ? fromDay : toDay, b = fromDay <= toDay ? toDay : fromDay;
    const { from, to } = dayRange(a, b);
    return buildCorte({ ...base, from, to });
  };
  const printCorteCarta = (d: CorteData | null) => {
    if (!d) return;
    setPrintData(d);
    runPrint('reporte', () => setPrintData(null));
  };

  const dailyIVA = useMemo(() => {
    return calculateSummaryInfo(filteredTransactions);
  }, [filteredTransactions, settings.ivaPercentage, calculateSummaryInfo]);

  const [isPrintingCorte, setIsPrintingCorte] = useState(false);

  const handlePrintCorte = () => {
    setIsPrintingCorte(true);
    runPrint('corte', () => setIsPrintingCorte(false));
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      
      {/* --- PERIOD SUMMARIES (The cards user missed) --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Ventas Hoy', data: summaries.daily, color: 'text-indigo-400', icon: TrendingUp },
          { label: 'Esta Semana', data: summaries.weekly, color: 'text-emerald-400', icon: Calendar },
          { label: 'Este Mes', data: summaries.monthly, color: 'text-amber-400', icon: Wallet },
          { label: 'Este Año', data: summaries.yearly, color: 'text-rose-400', icon: Percent },
        ].map((card, i) => (
          <div key={i} className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-3xl p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] relative group overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <card.icon size={80} />
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">{card.label}</p>
            <div className="space-y-1">
                <div className="text-3xl font-black text-carbon-950 tracking-tighter">${money(card.data.total)}</div>
                <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">IVA TOTAL</span>
                    <span className={card.color}>+${money(card.data.totalIVA)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">IVA EFECTIVO</span>
                    <span className="text-slate-300">${money(card.data.cashIVA)}</span>
                </div>
                <div className="h-px bg-carbon-950/5 my-2" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(card.data.byDestination).map(([dest, amt]) => (
                        <div key={dest} className="flex justify-between text-[9px] font-bold">
                            <span className="text-slate-600 uppercase">{dest}</span>
                            <span className="text-slate-400">${money(amt)}</span>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        ))}
      </div>

      <AdvancedReports transactions={transactions} onUpgrade={onUpgrade} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* --- CALENDAR / DATE PICKER --- */}
        <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-carbon-950 mb-1 flex items-center gap-2">
                    <Scissors size={20} className="text-indigo-400"/> Corte de caja
                </h3>
                <p className="text-xs text-slate-500 mb-4">Reporte completo en hoja carta para tu contador: caja, declaración, IVA, categorías, meseros y formas de pago.</p>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-carbon-950/10 mb-4">
                    {(['turno', 'fechas'] as const).map((m) => (
                        <button key={m} onClick={() => setCorteMode(m)} className={cn("py-2 rounded-lg text-[11px] font-black", corteMode === m ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-carbon-950")}>{m === 'turno' ? 'POR TURNO' : 'POR FECHAS'}</button>
                    ))}
                </div>
                {corteMode === 'turno' ? (
                    shifts.length ? (
                        <select value={shiftId || shifts[0].id} onChange={(e) => setShiftId(e.target.value)} className="w-full bg-slate-950 border border-carbon-950/10 rounded-2xl p-3 text-carbon-950 font-bold text-sm outline-none">
                            {shifts.slice(0, 120).map((sh) => (
                                <option key={sh.id} value={sh.id}>
                                    Turno {sh.number} · {new Date(sh.openedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })} {new Date(sh.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{sh.closedAt ? '' : ' · ABIERTO'}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <div className="text-xs text-slate-500 bg-slate-950/50 border border-carbon-950/10 rounded-2xl p-3">Aún no hay turnos. Ábrelos desde el Punto de Venta con <b>Abrir turno</b>, o usa el corte por fechas.</div>
                    )
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Del
                            <input type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} className="mt-1 w-full bg-slate-950 border border-carbon-950/10 rounded-xl p-2.5 text-carbon-950 font-bold text-xs outline-none" />
                        </label>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Al
                            <input type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} className="mt-1 w-full bg-slate-950 border border-carbon-950/10 rounded-xl p-2.5 text-carbon-950 font-bold text-xs outline-none" />
                        </label>
                    </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-4">
                    <button onClick={() => setPreview(makeCorte())} disabled={corteMode === 'turno' && !shifts.length} className="py-3 rounded-2xl border border-carbon-950/10 bg-white text-carbon-800 text-xs font-black hover:bg-carbon-50 disabled:opacity-50 flex items-center justify-center gap-2"><FileText size={15} /> VER CORTE</button>
                    <button onClick={() => printCorteCarta(makeCorte())} disabled={corteMode === 'turno' && !shifts.length} className="py-3 rounded-2xl bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-black disabled:opacity-50 flex items-center justify-center gap-2"><Printer size={15} /> IMPRIMIR / PDF</button>
                </div>
                <p className="text-[10px] text-slate-500 mt-2">Para PDF: en la ventana de impresión elige “Guardar como PDF”.</p>
            </div>

            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-carbon-950 mb-6 flex items-center gap-2">
                    <Calendar size={20} className="text-indigo-400"/> Historial por Fecha
                </h3>
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-slate-950 border border-carbon-950/10 rounded-2xl p-4 text-carbon-950 font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                
                <div className="mt-8 space-y-4 p-4 bg-slate-950/50 rounded-2xl border border-carbon-950/10">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold">VENTA DEL DÍA</span>
                        <span className="text-lg font-black text-carbon-950">${money(dailyIVA.total)}</span>
                    </div>
                    <div className="h-px bg-carbon-950/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase">IVA Recaudado</span>
                        <span className="text-emerald-500 font-bold text-sm">${money(dailyIVA.totalIVA)}</span>
                    </div>

                    <button 
                        onClick={handlePrintCorte}
                        disabled={filteredTransactions.length === 0}
                        className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none text-white font-black py-4 rounded-2xl shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
                    >
                        <Scissors size={18} />
                        TICKET DE CORTE (TÉRMICA)
                    </button>
                </div>

                <div className="mt-6">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Configuración de IVA</label>
                    <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-carbon-950/10">
                        <Percent size={16} className="text-indigo-400" />
                        <input 
                            type="number"
                            value={settings.ivaPercentage}
                            onChange={(e) => updateSettings({ ivaPercentage: Number(e.target.value) })}
                            className="bg-transparent text-carbon-950 font-black text-sm w-full outline-none"
                        />
                        <span className="text-slate-600 font-bold text-xs">%</span>
                    </div>
                </div>
            </div>
        </div>

        {/* --- TRANSACTIONS LIST --- */}
        <div className="lg:col-span-8 flex flex-col">
            <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-3xl p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex-grow overflow-hidden flex flex-col min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-carbon-950">Transacciones del {selectedDate}</h3>
                    <div className="text-[10px] font-black text-slate-500 bg-slate-950 border border-carbon-950/10 px-3 py-1.5 rounded-full uppercase tracking-widest">
                        {filteredTransactions.length} REGISTROS
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto no-scrollbar space-y-3">
                    {filteredTransactions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-600 py-20">
                            <FileText size={48} className="opacity-10 mb-4" />
                            <p className="text-sm font-medium">No hay ventas registradas en esta fecha</p>
                        </div>
                    ) : (
                        filteredTransactions.map(tx => (
                            <div key={tx.id} className="bg-slate-950/50 border border-carbon-950/10 p-4 rounded-2xl flex items-center justify-between group hover:border-carbon-950/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px]",
                                        tx.destination === 'Tienda' ? "bg-indigo-500/10 text-indigo-400" : "bg-amber-500/10 text-amber-500"
                                    )}>
                                        {tx.destination === 'Tienda' ? <Store size={16}/> : <Bike size={16}/>}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-carbon-950 leading-tight">{tx.customerName || (tx.destination === 'Tienda' ? 'Venta en mostrador' : `Pedido ${tx.destination === 'Didi' ? 'DiDi' : tx.destination}`)}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5 italic line-clamp-1">{tx.notes}</div>
                                        <div className="flex items-center gap-2 text-[10px] font-medium mt-1">
                                            <span className="text-slate-500">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span className="text-carbon-950/20">•</span>
                                            <span className={cn(
                                                "font-black tracking-widest",
                                                tx.paymentMethod === 'Efectivo' ? "text-emerald-500" :
                                                tx.paymentMethod === 'Tarjeta' ? "text-violet-500" :
                                                tx.paymentMethod === 'Uber' ? "text-green-500" :
                                                tx.paymentMethod === 'Didi' ? "text-orange-500" : 
                                                tx.paymentMethod === 'Didi Efectivo' ? "text-orange-400 font-black border-b border-orange-500/30" : "text-pink-500"
                                            )}>{tx.paymentMethod.toUpperCase()}</span>
                                            {tx.destination && tx.destination.toUpperCase() !== tx.paymentMethod.toUpperCase() && (
                                                <>
                                                    <span className="text-carbon-950/20">•</span>
                                                    <span className="text-indigo-400 font-black uppercase">{tx.destination}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-sm font-black text-carbon-950">${money(tx.amount)}</div>
                                        <div className="text-[9px] text-slate-600 font-bold uppercase tracking-tight">Neto</div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            // Handle manual print from history
                                            // Note: Here we'd ideally have the full item list, 
                                            // but for now we reconstruct a summary ticket
                                            window.print();
                                        }}
                                        className="p-2 text-slate-600 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Imprimir Ticket"
                                    >
                                        <Printer size={16} />
                                    </button>
                                    <button 
                                        onClick={() => removeTransaction(tx.id)}
                                        className="p-2 text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
      </div>
      
      {preview && (
          <div className="fixed inset-0 z-[80] bg-carbon-950/40 backdrop-blur-sm flex flex-col no-print" onClick={() => setPreview(null)}>
              <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 border-b border-carbon-950/10" onClick={(e) => e.stopPropagation()}>
                  <div className="text-sm font-bold text-carbon-900">Corte de caja · vista previa</div>
                  <div className="flex gap-2">
                      <button onClick={() => { const d = preview; setPreview(null); printCorteCarta(d); }} className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-4 py-2 text-xs font-black text-white"><Printer size={14} /> IMPRIMIR / PDF</button>
                      <button onClick={() => setPreview(null)} className="rounded-xl border border-carbon-950/10 px-3 py-2 text-carbon-600"><X size={16} /></button>
                  </div>
              </div>
              <div className="flex-1 overflow-auto p-4 sm:p-8" onClick={(e) => e.stopPropagation()}>
                  <div className="mx-auto w-fit shadow-[0_20px_60px_-20px_rgba(13,16,14,0.5)]">
                      <CorteCaja d={preview} branchName={currentBranch().name} />
                  </div>
              </div>
          </div>
      )}
      {printData && (
          <PrintArea kind="reporte">
              <CorteCaja d={printData} branchName={currentBranch().name} />
          </PrintArea>
      )}

      {/* --- HIDDEN CORTE TICKET FOR PRINTING --- */}
      {isPrintingCorte && (
          <PrintArea kind="corte" paper={settings.paperSize}>
              <CorteTicket summary={dailyIVA} date={selectedDate} paperSize={settings.paperSize} />
          </PrintArea>
      )}
    </div>
  );
}
