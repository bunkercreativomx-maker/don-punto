import { useState, useMemo, useEffect } from 'react';
import type {
    CalculatorState,
    ProductRowData,
    CalculationResult,
    PricingCalculationResult,
    Category,
    ModifierGroup
} from '../types/calculator';
import { storeGet, storeSet } from '../lib/cloudStore';
import { platformBreakdown } from '../lib/platformPrice';

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
            const savedSettings = storeGet(`${prefix}Settings`);
            if (savedSettings) {
                try { return JSON.parse(savedSettings); } catch (e) { }
            }
        }
        return DEFAULT_STATE;
    });

    const [rows, setRows] = useState<ProductRowData[]>(() => {
        if (persist) {
            const savedRows = storeGet(`${prefix}Rows`);
            if (savedRows) {
                try { return JSON.parse(savedRows); } catch (e) { }
            }
        }
        return initialRows;
    });

    const [categories, setCategories] = useState<Category[]>(() => {
        if (persist) {
            const saved = storeGet(`${prefix}Categories`);
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { }
            }
        }
        return [];
    });

    const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>(() => {
        if (persist) {
            const saved = storeGet(`${prefix}ModifierGroups`);
            if (saved) {
                try { return JSON.parse(saved); } catch (e) { }
            }
        }
        return [];
    });

    // Save to localStorage whenever state changes
    useEffect(() => {
        if (persist) {
            storeSet(`${prefix}Settings`, JSON.stringify(settings));
        }
    }, [settings, prefix, persist]);

    useEffect(() => {
        if (persist) {
            storeSet(`${prefix}Rows`, JSON.stringify(rows));
        }
    }, [rows, prefix, persist]);

    useEffect(() => {
        if (persist) {
            storeSet(`${prefix}Categories`, JSON.stringify(categories));
        }
    }, [categories, prefix, persist]);

    useEffect(() => {
        if (persist) {
            storeSet(`${prefix}ModifierGroups`, JSON.stringify(modifierGroups));
        }
    }, [modifierGroups, prefix, persist]);

    const updateSetting = <K extends keyof CalculatorState>(key: K, value: CalculatorState[K]) => {
        setSettings((prev) => ({ ...prev, [key]: value }));
    };

    const addRow = () => {
        // Al inicio de la lista: las tablas paginan de 10 en 10 y al final no se veía.
        setRows((prev) => [
            {
                id: crypto.randomUUID(),
                name: `Producto nuevo ${prev.length + 1}`,
                costPrice: 0,
                salePrice: 0,
            },
            ...prev,
        ]);
    };

    const addProducts = (newProducts: ProductRowData[]) => {
        setRows(prev => [...prev, ...newProducts]);
    };

    // Campos de la calculadora de plataformas: si cambian, el precio fijo importado
    // (uberPrice/rappiPrice/didiPrice) ya no aplica y el POS debe usar el precio calculado.
    const PRICING_KEYS: (keyof ProductRowData)[] = ['targetProfit', 'quantity', 'discountPct', 'subsidyPct', 'shippingCost'];

    const updateRow = (id: string, updates: Partial<ProductRowData>) => {
        const touchesPricing = PRICING_KEYS.some(k => k in updates);
        const setsOverride = 'uberPrice' in updates || 'rappiPrice' in updates || 'didiPrice' in updates;
        setRows((prev) =>
            prev.map((r) => {
                if (r.id !== id) return r;
                const next = { ...r, ...updates };
                if (touchesPricing && !setsOverride) {
                    next.uberPrice = undefined;
                    next.rappiPrice = undefined;
                    next.didiPrice = undefined;
                }
                return next;
            })
        );
    };

    // Reordenar productos: mueve `id` al lugar de `targetId` (así funciona aunque el POS muestre solo una categoría)
    const moveProduct = (id: string, targetId: string) => {
        setRows((prev) => {
            const from = prev.findIndex((r) => r.id === id);
            const to = prev.findIndex((r) => r.id === targetId);
            if (from < 0 || to < 0 || from === to) return prev;
            const next = [...prev];
            const [it] = next.splice(from, 1);
            next.splice(to, 0, it);
            return next;
        });
    };

    const removeRow = (id: string) => {
        setRows((prev) => prev.filter((r) => r.id !== id));
    };

    const syncWithStorePrices = () => {
        // Copia el precio de tienda a "VAS A RECIBIR" y quita los precios fijos de apps
        // para que Uber/Rappi/Didi en el punto de venta usen el precio recalculado.
        setRows((prev) => prev.map(r => ({
            ...r,
            targetProfit: r.salePrice || 0,
            uberPrice: undefined,
            rappiPrice: undefined,
            didiPrice: undefined,
        })));
    };

    // Category Management
    const addCategory = (name: string) => {
        setCategories(prev => [...prev, { id: crypto.randomUUID(), name }]);
    };

    const updateCategory = (id: string, name: string) => {
        setCategories(prev => prev.map(c => c.id === id ? { ...c, name } : c));
    };

    const moveCategory = (from: number, to: number) => {
        setCategories(prev => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
            const next = [...prev];
            const [it] = next.splice(from, 1);
            next.splice(to, 0, it);
            return next;
        });
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

    // Orden de los grupos = orden en que salen en Personalizar (POS) y en la tienda en línea
    const moveModifierGroup = (from: number, to: number) => {
        setModifierGroups(prev => {
            if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
            const next = [...prev];
            const [it] = next.splice(from, 1);
            next.splice(to, 0, it);
            return next;
        });
    };

    const removeModifierGroup = (id: string) => {
        setModifierGroups(prev => prev.filter(g => g.id !== id));
        // Remove from product association
        setRows(prev => prev.map(r => ({
            ...r,
            modifierGroupIds: r.modifierGroupIds?.filter(gid => gid !== id),
            modifierGroupOff: r.modifierGroupOff?.filter(gid => gid !== id)
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

    // Una sola fórmula para la tabla de Plataformas y para el punto de venta (src/lib/platformPrice.ts)
    const pricingResults = useMemo(
        () => rows.map((row): PricingCalculationResult => platformBreakdown(row, settings)),
        [rows, settings]
    );

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
        moveProduct,
        results,
        pricingResults,
        syncWithStorePrices,
        categories,
        addCategory,
        updateCategory,
        removeCategory,
        moveCategory,
        modifierGroups,
        addModifierGroup,
        updateModifierGroup,
        removeModifierGroup,
        moveModifierGroup,
        loadCloudMenu,
    };
}
