import type { POSSummary, POSPaymentMethod, PaperSize } from '../../types/pos';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { money } from '../../lib/format';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface CorteTicketProps {
  summary: POSSummary;
  date: string;
  paperSize?: PaperSize;
}

export function CorteTicket({ summary, date, paperSize = '58mm' }: CorteTicketProps) {
  const printDate = new Date();
  const reportDate = new Date(date + 'T00:00:00');

  const methods: POSPaymentMethod[] = ['Efectivo', 'Tarjeta', 'Uber', 'Didi', 'Rappi', 'Didi Efectivo'];

  return (
    <div className={cn("ticket-body font-mono text-black bg-white leading-snug", paperSize === 'Standard' ? "p-4" : "p-0")}>
      <div className="text-center mb-6 border-b border-black pb-2">
        <h2 className="text-base font-bold uppercase tracking-tighter">
          --- CORTE DE CAJA ---
        </h2>
        <p className="text-[10px] sm:text-xs">Reporte Diario de Ventas</p>
      </div>

      <div className="space-y-1 mb-6 border-b border-black pb-2">
        <div className="flex-row-print">
            <span>Fecha Reporte:</span>
            <span>{reportDate.toLocaleDateString()}</span>
        </div>
        <div className="flex-row-print">
            <span>Impresión:</span>
            <span>{printDate.toLocaleDateString()}</span>
        </div>
        <div className="flex-row-print">
            <span>Hora:</span>
            <span>{printDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-bold mb-3 border-b border-black pb-1 uppercase text-xs">Ventas por Método</h3>
        <div className="space-y-1">
            {methods.map((method) => {
                const amount = summary.byMethod[method] || 0;
                return (
                    <div key={method} className="flex-row-print">
                        <span className="uppercase">{method}:</span>
                        <span>${money(amount)}</span>
                    </div>
                );
            })}
        </div>
      </div>

      <div className="mb-6 bg-slate-50/50 p-2 border-y border-black border-dashed">
        <h3 className="font-bold mb-3 border-b border-black/10 pb-1 uppercase text-xs">Desglose de IVA</h3>
        <div className="space-y-1">
            <div className="flex-row-print">
                <span>IVA RECAUDADO:</span>
                <span>${money(summary.totalIVA)}</span>
            </div>
            <div className="flex-row-print">
                <span>IVA EFECTIVO*:</span>
                <span>${money(summary.cashIVA)}</span>
            </div>
        </div>
        <p className="text-[10px] mt-2 italic text-black/60">* Incluye Efectivo y Didi Efectivo</p>
      </div>

      <div className="pt-2 border-t border-black mb-10">
        <div className="flex-row-print text-sm font-black uppercase">
            <span>TOTAL VENTA:</span>
            <span>${money(summary.total)}</span>
        </div>
      </div>

      <div className="text-center pt-8 border-t border-black border-dotted">
        <p className="mb-8 font-mono">__________________________</p>
        <p className="font-bold text-xs uppercase tracking-widest">Firma del Responsable</p>
      </div>
    </div>
  );
}
