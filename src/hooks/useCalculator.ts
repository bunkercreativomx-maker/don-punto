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
    baseCommissionPct: 30, // Default 30% commission
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
            // PLACHOLDER LOGIC: Revisit when exact formulas are available
            const grossRevenue = row.salePrice;

            // Commission & IVA only apply if NOT in 'Efectivo' (Physical Store)
            const isPlatform = settings.paymentMethod !== 'Efectivo';
            
            const platformCommission = isPlatform ? grossRevenue * (settings.baseCommissionPct / 100) : 0;
            const ivaCommission = isPlatform ? platformCommission * 0.16 : 0;

            // Base Gravable for Taxes (Only counts if it's Transferencia, Efectivo = 0)
            const baseGravable = settings.paymentMethod === 'Efectivo' ? 0 : (grossRevenue / 1.16);

            // Calculate IVA and ISR Retenciones based on RFC
            // PM and PFAE operate identically based on 2024+ reform rules for platforms
            let ivaPct = 0;
            let isrPct = 0;

            if (!settings.hasValidRFC) {
                // If NO RFC: 36% total retention (16% IVA + 20% ISR applied together often just grouped under IVA/ISR)
                ivaPct = 0.16;
                isrPct = 0.20;
            } else {
                // With Valid RFC
                ivaPct = 0.08;   // 8% IVA Retention
                isrPct = 0.025;  // 2.5% ISR Retention as per Excel sheet
            }

            const ivaDeduction = isPlatform ? (baseGravable * ivaPct) : 0;
            const isrDeduction = isPlatform ? (baseGravable * isrPct) : 0;

            const totalDeductions = platformCommission + ivaCommission + ivaDeduction + isrDeduction + row.costPrice;
            const netRevenue = grossRevenue - platformCommission - ivaCommission - ivaDeduction - isrDeduction;
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

            let P = 0; // Unit price
            let low = 0;
            let high = targetProfit > 0 ? targetProfit * 10 : 20000;
            if (targetProfit <= 0) high = 100; // fallback if 0

            let finalOutput: Partial<PricingCalculationResult> = {};

            // Loop up to 60 times for higher decimal precision binary search
            for (let i = 0; i < 60; i++) {
                P = (low + high) / 2;

                const T = P * quantity;
                const clientBase = T * (1 - discountPct);
                const discountAmount = T * discountPct;
                const subsidyAmount = clientBase * subsidyPct;
                const finalClientPrice = clientBase - subsidyAmount;

                const baseForCalc = finalClientPrice;

                const commission = baseForCalc * (settings.baseCommissionPct / 100);
                const ivaComm = commission * 0.16;

                // IMPORTANTE: En la pestaña de cálculo de PRECIOS de plataforma, 
                // siempre asumimos que es una transacción de plataforma (con impuestos), 
                // independientemente de si la pestaña de GANANCIAS está en modo Efectivo.
                const baseGravable = baseForCalc / 1.16;
                let ivaPct = settings.hasValidRFC ? 0.08 : 0.16;
                let isrPct = settings.hasValidRFC ? 0.025 : 0.20;

                const ivaRet = baseGravable * ivaPct;
                const isrRet = baseGravable * isrPct;
                const impuestoCedular = 0;

                // M = finalClientPrice - shipping - taxes
                const montoARecibir = baseForCalc - shippingCost - commission - ivaComm - ivaRet - isrRet - impuestoCedular;

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
                    finalClientPrice,
                    shippingCost,
                    platformCommission: commission,
                    iva: ivaComm,
                    baseGravable,
                    ivaRetention: ivaRet,
                    isrRetention: isrRet,
                    impuestoCedular,
                    montoARecibir,
                };

                if (diff > 0.0001) {
                    high = P;
                } else if (diff < -0.0001) {
                    low = P;
                } else {
                    break;
                }
            }

            // POST-FIX: If result is something like 184.99997, it's effectively 185.00
            // The user prefers "Clean" prices if they satisfy the target within a tiny margin of error.
            const roundedP = Math.round(P * 100) / 100;
            // Re-test the rounded value to see if it still satisfies the target profit sufficiently
            const T_round = roundedP * quantity;
            const finalClientPrice_round = (T_round * (1 - discountPct)) - ((T_round * (1 - discountPct)) * subsidyPct);
            const baseForCalc_round = finalClientPrice_round;
            const commission_round = baseForCalc_round * (settings.baseCommissionPct / 100);
            const ivaComm_round = commission_round * 0.16;
            const baseGravable_round = baseForCalc_round / 1.16;
            let ivaPct_round = settings.hasValidRFC ? 0.08 : 0.16;
            let isrPct_round = settings.hasValidRFC ? 0.025 : 0.20;
            const ivaRet_round = baseGravable_round * ivaPct_round;
            const isrRet_round = baseGravable_round * isrPct_round;
            const montoARecibir_round = baseForCalc_round - shippingCost - commission_round - ivaComm_round - ivaRet_round - isrRet_round;

            // If the rounded price gives essentially the same result (or better), use it.
            // This prevents "184.99" when "$185.00" was intended.
            if (Math.abs(montoARecibir_round - targetProfit) < 0.01) {
                 P = roundedP;
                 // Re-calculate the final results with this cleaner P
                 const T = P * quantity;
                 const clientBase = T * (1 - discountPct);
                 const discountAmount = T * discountPct;
                 const subsidyAmount = clientBase * subsidyPct;
                 const finalClientPrice = clientBase - subsidyAmount;
                 const baseForCalc = finalClientPrice;
                 const commission = baseForCalc * (settings.baseCommissionPct / 100);
                 const ivaComm = commission * 0.16;
                 const baseGravable = baseForCalc / 1.16;
                 const ivaRet = baseGravable * (settings.hasValidRFC ? 0.08 : 0.16);
                 const isrRet = baseGravable * (settings.hasValidRFC ? 0.025 : 0.20);
                 const montoARecibir = baseForCalc - shippingCost - commission - ivaComm - ivaRet - isrRet;

                 finalOutput = {
                    ...finalOutput,
                    platformUnitPrice: P,
                    totalProduct: T,
                    priceForClientBase: clientBase,
                    discountAmount,
                    subsidyAmount,
                    finalClientPrice,
                    platformCommission: commission,
                    iva: ivaComm,
                    baseGravable,
                    ivaRetention: ivaRet,
                    isrRetention: isrRet,
                    montoARecibir,
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
