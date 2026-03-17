import type { Modifier } from './calculator';

export type POSPaymentMethod = 'Efectivo' | 'Didi' | 'Uber' | 'Rappi' | 'Tarjeta' | 'Didi Efectivo';
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
}

export interface OpenTicket {
    id: string;
    customerName: string;
    createdAt: string;
    items: CartItem[];
    destination: OrderDestination;
    total: number;
}

export interface POSSummary {
  total: number;
  byMethod: Record<POSPaymentMethod, number>;
  byDestination: Record<OrderDestination, number>;
  totalIVA: number; // IVA in total sales
  cashIVA: number;  // IVA specifically for Cash (Efectivo) sales
}

export type PaperSize = '58mm' | 'Standard';

export interface POSSettings {
  ivaPercentage: number;
  printCustomerTicket: boolean;
  printKitchenTicket: boolean;
  paperSize?: PaperSize;
  businessName?: string;
  businessPhone?: string;
  businessAddress?: string;
}
