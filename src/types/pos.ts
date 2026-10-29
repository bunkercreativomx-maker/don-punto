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
  /** Propina (NO forma parte de la venta; se cobra con la misma forma de pago) */
  tip?: number;
  /** Número de personas en la cuenta */
  guests?: number;
  /** Cortesía: la casa invita (descuento del 100% autorizado con PIN) */
  courtesy?: boolean;
  /** Turno de caja en el que se cobró */
  shiftId?: string;
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
    /** Número de personas */
    guests?: number;
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

/** Turno de caja: apertura con fondo, movimientos de efectivo y cierre con declaración del cajero */
export interface CashMovement { id: string; date: string; type: 'retiro' | 'deposito'; amount: number; reason?: string; byName?: string }
export interface CashDeclaration { efectivo: number; tarjeta: number; transferencia: number; otros: number }
export interface CashShift {
  id: string;
  number: number;
  openedAt: string;
  openedByName?: string;
  openingFloat: number;
  movements: CashMovement[];
  closedAt?: string;
  closedByName?: string;
  declaration?: CashDeclaration;
}
/** Bitácora de eventos de seguridad (reimpresiones y reaperturas de cuentas) */
export interface SecurityEvent { id: string; date: string; type: 'reimpresion' | 'reapertura'; txId: string; amount: number; byName?: string; detail?: string }
