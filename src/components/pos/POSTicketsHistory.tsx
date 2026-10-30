import { useState, useMemo } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { useCalculator } from '../../hooks/useCalculator';
import { POSTicket } from './POSTicket';
import { 
  Search, 
  Calendar, 
  Printer, 
  Clock, 
  User, 
  CreditCard, 
  ChevronRight, 
  Receipt, 
  TrendingUp, 
  ShoppingBag,
  Store,
  Bike
} from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import { money } from '../../lib/format';
import { PrintArea } from '../print/PrintArea';
import { runPrint } from '../../lib/print';
import { logEvent, getShifts } from '../../lib/cashShift';
import { authorizeWithPin } from '../../lib/session';
import { RotateCcw } from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function POSTicketsHistory() {
  const { transactions, settings, reopenTransaction } = usePOS();
  const [reopenFor, setReopenFor] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const { rows } = useCalculator();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [useDateFilter, setUseDateFilter] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Print States
  const [ticketToPrint, setTicketToPrint] = useState<any | null>(null);
  const [printType, setPrintType] = useState<'customer' | 'kitchen'>('customer');

  // Compute stable Folio numbers (#0001, #0002, etc.) based on chronological order
  const transactionsWithFolios = useMemo(() => {
    const sortedChronologically = [...transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    return sortedChronologically.map((tx, index) => ({
      ...tx,
      folio: `#${String(index + 1).padStart(4, '0')}`
    })).reverse(); // Return sorted newest first
  }, [transactions]);

  // Filter transactions based on date and search term
  const filteredTickets = useMemo(() => {
    return transactionsWithFolios.filter(tx => {
      // Date filter
      if (useDateFilter) {
        const txDateStr = tx.date.split('T')[0];
        if (txDateStr !== selectedDate) return false;
      }

      // Search term filter (Folio, Customer Name, Notes/Items)
      if (searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase();
        const matchesFolio = tx.folio.toLowerCase().includes(term);
        const matchesCustomer = (tx.customerName || '').toLowerCase().includes(term);
        const matchesNotes = (tx.notes || '').toLowerCase().includes(term);
        return matchesFolio || matchesCustomer || matchesNotes;
      }

      return true;
    });
  }, [transactionsWithFolios, selectedDate, useDateFilter, searchTerm]);

  // Find currently selected ticket
  const selectedTicket = useMemo(() => {
    return transactionsWithFolios.find(tx => tx.id === selectedTicketId) || null;
  }, [transactionsWithFolios, selectedTicketId]);

  // Trigger print dialog
  const handlePrint = (ticket: any, type: 'customer' | 'kitchen') => {
    setTicketToPrint(ticket);
    setPrintType(type);
    if (type === 'customer') logEvent('reimpresion', ticket.id, ticket.amount, ticket.folio);
    
    runPrint('ticket', () => setTicketToPrint(null));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-10rem)] animate-in fade-in slide-in-from-bottom-2 duration-500 no-print">

      {/* LEFT SIDE: Tickets list & Filters */}
      <div className="lg:col-span-4 flex flex-col bg-slate-900 backdrop-blur-2xl border border-carbon-950/10 rounded-3xl overflow-hidden shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] h-full">
        {/* Header and filters */}
        <div className="p-6 border-b border-carbon-950/10 space-y-4 shrink-0 bg-slate-900">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-black text-carbon-950 flex items-center gap-2">
              <Receipt className="text-indigo-400" size={20} /> Historial de Tickets
            </h3>
            <span className="text-[10px] font-black bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-full border border-indigo-500/20 uppercase tracking-widest">
              {filteredTickets.length} Encontrados
            </span>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input
              type="text"
              placeholder="Buscar por Folio, Cliente o Productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-carbon-950/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-carbon-950 font-medium outline-none focus:ring-1 focus:ring-indigo-500 transition-all placeholder:text-slate-500"
            />
          </div>

          {/* Quick date shortcuts */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: 'Hoy', getDate: () => new Date().toISOString().split('T')[0] },
              { label: 'Ayer', getDate: () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]; } },
            ].map(s => (
              <button
                key={s.label}
                onClick={() => { setSelectedDate(s.getDate()); setUseDateFilter(true); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all",
                  useDateFilter && selectedDate === s.getDate()
                    ? "bg-indigo-500 border-indigo-400 text-white"
                    : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-carbon-950"
                )}
              >{s.label}</button>
            ))}
            <button
              onClick={() => setUseDateFilter(false)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all",
                !useDateFilter ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-carbon-950"
              )}
            >Todos</button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-950 border border-carbon-950/10 px-3 py-2 rounded-xl">
            <Calendar className="text-slate-500 shrink-0" size={16} />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setUseDateFilter(true); }}
              className="bg-transparent text-xs font-bold text-carbon-950 outline-none w-full"
            />
          </div>
        </div>

        {/* Tickets Scrollable List */}
        <div className="flex-grow overflow-y-auto no-scrollbar p-6 space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-16 text-slate-600 text-center px-4">
              <Receipt size={40} className="opacity-10 mb-4 animate-pulse" />
              <p className="text-sm font-semibold text-slate-400">No se encontraron tickets</p>
              <p className="text-xs text-slate-600 mt-1 mb-4">Prueba cambiando el filtro de fecha o buscando otro término</p>
              <button
                onClick={() => setUseDateFilter(false)}
                className="px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-xl text-xs font-black hover:bg-indigo-500/20 transition-all"
              >Ver todos los tickets</button>
            </div>
          ) : (
            filteredTickets.map(tx => {
              const isSelected = selectedTicketId === tx.id;
              const dateObj = new Date(tx.date);
              
              return (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTicketId(tx.id)}
                  className={cn(
                    "w-full text-left p-4 rounded-2xl border flex items-center justify-between transition-all duration-300 group relative overflow-hidden",
                    isSelected 
                      ? "bg-slate-950 border-indigo-500/50 shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/5" 
                      : "bg-slate-950/40 border-carbon-950/10 hover:border-carbon-950/10 hover:bg-slate-950/20"
                  )}
                >
                  {/* Selected Indicator line */}
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-r" />
                  )}

                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className={cn(
                      "w-12 h-12 shrink-0 rounded-xl flex flex-col items-center justify-center font-black",
                      tx.destination === 'Tienda' 
                        ? "bg-indigo-500/10 text-indigo-400" 
                        : "bg-amber-500/10 text-amber-500"
                    )}>
                      {tx.destination === 'Tienda' ? <Store size={18} /> : <Bike size={18} />}
                      <span className="text-[10px] uppercase font-black tracking-widest mt-0.5">{tx.destination}</span>
                    </div>
                    
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 text-xs font-black text-indigo-400 tracking-wider bg-indigo-950/40 border border-indigo-500/10 px-1.5 py-0.5 rounded-md">{tx.folio}</span>
                        <span className="text-sm font-black text-carbon-950 truncate">{tx.customerName || 'Venta Mostrador'}</span>
                      </div>
                      
                      <p className="text-[10px] text-slate-500 mt-1 italic line-clamp-1 w-full max-w-[200px] sm:max-w-[280px]">{tx.notes}</p>
                      
                      <div className="flex items-center gap-2 text-[10px] font-medium mt-1.5 text-slate-500">
                        <span>{dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span className={cn(
                          "font-black tracking-wide uppercase text-[9px]",
                          tx.paymentMethod === 'Efectivo' && "text-emerald-500",
                          tx.paymentMethod === 'Tarjeta' && "text-violet-500",
                          tx.paymentMethod === 'Uber' && "text-green-500",
                          tx.paymentMethod === 'Didi' && "text-orange-500",
                          tx.paymentMethod === 'Didi Efectivo' && "text-orange-400",
                          tx.paymentMethod === 'Rappi' && "text-pink-500"
                        )}>
                          {tx.paymentMethod}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    <div className="text-right">
                      <div className="text-base font-black text-carbon-950">${money(tx.amount)}</div>
                    </div>
                    <ChevronRight size={16} className="text-slate-600 group-hover:text-carbon-950 transition-colors" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Ticket Live Preview & Actions */}
      <div className="lg:col-span-8 flex flex-col bg-slate-900 backdrop-blur-2xl border border-carbon-950/10 rounded-3xl overflow-hidden shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] h-full">
        {selectedTicket ? (
          <div className="flex flex-col h-full">
            {/* Quick Actions Header */}
            <div className="p-6 border-b border-carbon-950/10 bg-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
              <div>
                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">ACCIONES DE IMPRESIÓN</h4>
                <div className="text-base font-bold text-carbon-950 flex items-center gap-2">
                  <span>Reimprimir {selectedTicket.folio}</span>
                </div>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handlePrint(selectedTicket, 'customer')}
                  className="flex-1 sm:flex-initial bg-indigo-500 hover:bg-indigo-400 text-white px-5 py-3 rounded-2xl font-black text-xs transition-all shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-95"
                >
                  <Printer size={15} /> CLIENTE
                </button>
                <button
                  onClick={() => handlePrint(selectedTicket, 'kitchen')}
                  className="flex-1 sm:flex-initial bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/20 px-5 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Printer size={15} /> COCINA
                </button>
                <button
                  onClick={() => {
                    const sh = selectedTicket.shiftId ? getShifts().find((x) => x.id === selectedTicket.shiftId) : null;
                    if (sh?.closedAt) { alert(`Esta cuenta es del turno ${sh.number}, que ya se cerró. No se puede reabrir para no alterar el corte.`); return; }
                    setReopenFor(selectedTicket.id); setPin(''); setPinError(false);
                  }}
                  className="flex-1 sm:flex-initial bg-white hover:bg-carbon-50 text-carbon-700 border border-carbon-950/10 px-5 py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 active:scale-95"
                  title="Regresa la cuenta a Tickets Abiertos para corregirla (requiere PIN)"
                >
                  <RotateCcw size={15} /> REABRIR
                </button>
              </div>
            </div>

            {/* Receipt Preview scrollable area */}
            <div className="flex-grow overflow-y-auto no-scrollbar p-10 bg-slate-950/20 flex justify-center items-start">
              {/* Paper Ticket Representation */}
              <div className="w-full max-w-[340px] bg-white text-carbon-950 p-6 rounded-2xl shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] relative overflow-hidden border border-black/5 animate-in zoom-in-95 duration-300">
                {/* Vintage receipt thermal edge styling */}
                <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-b from-slate-200 to-transparent" />
                
                {/* Header */}
                <div className="text-center pb-4 border-b border-dashed border-slate-300 mb-4">
                  <h3 className="font-mono text-base font-black uppercase tracking-tight">
                    {settings.businessName || 'MI NEGOCIO'}
                  </h3>
                  <p className="font-mono text-[9px] text-slate-500 mt-1 uppercase tracking-wider">REIMPRESIÓN • {selectedTicket.folio}</p>
                </div>

                {/* Details */}
                <div className="font-mono text-[11px] space-y-1 pb-4 border-b border-dashed border-slate-300 mb-4">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fecha:</span>
                    <span className="font-bold">{new Date(selectedTicket.date).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Hora:</span>
                    <span className="font-bold">{new Date(selectedTicket.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cliente:</span>
                    <span className="font-bold uppercase">{selectedTicket.customerName || 'VENTA MOSTRADOR'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Origen:</span>
                    <span className="font-bold uppercase">{selectedTicket.destination}</span>
                  </div>
                </div>

                {/* Items */}
                <div className="font-mono text-[11px] space-y-3 pb-4 border-b border-dashed border-slate-300 mb-4">
                  <div className="grid grid-cols-12 gap-1 border-b border-slate-300 pb-1 mb-1 font-black uppercase text-[10px]">
                    <span className="col-span-2">Cant</span>
                    <span className="col-span-10">Articulo</span>
                  </div>

                  {selectedTicket.items && selectedTicket.items.length > 0 ? (
                    selectedTicket.items.map((item: any, idx: number) => {
                      const row = rows.find(r => r.id === item.rowId);
                      return (
                        <div key={idx} className="pb-1 border-b border-slate-100 last:border-0 last:pb-0">
                          <div className="grid grid-cols-12 gap-1">
                            <span className="col-span-2 font-bold">{item.quantity}x</span>
                            <span className="col-span-10 font-bold uppercase">{row?.name || 'Producto'}</span>
                          </div>
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div className="pl-4 italic text-[9px] text-slate-500">
                              {item.selectedModifiers.map((g: any) => (
                                <div key={g.groupId}>+ {g.modifiers.map((m: any) => m.name).join(', ')}</div>
                              ))}
                            </div>
                          )}
                          {item.customerNote && (
                            <div className="pl-4 text-[9px] font-bold text-slate-500">
                              * {item.customerNote}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 italic py-2">{selectedTicket.notes}</div>
                  )}
                </div>

                {/* Totals */}
                <div className="font-mono text-[11px] space-y-1.5 mb-4">
                  {selectedTicket.discountAmount !== undefined && selectedTicket.discountAmount > 0 && (
                    <>
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>${money((selectedTicket.amount + selectedTicket.discountAmount))}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 font-bold">
                        <span>Descuento:</span>
                        <span>-${money(selectedTicket.discountAmount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-base font-black border-t border-dashed border-slate-300 pt-2 mt-2">
                    <span>TOTAL:</span>
                    <span>${money(selectedTicket.amount)}</span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">Forma de Pago:</span>
                    <span className="font-bold uppercase">{selectedTicket.paymentMethod}</span>
                  </div>
                </div>

                {/* Ticket Footer */}
                <div className="text-center pt-4 border-t border-dashed border-slate-300 text-slate-500 text-[10px]">
                  <p className="font-bold uppercase text-slate-500">¡GRACIAS POR SU COMPRA!</p>
                  <p className="mt-0.5">Vuelva pronto</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 p-8">
            <div className="w-16 h-16 bg-slate-950 rounded-3xl flex items-center justify-center text-slate-500 mb-4 border border-carbon-950/10 animate-pulse">
              <Receipt size={32} />
            </div>
            <h4 className="text-sm font-bold text-carbon-950">Ningún Ticket Seleccionado</h4>
            <p className="text-xs text-slate-500 mt-1 text-center max-w-[260px]">Selecciona un ticket de la lista de la izquierda para ver su detalle y realizar reimpresiones.</p>
          </div>
        )}
      </div>

      {reopenFor && (() => {
        const tx = transactionsWithFolios.find((t) => t.id === reopenFor);
        const confirm = () => {
          if (!authorizeWithPin(pin, settings.adminPin)) { setPinError(true); setPin(''); return; }
          if (tx) { logEvent('reapertura', tx.id, tx.amount, `${tx.folio} ${tx.customerName || ''}`.trim()); reopenTransaction(tx.id); }
          setReopenFor(null); setSelectedTicketId(null);
        };
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-sm p-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-carbon-950">Reabrir cuenta {tx?.folio}</h3>
                <p className="text-xs text-slate-500 mt-1">La venta sale del registro y vuelve a Tickets Abiertos en el Punto de Venta para corregirla y cobrarla de nuevo. Queda anotado en el corte. PIN del dueño o gerente.</p>
              </div>
              <input type="password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirm()} placeholder="••••"
                className={cn("w-full bg-slate-950 border-2 rounded-2xl text-center text-3xl tracking-[0.5em] font-black text-carbon-950 py-3 outline-none", pinError ? "border-rose-500" : "border-carbon-950/10 focus:border-indigo-500")} />
              {pinError && <div className="text-rose-500 text-xs font-bold text-center">PIN INCORRECTO</div>}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setReopenFor(null)} className="py-3 rounded-xl font-bold text-slate-500 bg-slate-800/50">CANCELAR</button>
                <button onClick={confirm} className="py-3 rounded-xl font-black text-white bg-indigo-500 hover:bg-indigo-400">REABRIR</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* HIDDEN IN DOM: ONLY VISIBLE DURING window.print() */}
      {ticketToPrint && (
        <PrintArea kind="ticket" paper={settings.paperSize}>
          <POSTicket 
            items={ticketToPrint.items || []}
            total={ticketToPrint.amount}
            paymentMethod={ticketToPrint.paymentMethod}
            destination={ticketToPrint.destination}
            customerName={ticketToPrint.customerName}
            isKitchen={printType === 'kitchen'}
            paperSize={settings.paperSize}
            businessName={settings.businessName}
            businessPhone={settings.businessPhone}
            businessAddress={settings.businessAddress}
            discountAmount={ticketToPrint.discountAmount}
            tip={ticketToPrint.tip}
            date={ticketToPrint.date}
          />
        </PrintArea>
      )}
    </div>
  );
}
