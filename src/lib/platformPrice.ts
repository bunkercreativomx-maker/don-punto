import type { CalculatorState, ProductRowData, PricingCalculationResult } from '../types/calculator';

/** Calculadora de Plataformas: una sola fórmula para la tabla y para el punto de venta. */

type PriceSettings = Pick<CalculatorState, 'baseCommissionPct' | 'hasValidRFC' | 'ivaRate'>;

export const MAX_DISCOUNT_PCT = 95;
export const MAX_COMMISSION_PCT = 60;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

function rates(s: PriceSettings) {
    const ivaRate = s.ivaRate ?? 0.16;
    const commissionPct = clamp(Number(s.baseCommissionPct ?? 30), 0, MAX_COMMISSION_PCT) / 100;
    const ivaRetPct = s.hasValidRFC ? 0.08 : 0.16;
    const isrRetPct = s.hasValidRFC ? 0.025 : 0.20;
    // De cada peso que paga el cliente, esto es lo que te queda
    const keep = 1 - commissionPct * (1 + ivaRate) - (ivaRetPct + isrRetPct) / (1 + ivaRate);
    return { ivaRate, commissionPct, ivaRetPct, isrRetPct, keep };
}

/** «VAS A RECIBIR» efectivo: si no se ha capturado, se usa el precio de tienda (igual que el punto de venta). */
export const effectiveTarget = (row: ProductRowData) =>
    row.targetProfit && row.targetProfit > 0 ? row.targetProfit : (row.salePrice || 0);

const rowInputs = (row: ProductRowData) => ({
    quantity: row.quantity && row.quantity > 0 ? row.quantity : 1,
    discount: clamp(row.discountPct || 0, 0, MAX_DISCOUNT_PCT) / 100,
    subsidy: clamp(row.subsidyPct || 0, 0, 100) / 100,
    shipping: Math.max(0, row.shippingCost || 0),
});

/**
 * Precio por pieza en la app para recibir el monto objetivo.
 * `extra` = modificadores elegidos (por pieza), que se inflan con el mismo factor.
 * Devuelve 0 si no hay objetivo o si la comisión + retenciones se comen todo el precio.
 */
export function platformUnitPrice(row: ProductRowData, settings: PriceSettings, extra = 0): number {
    const { keep } = rates(settings);
    const { quantity, discount, shipping } = rowInputs(row);
    const target = effectiveTarget(row);
    const perPeso = keep * (1 - discount);
    if (perPeso <= 0) return 0;
    const needed = target + shipping;
    const base = needed > 0 ? needed / (perPeso * quantity) : 0;
    const extras = extra > 0 ? extra / perPeso : 0;
    return base + extras;
}

/** Desglose completo de un renglón de la tabla de Plataformas. */
export function platformBreakdown(row: ProductRowData, settings: PriceSettings): PricingCalculationResult {
    const { ivaRate, commissionPct, ivaRetPct, isrRetPct } = rates(settings);
    const { quantity, discount, subsidy, shipping } = rowInputs(row);
    const targetProfit = effectiveTarget(row);

    const P = platformUnitPrice(row, settings);
    const totalProduct = P * quantity;
    const priceForClientBase = totalProduct * (1 - discount);
    const discountAmount = totalProduct * discount;
    // El apoyo de la plataforma no cambia el precio: se suma a lo que recibes
    const subsidyAmount = discountAmount * subsidy;
    const base = priceForClientBase + subsidyAmount;

    const platformCommission = base * commissionPct;
    const iva = platformCommission * ivaRate;
    const baseGravable = base / (1 + ivaRate);
    const ivaRetention = baseGravable * ivaRetPct;
    const isrRetention = baseGravable * isrRetPct;
    const montoARecibir = base - shipping - platformCommission - iva - ivaRetention - isrRetention;
    const utilidad = montoARecibir - (row.costPrice || 0) * quantity;
    const utilidadPct = priceForClientBase > 0 ? utilidad / priceForClientBase : 0;

    return {
        rowId: row.id,
        targetProfit,
        quantity,
        platformUnitPrice: P,
        totalProduct,
        discountPct: discount * 100,
        priceForClientBase,
        discountAmount,
        subsidyPct: subsidy * 100,
        subsidyAmount,
        shippingCost: shipping,
        platformCommission,
        iva,
        baseGravable,
        ivaRetention,
        isrRetention,
        impuestoCedular: 0,
        montoARecibir,
        utilidad,
        utilidadPct,
    };
}
