import { useState, useMemo, useEffect } from 'react';
import type {
    CalculatorState,
    ProductRowData,
    CalculationResult,
    PricingCalculationResult,
    Category,
    ModifierGroup
} from '../types/calculator';

const DEFAULT_STATE: CalculatorState = {
    platform: 'Uber',
    taxRegime: 'PFAE',
    paymentMethod: 'Transferencia',
    hasValidRFC: true,
    baseCommissionPct: 30,
    ivaRate: 0.16,
};

export function useCalculator(
    initialRows: ProductRowData[] = [],
    options: { storageKeyPrefix?: string; persist?: boolean } = { persist: true }
) {
    const persist = options.persist ?? true;
    const prefix = options.storageKeyPrefix || 'deliveryCalc';

    // Initialize from localStorage or use defaults
    const [settings, setSettings] = useState<CalculatorState>(() => {
        if (persist) {
            const savedSettings = localStorage.getItem(`${prefix}Settings`);
            if (savedSettings) {
                try { return JSON.parse(savedSettings); } catch (e) { }
            }
        }
        return DEFAULT_STATE;
    });

    const [rows, setRows] = useState<ProductRowData[]>(() => {
        if (persist) {
            const savedRows = localStorage.getItem(`${prefix}Rows`);
            if (savedRows) {
                try { return JSON.parse(savedRows); } catch (e) { }
            }
        }
        return initialRows;
    });

    const [categories, setCategories] = useState<Category[]>(() => {
        if (persist) {
            const saved = localStorage.getItem(`${prefix}Categories`);
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { }
            }
        }
        return [];
    });

    const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() => {
        if (persist) {
            const saved = localStorage.getItem(`${prefix}ModifierGroups`);
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { }
            }
        }
        return [];
    });

    // Save to localStorage whenever state changes
    useEffect(() => {
        if (persist) {
            localStorage.setItem(`${prefix}Settings`, JSON.stringify(settings));
        }
    }, [settings, prefix, persist]);

    useEffect(() => {
        if (persist) {
            localStorage.setItem(`${prefix}Rows`, JSON.stringify(rows));
        }
    }, [rows, prefix, persist]);

    useEffect(() => {
        if (persist) {
            localStorage.setItem(`${prefix}Categories`, JSON.stringify(categories));
        }
    }, [categories, prefix, persist]);

    useEffect(() => {
        if (persist) {
            localStorage.setItem(`${prefix}ModifierGroups`, JSON.stringify(modifierGroups));
        }
    }, [modifierGroups, prefix, persist]);

    const updateSetting = <K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const addRow = () => {
        setRows((prev) => [
            ...prev,
            {
                id: crypto.randomUUID(),
                name: `Product ${prev.length + 1}`,
                costPrice: 0,
                salePrice: 0,
            },
        ]);
    };

    const addProducts = (newProducts: ProductRowData[]) => {
        setRows(prev => [...prev, ...newProducts]);
    };

    const updateRow = (id: string, updates: Partial<ProductRowData>) => {
        setRows((prev) =>
            prev.map((r) => (r.id === id ? { ...r, ...updates } : r))
        );
    };

    const removeRow = (id: string) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const syncWithStorePrices = () => {
        setRows((prev) => prev.map(r => ({ ...r, targetProfit: r.salePrice || 0 })));
    };

    // Category Management
    const addCategory = (name: string) => {
        setCategories(prev => [...prev, { id: crypto.randomUUID(), name }]);
    };

    const updateCategory = (id: string, name: string) => {
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    };

    const removeCategory = (id: string) => {
        setCategories(prev => prev.filter(c => c.id !== id));
        // Reset categoryId for rows in this category
        setRows(prev => prev.map(r => r.categoryId === id ? { ...r, categoryId: undefined } : r));
    };

    // Modifier Group Management
    const addModifierGroup = (group: Omit<ModifierGroup, 'id'>) => {
        setModifierGroups(prev => [...prev, { ...group, id: crypto.randomUUID() }]);
    };

    const updateModifierGroup = (id: string, updates: Partial<ModifierGroup>) => {
        setModifierGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
    };

    const removeModifierGroup = (id: string) => {
        setModifierGroups(prev => prev.filter(g => g.id !== id));
        // Remove from product association
        setRows(prev => prev.map(r => ({
            ...r,
            modifierGroupIds: r.modifierGroupIds?.filter(gid => gid !== id)
        })));
    };

    const results = useMemo(() => {
        return rows.map((row): CalculationResult => {
            const grossRevenue = row.salePrice;
            const ivaRate = settings.ivaRate ?? 0.16;

            // IVA desglose: todos los precios incluyen IVA, extraer la parte proporcional
            const ivaDesglose = grossRevenue * ivaRate / (1 + ivaRate);

            // Commission & IVA only apply if NOT in 'Efectivo' (Physical Store)
            const isPlatform = settings.paymentMethod !== 'Efectivo';

            const platformCommission = isPlatform ? grossRevenue * (settings.baseCommissionPct / 100) : 0;
            const ivaCommission = isPlatform ? platformCommission * ivaRate : 0;

            // Base Gravable for Taxes (Only counts if it's Transferencia, Efectivo = 0)
            const baseGravable = settings.paymentMethod === 'Efectivo' ? 0 : (grossRevenue / (1 + ivaRate));

            // Retenciones SAT por plataformas (tasa fija según RFC, independiente de zona)
            let ivaPct = 0;
            let isrPct = 0;

            if (!settings.hasValidRFC) {
                ivaPct = 0.16;
                isrPct = 0.20;
            } else {
                ivaPct = 0.08;
                isrPct = 0.025;
            }

            const ivaDeduction = isPlatform ? (baseGravable * ivaPct) : 0;
            const isrDeduction = isPlatform ? (baseGravable * isrPct) : 0;

            const totalDeductions = platformCommission + ivaCommission + ivaDeduction + isrDeduction + row.costPrice;
            // Para Tienda Física: el IVA embebido en el precio pertenece al SAT, no al negocio
            const netRevenue = isPlatform
                ? grossRevenue - platformCommission - ivaCommission - ivaDeduction - isrDeduction
                : grossRevenue - ivaDesglose;
            const netProfit = netRevenue - row.costPrice;

            const profitMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

            return {
                rowId: row.id,
                grossRevenue,
                platformCommission,
                ivaCommission,
                ivaDeduction,
                isrDeduction,
                totalDeductions,
                netRevenue,
                netProfit,
                profitMarginPct,
                ivaDesglose,
            };
        });
    }, [rows, settings]);

    const pricingResults = useMemo(() => {
        return rows.map((row): PricingCalculationResult => {
            const targetProfit = row.targetProfit || 0;
            const quantity = row.quantity || 1;
            const discountPct = (row.discountPct || 0) / 100;
            const subsidyPct = (row.subsidyPct || 0) / 100;
            const shippingCost = row.shippingCost || 0;
            const ivaRate = settings.ivaRate ?? 0.16;

            let P = 0;
            let low = 0;
            let high = targetProfit > 0 ? targetProfit * 10 : 20000;
            if (targetProfit <= 0) high = 100;

            let finalOutput: Partial<PricingCalculationResult> = {};

            let lastT = 0;

            for (let i = 0; i < 60; i++) {
                P = (low + high) / 2;

                const T = P * quantity;
                lastT = T;
                const clientBase = T * (1 - discountPct);
                const discountAmount = T * discountPct;
                // Loop: find P WITHOUT subsidy (subsidy only benefits monto, not price)
                const baseForCalc = clientBase;

                const commission = baseForCalc * (settings.baseCommissionPct / 100);
                const ivaComm = commission * ivaRate;
                const baseGravable = baseForCalc / (1 + ivaRate);
                const ivaPct = settings.hasValidRFC ? 0.08 : 0.16;
                const isrPct = settings.hasValidRFC ? 0.025 : 0.20;
                const ivaRet = baseGravable * ivaPct;
                const isrRet = baseGravable * isrPct;
                const impuestoCedular = 0;

                const montoARecibir = baseForCalc - shippingCost - commission - ivaComm - ivaRet - isrRet - impuestoCedular;
                const costoProd = (row.costPrice || 0) * quantity;
                const utilidad = montoARecibir - costoProd;
                const utilidadPct = clientBase > 0 ? utilidad / clientBase : 0;

                // Still track subsidy for final output
                const subsidyAmount = discountAmount * subsidyPct;

                const diff = montoARecibir - targetProfit;

                finalOutput = {
                    rowId: row.id,
                    targetProfit,
                    quantity,
                    platformUnitPrice: P,
                    totalProduct: T,
                    discountPct: discountPct * 100,
                    priceForClientBase: clientBase,
                    discountAmount,
                    subsidyPct: subsidyPct * 100,
                    subsidyAmount,
                    shippingCost,
                    platformCommission: commission,
                    iva: ivaComm,
                    baseGravable,
                    ivaRetention: ivaRet,
                    isrRetention: isrRet,
                    impuestoCedular,
                    montoARecibir,
                    utilidad,
                    utilidadPct,
                };

                if (diff > 0.0001) {
                    high = P;
                } else if (diff < -0.0001) {
                    low = P;
                } else {
                    break;
                }
            }

            // Recalculate final values WITH subsidy included in the base
            const subsidyAmount_final = (lastT * discountPct) * subsidyPct;
            const baseForCalc_final = (lastT * (1 - discountPct)) + subsidyAmount_final;
            const commission_final = baseForCalc_final * (settings.baseCommissionPct / 100);
            const ivaComm_final = commission_final * ivaRate;
            const baseGravable_final = baseForCalc_final / (1 + ivaRate);
            const ivaRet_final = baseGravable_final * (settings.hasValidRFC ? 0.08 : 0.16);
            const isrRet_final = baseGravable_final * (settings.hasValidRFC ? 0.025 : 0.20);
            const montoARecibir_final = baseForCalc_final - shippingCost - commission_final - ivaComm_final - ivaRet_final - isrRet_final;
            const costoProd_final = (row.costPrice || 0) * quantity;
            const utilidad_final = montoARecibir_final - costoProd_final;
            const utilidadPct_final = (lastT * (1 - discountPct)) > 0 ? utilidad_final / (lastT * (1 - discountPct)) : 0;

            // POST-FIX: round clean prices if they satisfy target within margin (WITHOUT subsidy)
            const roundedP = Math.round(P * 100) / 100;
            const T_round = roundedP * quantity;
            const clientBase_round = T_round * (1 - discountPct);
            const discountAmount_round = T_round * discountPct;
            // Round check base WITHOUT subsidy
            const baseForCalc_round_check = clientBase_round;
            const commission_round_check = baseForCalc_round_check * (settings.baseCommissionPct / 100);
            const ivaComm_round_check = commission_round_check * ivaRate;
            const baseGravable_round_check = baseForCalc_round_check / (1 + ivaRate);
            const ivaRet_round_check = baseGravable_round_check * (settings.hasValidRFC ? 0.08 : 0.16);
            const isrRet_round_check = baseGravable_round_check * (settings.hasValidRFC ? 0.025 : 0.20);
            const montoARecibir_round_check = baseForCalc_round_check - shippingCost - commission_round_check - ivaComm_round_check - ivaRet_round_check - isrRet_round_check;

            if (Math.abs(montoARecibir_round_check - targetProfit) < 0.01) {
                 P = roundedP;
                 // Recalc WITH subsidy for display
                 const T_f = P * quantity;
                 const clientBase_f = T_f * (1 - discountPct);
                 const discountAmount_f = T_f * discountPct;
                 const subsidyAmount_f = discountAmount_f * subsidyPct;
                 const baseForCalc_f = clientBase_f + subsidyAmount_f;
                 const commission_f = baseForCalc_f * (settings.baseCommissionPct / 100);
                 const ivaComm_f = commission_f * ivaRate;
                 const baseGravable_f = baseForCalc_f / (1 + ivaRate);
                 const ivaRet_f = baseGravable_f * (settings.hasValidRFC ? 0.08 : 0.16);
                 const isrRet_f = baseGravable_f * (settings.hasValidRFC ? 0.025 : 0.20);
                 const montoARecibir_f = baseForCalc_f - shippingCost - commission_f - ivaComm_f - ivaRet_f - isrRet_f;
                 const costoProdR_f = (row.costPrice || 0) * quantity;
                 const utilidadR_f = montoARecibir_f - costoProdR_f;
                 const utilidadPctR_f = clientBase_f > 0 ? utilidadR_f / clientBase_f : 0;

                 finalOutput = {
                    ...finalOutput,
                    platformUnitPrice: P,
                    totalProduct: T_f,
                    priceForClientBase: clientBase_f,
                    discountAmount: discountAmount_f,
                    subsidyAmount: subsidyAmount_f,
                    platformCommission: commission_f,
                    iva: ivaComm_f,
                    baseGravable: baseGravable_f,
                    ivaRetention: ivaRet_f,
                    isrRetention: isrRet_f,
                    montoARecibir: montoARecibir_f,
                    utilidad: utilidadR_f,
                    utilidadPct: utilidadPctR_f,
                 };
            } else {
                // Apply subsidy-included values to main loop output
                finalOutput = {
                    ...finalOutput,
                    platformCommission: commission_final,
                    iva: ivaComm_final,
                    baseGravable: baseGravable_final,
                    ivaRetention: ivaRet_final,
                    isrRetention: isrRet_final,
                    montoARecibir: montoARecibir_final,
                    utilidad: utilidad_final,
                    utilidadPct: utilidadPct_final,
                };
            }

            return finalOutput as PricingCalculationResult;
        });
    }, [rows, settings]);

    const loadCloudMenu = (newRows: ProductRowData[], newCategories: Category[], newModifierGroups: ModifierGroup[]) => {
        if (newRows) setRows(newRows);
        if (newCategories) setCategories(newCategories);
        if (newModifierGroups) setModifierGroups(newModifierGroups);
    };

    return {
        settings,
        updateSetting,
        rows,
        addRow,
        addProducts,
        updateRow,
        removeRow,
        results,
        pricingResults,
        syncWithStorePrices,
        categories,
        addCategory,
        updateCategory,
        removeCategory,
        modifierGroups,
        addModifierGroup,
        updateModifierGroup,
        removeModifierGroup,
        loadCloudMenu,
    };
}
