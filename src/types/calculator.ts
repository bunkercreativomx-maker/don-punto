export type Platform = 'Uber' | 'Didi' | 'Rappi';
export type TaxRegime = 'PFAE';
export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta';

export interface Category {
    id: string;
    name: string;
}

export interface Modifier {
    id: string;
    name: string;
    extraPrice: number;
}

export interface ModifierGroup {
    id: string;
    name: string;
    options: Modifier[];
    selectionType: 'single' | 'multiple';
    minSelect?: number;
    maxSelect?: number;
    appliedToCategories?: string[];
}

export interface CalculatorState {
    platform: Platform;
    taxRegime: TaxRegime;
    paymentMethod: PaymentMethod;
    hasValidRFC: boolean;
    baseCommissionPct: number;
    ivaRate: 0.16 | 0.08;
}

export interface ProductRowData {
    id: string;
    name: string;
    description?: string;
    costPrice: number;
    salePrice: number;
    // Menu integration
    categoryId?: string;
    modifierGroupIds?: string[];
    // Platform-specific override prices (pre-inflated)
    didiPrice?: number;
    uberPrice?: number;
    rappiPrice?: number;
    // Pricing Calculator specific fields
    targetProfit?: number; // VAS A RECIBIR
    quantity?: number;
    discountPct?: number;
    subsidyPct?: number;
    shippingCost?: number;
}

export interface CalculationResult {
    rowId: string;
    grossRevenue: number;
    platformCommission: number;
    ivaCommission: number;
    ivaDeduction: number;
    isrDeduction: number;
    totalDeductions: number;
    netRevenue: number;
    netProfit: number;
    profitMarginPct: number;
    ivaDesglose: number;
}

export interface PricingCalculationResult {
    rowId: string;
    targetProfit: number;
    quantity: number;
    platformUnitPrice: number;
    totalProduct: number;
    discountPct: number;
    priceForClientBase: number;
    discountAmount: number;
    subsidyPct: number;
    subsidyAmount: number;
    finalClientPrice: number;
    shippingCost: number;
    platformCommission: number;
    iva: number;
    baseGravable: number;
    ivaRetention: number;
    isrRetention: number;
    impuestoCedular: number;
    montoARecibir: number;
    utilidad: number;
    utilidadPct: number;
}
