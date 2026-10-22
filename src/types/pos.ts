import type { Modifier } from './calculator';

export type POSPaymentMethod = 'Efectivo' | 'Didi' | 'Uber' | 'Rappi' | 'Tarjeta' | 'Didi Efectivo' | 'Transferencia';
export type OrderDestination = 'Tienda' | 'Uber' | 'Didi' | 'Rappi';

export interface CartItem {
    cartId: string;
    rowId: string;
    quantity: number;
    customerNote?: string;
    selectedModifiers: {
        groupId: string;
        modifiers: Modifier[];
    }[];
}

export interface POSTransaction {
  id: string;
  date: string; // ISO 8601 string
  amount: number;
  paymentMethod: POSPaymentMethod;
  destination: OrderDestination;
  notes?: string;
  customerName?: string;
  items?: CartItem[];
  discountAmount?: number;
  /** Quién cobró (plan Pro con equipo) */
  employeeId?: string;
  employeeName?: string;
  /** Mesero que tomó la orden (si vino de una cuenta abierta) */
  waiterId?: string;
  waiterName?: string;
  /** Cliente registrado (plan Pro) */
  clientId?: string;
  /** Recompensa de lealtad aplicada */
  rewardApplied?: boolean;
}

export interface OpenTicket {
    id: string;
    customerName: string;
    createdAt: string;
    items: CartItem[];
    destination: OrderDestination;
    total: number;
    /** Quién tomó la orden */
    waiterId?: string;
    waiterName?: string;
}

export interface POSSummary {
  total: number;
  byMethod: Record<POSPaymentMethod, number>;
  byDestination: Record<OrderDestination, number>;
  totalIVA: number; // IVA in total sales
  cashIVA: number;  // IVA specifically for Cash (Efectivo) sales
}

export type PaperSize = '58mm' | '80mm' | 'Standard';

export interface POSSettings {
  ivaPercentage: number;
  printCustomerTicket: boolean;
  printKitchenTicket: boolean;
  paperSize?: PaperSize;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
  adminPin: string;
}

export interface Cancellation { id: string; date: string; txId: string; amount: number; detail?: string; byId?: string; byName?: string }
