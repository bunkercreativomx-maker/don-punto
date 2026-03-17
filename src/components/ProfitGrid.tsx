import { Plus, Trash2, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ProductRowData, CalculationResult } from '../types/calculator';

function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(inputs));
}

interface ProfitGridProps {
    rows: ProductRowData[];
    results: CalculationResult[];
    updateRow: (id: string, updates: Partial<ProductRowData>) => void;
    removeRow: (id: string) => void;
    addRow: () => void;
}

export function ProfitGrid({ rows, results, updateRow, removeRow, addRow }: ProfitGridProps) {
    return (
        <>
            {rows.length > 0 ? (
                <div className="hidden md:grid md:grid-cols-[2fr_1.2fr_1.2fr_1.5fr_1.5fr_1.5fr_1fr_1fr_40px] gap-3 px-4 py-4 bg-slate-900/80 backdrop-blur-md rounded-t-2xl border-b border-indigo-500/10 text-[9px] lg:text-[10px] font-bold text-slate-400 uppercase tracking-wider items-center shadow-lg">
                    <div className="text-left pl-2">Producto</div>
                    <div className="text-right">Costo</div>
                    <div className="text-right">Precio</div>
                    <div className="text-right text-rose-300">Comisión + IVA</div>
                    <div className="text-right text-rose-300">Impuestos SAT</div>
                    <div className="text-right text-emerald-300">Recibir</div>
                    <div className="text-right text-indigo-300">Ganancia</div>
                    <div className="text-right text-amber-300">Margen</div>
                    <div className="text-center"></div>
                </div>
            ) : (
                <div className="bg-slate-900/60 border border-white/5 rounded-2xl p-12 text-center text-slate-400">
                    <TrendingUp className="mx-auto h-12 w-12 text-slate-600 mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Aún no hay productos</h3>
                    <p className="mb-6">Crea productos para calcular tus márgenes de entrega.</p>
                    <button
                        onClick={addRow}
                        className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all border border-white/5"
                    >
                        <Plus size={18} />
                        Agregar Primer Producto
                    </button>
                </div>
            )}

            <div className="space-y-4 md:space-y-0 text-sm">
                {rows.map((row) => {
                    const res = results.find((r) => r.rowId === row.id);
                    if (!res) return null;

                    return (
                        <div key={row.id} className="bg-slate-900/60 backdrop-blur-md border border-white/5 md:border-t-0 p-4 md:p-0 md:px-6 md:py-4 rounded-2xl md:rounded-none last:md:rounded-b-2xl first:md:border-t-transparent hover:bg-slate-800/40 transition-colors group">
                            <div className="grid grid-cols-1 md:grid-cols-[2fr_1.2fr_1.2fr_1.5fr_1.5fr_1.5fr_1fr_1fr_40px] gap-3 items-center">

                                {/* Name */}
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1 md:hidden">Producto</label>
                                    <input
                                        type="text"
                                        value={row.name}
                                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                                        className="w-full bg-slate-950/80 border border-white/5 shadow-inner rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all font-medium text-sm"
                                        placeholder="Ej. Hamburguesa"
                                    />
                                </div>

                                {/* Cost */}
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1 md:hidden">Costo ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-2.5 text-slate-500 text-sm">$</span>
                                        <input
                                            type="number"
                                            value={row.costPrice || ''}
                                            onChange={(e) => updateRow(row.id, { costPrice: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-slate-950/80 border border-white/5 shadow-inner rounded-lg pl-6 pr-2 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-right font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                {/* Sale */}
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1 md:hidden">Precio ($)</label>
                                    <div className="relative">
                                        <span className="absolute left-2.5 top-2.5 text-slate-500 text-sm">$</span>
                                        <input
                                            type="number"
                                            value={row.salePrice || ''}
                                            onChange={(e) => updateRow(row.id, { salePrice: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-slate-950/80 border border-white/5 shadow-inner rounded-lg pl-6 pr-2 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all text-right font-mono text-sm"
                                        />
                                    </div>
                                </div>

                                {/* App Comission + IVA */}
                                <div className="md:text-right font-mono flex md:block justify-between items-center text-sm">
                                    <span className="md:hidden text-[10px] text-slate-500 uppercase tracking-wider">Comisión + IVA App</span>
                                    <span className="text-rose-300/90 font-medium">
                                        ${(res.platformCommission + res.ivaCommission).toFixed(2)}
                                    </span>
                                </div>

                                {/* Taxes (SAT) */}
                                <div className="md:text-right font-mono flex md:block justify-between items-center text-sm">
                                    <span className="md:hidden text-[10px] text-slate-500 uppercase tracking-wider">Impuestos (SAT)</span>
                                    <span className="text-rose-400/90 font-medium" title={`IVA Retenido: $${res.ivaDeduction.toFixed(2)} | ISR Retenido: $${res.isrDeduction.toFixed(2)}`}>
                                        ${(res.ivaDeduction + res.isrDeduction).toFixed(2)}
                                    </span>
                                </div>

                                {/* Monto a Recibir */}
                                <div className="md:text-right font-mono flex md:block justify-between items-center">
                                    <span className="md:hidden text-[10px] text-slate-500 uppercase tracking-wider">Monto a Recibir</span>
                                    <span className="text-emerald-300/90 font-medium whitespace-nowrap">
                                        ${res.netRevenue.toFixed(2)}
                                    </span>
                                </div>

                                {/* Net Profit */}
                                <div className="md:text-right font-mono flex md:block justify-between items-center">
                                    <span className="md:hidden text-[10px] text-slate-500 uppercase tracking-wider">Ganancia Neta</span>
                                    <span className={cn(
                                        "text-base font-bold tracking-tight",
                                        res.netProfit > 0 ? "text-white" : res.netProfit < 0 ? "text-rose-400" : "text-slate-400"
                                    )}>
                                        ${res.netProfit.toFixed(2)}
                                    </span>
                                </div>

                                {/* Margin */}
                                <div className="md:text-right font-mono flex md:block justify-between items-center">
                                    <span className="md:hidden text-[10px] text-slate-500 uppercase tracking-wider">Margen</span>
                                    <span className={cn(
                                        "px-2 py-1 rounded-md text-[11px] font-bold inline-block border",
                                        res.profitMarginPct >= 30 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                            res.profitMarginPct > 0 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                                "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                    )}>
                                        {res.profitMarginPct.toFixed(1)}%
                                    </span>
                                </div>

                                {/* Actions */}
                                <div className="flex justify-end md:justify-center items-center mt-2 md:mt-0">
                                    <button
                                        onClick={() => removeRow(row.id)}
                                        className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                                        title="Eliminar producto"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                            </div>
                        </div>
                    );
                })}
            </div>
        </>
    );
}
