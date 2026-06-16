import { Plus, Trash2, TrendingUp } from 'lucide-react';
import type { ProductRowData, PricingCalculationResult } from '../types/calculator';

interface PricingGridProps {
    rows: ProductRowData[];
    pricingResults: PricingCalculationResult[];
    updateRow: (id: string, updates: Partial<ProductRowData>) => void;
    removeRow: (id: string) => void;
    addRow: () => void;
    syncWithStorePrices: () => void;
}

// Column widths matching the Excel PFAE structure
const COLS = [
    '100px', // Utilidad (%)
    '110px', // Utilidad ($)
    '130px', // Costo de Producción
    '140px', // VAS A RECIBIR
    '200px', // PRODUCTO
    '160px', // DESCRIPCION
    '80px',  // CANTIDAD PRODUCTO
    '130px', // PRECIO UNITARIO PLATAFORMA
    '120px', // TOTAL PRODUCTO
    '100px', // % DESCUENTO
    '120px', // PRECIO PARA EL CLIENTE
    '110px', // DESCUENTO
    '100px', // % SUBSIDIO
    '110px', // SUBSIDIO
    '130px', // PRECIO PARA EL CLIENTE (FINAL)
    '110px', // COSTO ENVÍO REPARTO PROPIO
    '110px', // COMISIÓN PLATAFORMA
    '100px', // IVA
    '130px', // BASE GRAVABLE PAGOS EN LÍNEA
    '110px', // IVA SOBRE BASE GRAVABLE
    '110px', // ISR SOBRE BASE GRAVABLE
    '120px', // IMPUESTO DEL ESTADO
    '140px', // MONTO A RECIBIR
    '60px',  // BORRAR
].join('_');

const gridCols = `grid-cols-[100px_110px_130px_140px_200px_160px_80px_130px_120px_100px_120px_110px_100px_110px_130px_110px_110px_100px_130px_110px_110px_120px_140px_60px]`;

