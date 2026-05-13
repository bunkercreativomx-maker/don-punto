import type { CartItem, POSPaymentMethod, OrderDestination, PaperSize } from '../../types/pos';
import { useCalculator } from '../../hooks/useCalculator';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface POSTicketProps {
  items: CartItem[];
  total: number;
  paymentMethod: POSPaymentMethod;
  destination: OrderDestination;
  customerName?: string;
  date?: string;
  isKitchen?: boolean;
  paperSize?: PaperSize;
  receivedAmount?: number;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  discountAmount?: number;
}

export function POSTicket({ items, total, paymentMethod, destination, customerName, date, isKitchen = false, paperSize = '58mm', receivedAmount, businessName, businessPhone, businessAddress, discountAmount }: POSTicketProps) {
  const { rows } = useCalculator();
  const printDate = date ? new Date(date) : new Date();
  const subtotal = total + (discountAmount || 0);

  return (
    <div className={cn(
        "font-mono text-black p-4 bg-white leading-snug",
        paperSize === '58mm' ? "paper-58mm" : "paper-standard"
    )}>
      <div className="text-center mb-4 border-b border-black pb-2">
        <h2 className="text-base font-bold uppercase tracking-tighter">
          {isKitchen ? '--- COMANDA COCINA ---' : (businessName?.toUpperCase() || 'MI NEGOCIO')}
        </h2>
        {!isKitchen && (
          <>
            {businessPhone && <p className="text-[9px] sm:text-[10px]">Tel: {businessPhone}</p>}
            {businessAddress && <p className="text-[9px] sm:text-[10px]">{businessAddress}</p>}
            <p className="text-[10px] sm:text-xs mt-1">Ticket de Venta</p>
          </>
        )}
      </div>

      <div className="space-y-1 mb-4 border-b border-black pb-2">
        <div className="flex-row-print">
            <span>Fecha:</span>
            <span>{printDate.toLocaleDateString()}</span>
        </div>
        <div className="flex-row-print">
            <span>Hora:</span>
            <span>{printDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="flex-row-print">
            <span>Cliente:</span>
            <span>{customerName?.toUpperCase() || 'VENTA MOSTRADOR'}</span>
        </div>
        <div className="flex-row-print">
            <span>Origen:</span>
            <span>{destination.toUpperCase()}</span>
        </div>
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-12 gap-1 border-b border-black pb-1 mb-1 font-bold">
            <span className="col-span-2">Cant</span>
            <span className="col-span-10">Articulo</span>
        </div>
        <div className="space-y-2">
            {items.map((item, i) => {
                const row = rows.find(r => r.id === item.rowId);
                return (
                    <div key={i} className="border-b border-black/10 pb-1">
                        <div className="grid grid-cols-12 gap-1">
                            <span className="col-span-2">{item.quantity}x</span>
                            <span className="col-span-10 font-bold uppercase">{row?.name}</span>
                        </div>
                        {item.selectedModifiers.length > 0 && (
                            <div className="pl-4 italic text-[9px] sm:text-[10px]">
                                {item.selectedModifiers.map(g => (
                                    <div key={g.groupId}>+ {g.modifiers.map(m => m.name).join(', ')}</div>
                                ))}
                            </div>
                        )}
                        {item.customerNote && (
                            <div className="pl-4 text-[9px] sm:text-[10px] font-bold">
                                * {item.customerNote}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
      </div>

      {!isKitchen && (
        <div className="space-y-1 pt-2 border-t border-black mb-4">
          {discountAmount !== undefined && discountAmount > 0 && (
            <>
              <div className="flex-row-print">
                <span>Subtotal:</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>
              <div className="flex-row-print">
                <span>Descuento:</span>
                <span>-${discountAmount.toFixed(2)}</span>
              </div>
            </>
          )}
          <div className="flex-row-print text-sm font-bold">
            <span>TOTAL:</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <div className="flex-row-print">
            <span>Metodo de Pago:</span>
            <span>{paymentMethod}</span>
          </div>
          {receivedAmount !== undefined && (
            <>
              <div className="flex-row-print">
                <span>Recibido:</span>
                <span>${receivedAmount.toFixed(2)}</span>
              </div>
              <div className="flex-row-print font-bold border-t border-black pt-1 mt-1">
                <span>CAMBIO:</span>
                <span>${(receivedAmount - total).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="text-center mt-6 pt-4 border-t border-dashed border-black">
        <p className="font-bold text-[10px] sm:text-xs uppercase">
            {isKitchen ? '--- PRIORIDAD ---' : '¡GRACIAS POR SU COMPRA!'}
        </p>
        <p className="text-[9px] sm:text-[10px]">
            {isKitchen ? 'Favor de preparar' : 'Vuelva pronto'}
        </p>
      </div>
    </div>
  );
}
