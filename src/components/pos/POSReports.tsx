import { useState, useMemo } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { Calendar, Trash2, TrendingUp, Wallet, Percent, FileText, Store, Bike, Printer, Scissors } from 'lucide-react';
import { CorteTicket } from './CorteTicket';

import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function POSReports() {
  const { transactions, summaries, removeTransaction, settings, updateSettings, calculateSummaryInfo } = usePOS();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => tx.date.startsWith(selectedDate));
  }, [transactions, selectedDate]);

  const dailyIVA = useMemo(() => {
    return calculateSummaryInfo(filteredTransactions);
  }, [filteredTransactions, settings.ivaPercentage, calculateSummaryInfo]);

  const [isPrintingCorte, setIsPrintingCorte] = useState(false);

  const handlePrintCorte = () => {
    setIsPrintingCorte(true);
    document.body.classList.add('printing-corte');
    setTimeout(() => {
        window.print();
        document.body.classList.remove('printing-corte');
        setIsPrintingCorte(false);
    }, 500); // 500ms to be safe for React render
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
          <div key={i} className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl relative group overflow-hidden">
            <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
               <card.icon size={80} />
            </div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">{card.label}</p>
            <div className="space-y-1">
                <div className="text-3xl font-black text-white tracking-tighter">${card.data.total.toFixed(2)}</div>
                <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">IVA TOTAL</span>
                    <span className={card.color}>+${card.data.totalIVA.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold">
                    <span className="text-slate-500">IVA EFECTIVO</span>
                    <span className="text-slate-300">${card.data.cashIVA.toFixed(2)}</span>
                </div>
                <div className="h-px bg-white/5 my-2" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(card.data.byDestination).map(([dest, amt]) => (
                        <div key={dest} className="flex justify-between text-[9px] font-bold">
                            <span className="text-slate-600 uppercase">{dest}</span>
                            <span className="text-slate-400">${amt.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* --- CALENDAR / DATE PICKER --- */}
        <div className="lg:col-span-4 space-y-6">
            <div className="bg-slate-900 border border-white/5 rounded-3xl p-6">
                <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                    <Calendar size={20} className="text-indigo-400"/> Historial por Fecha
                </h3>
                <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-2xl p-4 text-white font-bold text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                
                <div className="mt-8 space-y-4 p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold">VENTA DEL DÍA</span>
                        <span className="text-lg font-black text-white">${dailyIVA.total.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-white/5" />
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-slate-500 font-bold uppercase">IVA Recaudado</span>
                        <span className="text-emerald-500 font-bold text-sm">${dailyIVA.totalIVA.toFixed(2)}</span>
                    </div>

                    <button 
                        onClick={handlePrintCorte}
                        disabled={filteredTransactions.length === 0}
                        className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:bg-slate-800 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center gap-3 mt-4"
                    >
                        <Scissors size={18} />
                        IMPRIMIR CORTE Z
                    </button>
                </div>

                <div className="mt-6">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-3">Configuración de IVA</label>
                    <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-2xl border border-white/5">
                        <Percent size={16} className="text-indigo-400" />
                        <input 
                            type="number"
                            value={settings.ivaPercentage}
                            onChange={(e) => updateSettings({ ivaPercentage: Number(e.target.value) })}
                            className="bg-transparent text-white font-black text-sm w-full outline-none"
                        />
                        <span className="text-slate-600 font-bold text-xs">%</span>
                    </div>
                </div>
            </div>
        </div>

        {/* --- TRANSACTIONS LIST --- */}
        <div className="lg:col-span-8 flex flex-col">
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-6 shadow-2xl flex-grow overflow-hidden flex flex-col min-h-[500px]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-bold text-white">Transacciones del {selectedDate}</h3>
                    <div className="text-[10px] font-black text-slate-500 bg-slate-950 border border-white/5 px-3 py-1.5 rounded-full uppercase tracking-widest">
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
                            <div key={tx.id} className="bg-slate-950/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                                <div className="flex items-center gap-4">
                                    <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-black text-[10px]",
                                        tx.destination === 'Tienda' ? "bg-indigo-500/10 text-indigo-400" : "bg-amber-500/10 text-amber-500"
                                    )}>
                                        {tx.destination === 'Tienda' ? <Store size={16}/> : <Bike size={16}/>}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white leading-tight">{tx.customerName || 'Venta Mostrador'}</div>
                                        <div className="text-[10px] text-slate-500 mt-0.5 italic line-clamp-1">{tx.notes}</div>
                                        <div className="flex items-center gap-2 text-[10px] font-medium mt-1">
                                            <span className="text-slate-500">{new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            <span className="text-white/20">•</span>
                                            <span className={cn(
                                                "font-black tracking-widest",
                                                tx.paymentMethod === 'Efectivo' ? "text-emerald-500" :
                                                tx.paymentMethod === 'Tarjeta' ? "text-violet-500" :
                                                tx.paymentMethod === 'Uber' ? "text-green-500" :
                                                tx.paymentMethod === 'Didi' ? "text-orange-500" : 
                                                tx.paymentMethod === 'Didi Efectivo' ? "text-orange-400 font-black border-b border-orange-500/30" : "text-pink-500"
                                            )}>{tx.paymentMethod.toUpperCase()}</span>
                                            <span className="text-white/20">•</span>
                                            <span className="text-indigo-400 font-black uppercase">{tx.destination || 'TIENDA'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="text-right">
                                        <div className="text-sm font-black text-white">${tx.amount.toFixed(2)}</div>
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
      
      {/* --- HIDDEN CORTE TICKET FOR PRINTING --- */}
      {isPrintingCorte && (
          <div className={cn("print-only-corte", settings.paperSize === 'Standard' ? 'paper-standard' : 'paper-58mm')}>
              <CorteTicket summary={dailyIVA} date={selectedDate} paperSize={settings.paperSize} />
          </div>
      )}
    </div>
  );
}