export function PricingGrid({ rows, pricingResults, updateRow, removeRow, addRow, syncWithStorePrices }: PricingGridProps) {
    return (
        <div className="w-full space-y-4">
            {/* Header Area */}
            {rows.length > 0 && (
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            <TrendingUp size={20} />
                        </div>
                        <div className="text-xs text-slate-400 max-w-xl leading-relaxed">
                            <span className="text-yellow-400 font-bold uppercase tracking-wider block mb-0.5">Tip Pro:</span>
                            En <span className="text-yellow-500 font-semibold italic">"VAS A RECIBIR"</span> coloca el precio de tu restaurante. Haz clic en el botón azul para hacerlo automáticamente.
                        </div>
                    </div>
                    <button
                        onClick={syncWithStorePrices}
                        className="w-full md:w-auto bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus size={18} />
                        JALAR PRECIOS DE TIENDA FÍSICA
                    </button>
                </div>
            )}

            {/* Scrollable Table */}
            <div className="w-full overflow-x-auto pb-4 custom-scrollbar bg-slate-950/40 rounded-2xl border border-white/5 shadow-2xl">
                <div className="min-w-[3060px]">
                    {rows.length > 0 ? (
                        <>
                            {/* Table Header */}
                            <div className={`grid ${gridCols} gap-3 px-6 py-5 bg-slate-900 border-b border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-widest items-center sticky top-0 z-10`}>
                                {/* NEW: Left side — profitability columns */}
                                <div className="text-emerald-400 bg-emerald-500/5 py-1 px-2 rounded border border-emerald-500/10 text-center">UTILIDAD %</div>
                                <div className="text-emerald-400 bg-emerald-500/5 py-1 px-2 rounded border border-emerald-500/10 text-center">UTILIDAD $</div>
                                <div className="text-slate-400">COSTO DE PRODUCCIÓN</div>
                                {/* Core pricing columns */}
                                <div className="text-yellow-500 bg-yellow-500/5 py-1 px-2 rounded border border-yellow-500/10 text-center">VAS A RECIBIR</div>
                                <div className="pl-2">PRODUCTO</div>
                                <div>DESCRIPCIÓN</div>
                                <div className="text-center">CANTIDAD</div>
                                <div className="text-right text-white">PRECIO UNIT. PLATAFORMA</div>
                                <div className="text-right">TOTAL PRODUCTO</div>
                                <div className="text-right">% DESCUENTO</div>
                                <div className="text-right text-indigo-400">P. CLIENTE</div>
                                <div className="text-right">DESCUENTO ($)</div>
                                <div className="text-right">% SUBSIDIO</div>
                                <div className="text-right">SUBSIDIO ($)</div>
                                <div className="text-right text-emerald-400 font-black">P. CLIENTE FINAL</div>
                                <div className="text-right text-rose-400/70">COSTO ENVÍO</div>
                                <div className="text-right text-rose-400/70">COMISIÓN PLATAFORMA</div>
                                <div className="text-right text-rose-400/70">IVA</div>
                                <div className="text-right">BASE GRAVABLE</div>
                                <div className="text-right text-rose-400/70">IVA S/ BASE GRAV.</div>
                                <div className="text-right text-rose-400/70">ISR S/ BASE GRAV.</div>
                                <div className="text-right">IMP. DEL ESTADO</div>
                                <div className="text-right text-yellow-500 bg-yellow-500/5 py-1 px-2 rounded border border-yellow-500/10 text-center">MONTO A RECIBIR</div>
                                <div className="text-center">BORRAR</div>
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-white/5">
                                {rows.map((row) => {
                                    const res = pricingResults.find((r) => r.rowId === row.id);
                                    if (!res) return null;

                                    const utilidadPctColor = res.utilidadPct > 0 ? 'text-emerald-400' : 'text-rose-400';
                                    const utilidadColor = res.utilidad > 0 ? 'text-emerald-400' : 'text-rose-400';

                                    return (
                                        <div key={row.id} className={`grid ${gridCols} gap-3 px-6 py-4 hover:bg-slate-800/40 transition-colors items-center font-mono text-xs text-slate-300`}>

                                            {/* 1. Utilidad (%) — computed */}
                                            <div className={`text-right font-black px-2 ${utilidadPctColor} bg-emerald-500/5 py-1.5 rounded-xl border border-emerald-500/10`}>
                                                {(res.utilidadPct * 100).toFixed(1)}%
                                            </div>

                                            {/* 2. Utilidad ($) — computed */}
                                            <div className={`text-right font-black px-2 ${utilidadColor} bg-emerald-500/5 py-1.5 rounded-xl border border-emerald-500/10`}>
                                                ${res.utilidad.toFixed(2)}
                                            </div>

                                            {/* 3. Costo de Producción — input */}
                                            <div>
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-2.5 text-slate-500 text-[10px]">$</span>
                                                    <input
                                                        type="number"
                                                        value={row.costPrice || ''}
                                                        onChange={(e) => updateRow(row.id, { costPrice: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 pl-6 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500/40 transition-all text-right"
                                                        placeholder="0"
                                                    />
                                                </div>
                                            </div>

                                            {/* 4. VAS A RECIBIR — input */}
                                            <div>
                                                <div className="relative group/input">
                                                    <span className="absolute left-2.5 top-2.5 text-yellow-500/40 text-[10px]">$</span>
                                                    <input
                                                        type="number"
                                                        value={row.targetProfit || ''}
                                                        onChange={(e) => updateRow(row.id, { targetProfit: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 pl-6 py-2 text-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 transition-all text-right font-bold tracking-tight"
                                                    />
                                                </div>
                                            </div>

                                            {/* 5. PRODUCTO */}
                                            <div className="font-sans truncate pl-2 text-slate-200" title={row.name}>
                                                {row.name}
                                            </div>

                                            {/* 6. DESCRIPCIÓN — input */}
                                            <div>
                                                <input
                                                    type="text"
                                                    value={row.description || ''}
                                                    onChange={(e) => updateRow(row.id, { description: e.target.value })}
                                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-xs"
                                                    placeholder="Descripción..."
                                                />
                                            </div>

                                            {/* 7. CANTIDAD */}
                                            <div>
                                                <input
                                                    type="number"
                                                    value={row.quantity || 1}
                                                    onChange={(e) => updateRow(row.id, { quantity: parseFloat(e.target.value) || 1 })}
                                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-center"
                                                />
                                            </div>

                                            {/* 8. PRECIO UNITARIO PLATAFORMA — computed */}
                                            <div className="text-right text-white font-black bg-white/5 py-1.5 px-3 rounded-xl border border-white/5 shadow-inner">
                                                ${res.platformUnitPrice.toFixed(2)}
                                            </div>

                                            {/* 9. TOTAL PRODUCTO */}
                                            <div className="text-right text-slate-400 px-2 tracking-tighter">
                                                ${res.totalProduct.toFixed(2)}
                                            </div>

                                            {/* 10. % DESCUENTO */}
                                            <div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        value={row.discountPct || 0}
                                                        onChange={(e) => updateRow(row.id, { discountPct: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-right pr-6"
                                                    />
                                                    <span className="absolute right-2 top-2 text-slate-600 text-[10px]">%</span>
                                                </div>
                                            </div>

                                            {/* 11. PRECIO PARA EL CLIENTE */}
                                            <div className="text-right text-indigo-400 bg-indigo-500/5 py-1 px-2 rounded-lg border border-indigo-500/10">
                                                ${res.priceForClientBase.toFixed(2)}
                                            </div>

                                            {/* 12. DESCUENTO ($) */}
                                            <div className="text-right text-slate-500 px-2">
                                                -${res.discountAmount.toFixed(2)}
                                            </div>

                                            {/* 13. % SUBSIDIO */}
                                            <div>
                                                <input
                                                    type="number"
                                                    value={row.subsidyPct || 0}
                                                    onChange={(e) => updateRow(row.id, { subsidyPct: parseFloat(e.target.value) || 0 })}
                                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-right"
                                                />
                                            </div>

                                            {/* 14. SUBSIDIO ($) */}
                                            <div className="text-right text-slate-500 px-2">
                                                -${res.subsidyAmount.toFixed(2)}
                                            </div>

                                            {/* 15. PRECIO PARA EL CLIENTE FINAL */}
                                            <div className="text-right text-emerald-400 font-bold bg-emerald-500/5 py-1.5 px-3 rounded-xl border border-emerald-500/10 shadow-lg shadow-emerald-500/5">
                                                ${res.finalClientPrice.toFixed(2)}
                                            </div>

                                            {/* 16. COSTO ENVÍO REPARTO PROPIO */}
                                            <div>
                                                <div className="relative">
                                                    <span className="absolute left-1.5 top-1.5 text-slate-600 text-[10px]">$</span>
                                                    <input
                                                        type="number"
                                                        value={row.shippingCost || 0}
                                                        onChange={(e) => updateRow(row.id, { shippingCost: parseFloat(e.target.value) || 0 })}
                                                        className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 pl-4 py-1.5 text-rose-400/80 focus:outline-none focus:ring-2 focus:ring-rose-500/40 text-right"
                                                    />
                                                </div>
                                            </div>

                                            {/* 17. COMISIÓN PLATAFORMA */}
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${res.platformCommission.toFixed(2)}</div>

                                            {/* 18. IVA */}
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${res.iva.toFixed(2)}</div>

                                            {/* 19. BASE GRAVABLE PAGOS EN LÍNEA */}
                                            <div className="text-right text-slate-600 px-2">(${res.baseGravable.toFixed(2)})</div>

                                            {/* 20. IVA SOBRE BASE GRAVABLE */}
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${res.ivaRetention.toFixed(2)}</div>

                                            {/* 21. ISR SOBRE BASE GRAVABLE */}
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${res.isrRetention.toFixed(2)}</div>

                                            {/* 22. IMPUESTO DEL ESTADO */}
                                            <div className="text-right text-slate-600 px-2">-$0.00</div>

                                            {/* 23. MONTO A RECIBIR */}
                                            <div className="text-right text-yellow-500 font-black bg-yellow-500/10 py-1.5 px-3 rounded-xl border border-yellow-500/20 shadow-lg shadow-yellow-500/5">
                                                ${res.montoARecibir.toFixed(2)}
                                            </div>

                                            {/* 24. BORRAR */}
                                            <div className="flex justify-center">
                                                <button
                                                    onClick={() => removeRow(row.id)}
                                                    className="p-2 text-slate-600 hover:text-rose-500 hover:bg-rose-500/10 rounded-full transition-all"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="bg-slate-900/40 border border-white/5 rounded-2xl p-20 text-center text-slate-500">
                            <TrendingUp className="mx-auto h-16 w-16 text-slate-800 mb-6" />
                            <h3 className="text-xl font-bold text-white mb-2 tracking-tight">Tu calculadora está vacía</h3>
                            <p className="mb-8 text-slate-400">Agrega productos para visualizar tus precios estratégicos de plataforma.</p>
                            <button
                                onClick={addRow}
                                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-2xl font-bold transition-all border border-white/10 shadow-2xl"
                            >
                                <Plus size={20} />
                                EMPEZAR AHORA
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar {
                    height: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.02);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(99, 102, 241, 0.3);
                    border-radius: 10px;
                    border: 3px solid transparent;
                    background-clip: content-box;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(99, 102, 241, 0.5);
                    background-clip: content-box;
                }
            `}</style>
        </div>
    );
}
