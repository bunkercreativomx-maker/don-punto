import { useState } from 'react';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import type { ProductRowData, PricingCalculationResult } from '../types/calculator';
import { money } from '../lib/format';
import { MAX_COMMISSION_PCT, MAX_DISCOUNT_PCT } from '../lib/platformPrice';

interface PricingGridProps {
    rows: ProductRowData[];
    pricingResults: PricingCalculationResult[];
    updateRow: (id: string, updates: Partial<ProductRowData>) => void;
    removeRow: (id: string) => void;
    addRow: () => void;
    syncWithStorePrices: () => void;
    commissionPct: number;
    onCommissionChange: (pct: number) => void;
}

const gridCols = `grid-cols-[100px_110px_130px_140px_200px_160px_80px_130px_120px_100px_120px_110px_100px_110px_110px_110px_110px_100px_100px_60px]`;

/**
 * Campo numérico que SÍ se deja escribir: mientras lo editas guarda lo que tecleas tal cual
 * (antes el valor se reformateaba en cada tecla y no dejaba borrar ni escribir).
 */
export function NumField({ value, onChange, min = 0, max, decimals, allowEmpty = true, className, placeholder, label }: {
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
    /** Decimales fijos al mostrar (dinero = 2). Sin esto se muestra el número tal cual. */
    decimals?: number;
    /** false = si lo dejan vacío se conserva el valor anterior (ej. cantidad). */
    allowEmpty?: boolean;
    className?: string;
    placeholder?: string;
    label: string;
}) {
    const [draft, setDraft] = useState<string | null>(null);
    const shown = decimals !== undefined ? (Number(value) || 0).toFixed(decimals) : String(Math.round((Number(value) || 0) * 100) / 100);
    const fit = (n: number) => Math.min(max ?? Infinity, Math.max(min, n));
    return (
        <input
            type="text"
            inputMode="decimal"
            aria-label={label}
            placeholder={placeholder}
            value={draft ?? shown}
            onFocus={(e) => { setDraft(shown); const el = e.currentTarget; requestAnimationFrame(() => el.select()); }}
            onChange={(e) => {
                const t = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
                setDraft(t);
                if (t === '' || t === '.') { if (allowEmpty) onChange(fit(0)); return; }
                const n = parseFloat(t);
                if (Number.isFinite(n)) onChange(fit(n));
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            className={className}
        />
    );
}

export function PricingGrid({ rows, pricingResults, updateRow, removeRow, addRow, syncWithStorePrices, commissionPct, onCommissionChange }: PricingGridProps) {
    return (
        <div className="w-full space-y-4">
            {/* Header Area */}
            {rows.length > 0 && (
                <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                            <TrendingUp size={20} />
                        </div>
                        <div className="text-xs text-slate-400 max-w-xl leading-relaxed">
                            <span className="text-yellow-400 font-bold uppercase tracking-wider block mb-0.5">Tip Pro:</span>
                            En <span className="text-yellow-500 font-semibold italic">"VAS A RECIBIR"</span> coloca el precio de tu restaurante. Toca el botón verde para hacerlo automáticamente.
                        </div>
                    </div>
                    <label className="flex items-center gap-2 shrink-0 text-xs font-bold text-slate-300" data-commission>
                        <span className="leading-tight">Comisión de la app<span className="block text-[10px] font-medium text-slate-500">sin IVA; cámbiala por la tuya</span></span>
                        <span className="relative">
                            <NumField
                                label="Comisión de la app en porcentaje"
                                value={commissionPct}
                                max={MAX_COMMISSION_PCT}
                                onChange={onCommissionChange}
                                className="w-20 bg-slate-950 border border-carbon-950/10 rounded-xl px-3 pr-7 py-2.5 text-right text-sm font-black text-carbon-950 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                            />
                            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">%</span>
                        </span>
                    </label>
                    <button
                        onClick={syncWithStorePrices}
                        className="w-full md:w-auto bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <Plus size={18} />
                        JALAR PRECIOS DEL MENÚ
                    </button>
                </div>
            )}

            {/* Scrollable Table */}
            <div className="w-full overflow-x-auto pb-4 custom-scrollbar bg-slate-950/40 rounded-2xl border border-carbon-950/10 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
                <div className="min-w-[2600px]">
                    {rows.length > 0 ? (
                        <>
                            {/* Table Header */}
                            <div className={`grid ${gridCols} gap-3 px-6 py-5 bg-slate-900 border-b border-carbon-950/10 text-[10px] font-black text-slate-500 uppercase tracking-widest items-center sticky top-0 z-10`}>
                                {/* NEW: Left side — profitability columns */}
                                <div className="text-emerald-400 bg-emerald-500/5 py-1 px-2 rounded border border-emerald-500/10 text-center">UTILIDAD %</div>
                                <div className="text-emerald-400 bg-emerald-500/5 py-1 px-2 rounded border border-emerald-500/10 text-center">UTILIDAD $</div>
                                <div className="text-slate-400">COSTO DE PRODUCCIÓN</div>
                                {/* Core pricing columns */}
                                <div className="text-yellow-500 bg-yellow-500/5 py-1 px-2 rounded border border-yellow-500/10 text-center">VAS A RECIBIR</div>
                                <div className="pl-2">PRODUCTO</div>
                                <div>DESCRIPCIÓN</div>
                                <div className="text-center">CANTIDAD</div>
                                <div className="text-right text-carbon-950">PRECIO UNIT. PLATAFORMA</div>
                                <div className="text-right">TOTAL PRODUCTO</div>
                                <div className="text-right">% DESCUENTO</div>
                                <div className="text-right text-indigo-400">P. CLIENTE</div>
                                <div className="text-right">DESCUENTO ($)</div>
                                <div className="text-right">% APOYO PLATAFORMA</div>
                                <div className="text-right">APOYO PLATAFORMA ($)</div>
                                <div className="text-right text-rose-400/70">COSTO ENVÍO</div>
                                <div className="text-right text-rose-400/70">COMISIÓN PLATAFORMA</div>
                                <div className="text-right text-rose-400/70">IVA DE LA COMISIÓN</div>
                                <div className="text-right text-rose-400/70">RETENCIÓN IVA</div>
                                <div className="text-right text-rose-400/70">RETENCIÓN ISR</div>
                                <div className="text-center">BORRAR</div>
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-carbon-950/5">
                                {rows.map((row) => {
                                    const res = pricingResults.find((r) => r.rowId === row.id);
                                    if (!res) return null;

                                    const noPrice = res.platformUnitPrice <= 0 && res.targetProfit > 0;
                                    // Precios fijos importados: el punto de venta cobra estos en vez del calculado
                                    const fixed = ([['Uber', row.uberPrice], ['Didi', row.didiPrice], ['Rappi', row.rappiPrice]] as [string, number | undefined][])
                                        .filter(([, v]) => v && v > 0)
                                        .map(([n, v]) => `${n} $${money(v)}`);
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
                                                ${money(res.utilidad)}
                                            </div>

                                            {/* 3. Costo de Producción — input */}
                                            <div>
                                                <div className="relative">
                                                    <span className="absolute left-2.5 top-2.5 text-slate-500 text-[10px]">$</span>
                                                    <NumField
                                                        label="Costo de producción"
                                                        value={row.costPrice || 0}
                                                        decimals={2}
                                                        onChange={(n) => updateRow(row.id, { costPrice: n })}
                                                        className="w-full bg-slate-900 border border-carbon-950/10 rounded-xl px-3 pl-6 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-500/40 transition-all text-right"
                                                    />
                                                </div>
                                            </div>

                                            {/* 4. VAS A RECIBIR — input (lo que quieres recibir; si está vacío usa el precio de tienda) */}
                                            <div>
                                                <div className="relative group/input">
                                                    <span className="absolute left-2.5 top-2.5 text-yellow-500/40 text-[10px]">$</span>
                                                    <NumField
                                                        label="Vas a recibir"
                                                        value={res.targetProfit}
                                                        decimals={2}
                                                        onChange={(n) => updateRow(row.id, { targetProfit: n })}
                                                        className="w-full bg-yellow-500/5 border border-yellow-500/20 rounded-xl px-3 pl-6 py-2 text-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/40 transition-all text-right font-bold tracking-tight"
                                                    />
                                                </div>
                                                {res.subsidyAmount > 0.004 && (
                                                    <div className="mt-1 text-right font-sans text-[10px] text-slate-500">Con apoyo recibes <b className="text-slate-300">${money(res.montoARecibir)}</b></div>
                                                )}
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
                                                    className="w-full bg-slate-900 border border-carbon-950/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-xs"
                                                    placeholder="Descripción..."
                                                />
                                            </div>

                                            {/* 7. CANTIDAD */}
                                            <div>
                                                <NumField
                                                    label="Cantidad"
                                                    value={row.quantity || 1}
                                                    min={1}
                                                    allowEmpty={false}
                                                    onChange={(n) => updateRow(row.id, { quantity: n })}
                                                    className="w-full bg-slate-900 border border-carbon-950/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-center"
                                                />
                                            </div>

                                            {/* 8. PRECIO UNITARIO PLATAFORMA — computed */}
                                            <div>
                                                <div className="text-right text-carbon-950 font-black bg-carbon-950/5 py-1.5 px-3 rounded-xl border border-carbon-950/10 shadow-inner" title={noPrice ? 'Con esa comisión y retenciones no queda nada del precio' : undefined}>
                                                    {noPrice ? '—' : `$${money(res.platformUnitPrice)}`}
                                                </div>
                                                {fixed.length > 0 && (
                                                    <div className="mt-1 text-right font-sans text-[10px] leading-tight text-slate-500" title="Precio fijo que cobra el punto de venta en esa app. Se quita al cambiar VAS A RECIBIR, cantidad, descuento, apoyo o envío.">Fijo en caja: {fixed.join(' · ')}</div>
                                                )}
                                            </div>

                                            {/* 9. TOTAL PRODUCTO */}
                                            <div className="text-right text-slate-400 px-2 tracking-tighter">
                                                ${money(res.totalProduct)}
                                            </div>

                                            {/* 10. % DESCUENTO */}
                                            <div>
                                                <div className="relative">
                                                    <NumField
                                                        label="Porcentaje de descuento"
                                                        value={res.discountPct}
                                                        max={MAX_DISCOUNT_PCT}
                                                        onChange={(n) => updateRow(row.id, { discountPct: n })}
                                                        className="w-full bg-slate-900 border border-carbon-950/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-right pr-6"
                                                    />
                                                    <span className="absolute right-2 top-2 text-slate-600 text-[10px]">%</span>
                                                </div>
                                            </div>

                                            {/* 11. PRECIO PARA EL CLIENTE */}
                                            <div className="text-right text-indigo-400 bg-indigo-500/5 py-1 px-2 rounded-lg border border-indigo-500/10">
                                                ${money(res.priceForClientBase)}
                                            </div>

                                            {/* 12. DESCUENTO ($) */}
                                            <div className="text-right text-slate-500 px-2">
                                                -${money(res.discountAmount)}
                                            </div>

                                            {/* 13. % APOYO PLATAFORMA */}
                                            <div>
                                                <NumField
                                                    label="Porcentaje de apoyo de la plataforma"
                                                    value={res.subsidyPct}
                                                    max={100}
                                                    onChange={(n) => updateRow(row.id, { subsidyPct: n })}
                                                    className="w-full bg-slate-900 border border-carbon-950/10 rounded-lg px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 text-right"
                                                />
                                            </div>

                                            {/* 14. APOYO PLATAFORMA ($) */}
                                            <div className="text-right text-slate-500 px-2">
                                                +${money(res.subsidyAmount)}
                                            </div>

                                            {/* 15. COSTO ENVÍO REPARTO PROPIO */}
                                            <div>
                                                <div className="relative">
                                                    <span className="absolute left-1.5 top-1.5 text-slate-600 text-[10px]">$</span>
                                                    <NumField
                                                        label="Costo de envío con reparto propio"
                                                        value={row.shippingCost || 0}
                                                        onChange={(n) => updateRow(row.id, { shippingCost: n })}
                                                        className="w-full bg-slate-900 border border-carbon-950/10 rounded-lg px-2 pl-4 py-1.5 text-rose-400/80 focus:outline-none focus:ring-2 focus:ring-rose-500/40 text-right"
                                                    />
                                                </div>
                                            </div>

                                            {/* 17. COMISIÓN PLATAFORMA */}
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${money(res.platformCommission)}</div>
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${money(res.iva)}</div>
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${money(res.ivaRetention)}</div>
                                            <div className="text-right text-rose-400/60 px-2 tracking-tighter">-${money(res.isrRetention)}</div>

                                            {/* 18. BORRAR */}
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
                        <div className="bg-slate-900 border border-carbon-950/10 rounded-2xl p-20 text-center text-slate-500">
                            <TrendingUp className="mx-auto h-16 w-16 text-slate-500 mb-6" />
                            <h3 className="text-xl font-bold text-carbon-950 mb-2 tracking-tight">Tu calculadora está vacía</h3>
                            <p className="mb-8 text-slate-400">Agrega productos para visualizar tus precios estratégicos de plataforma.</p>
                            <button
                                onClick={addRow}
                                className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-carbon-950 px-6 py-3 rounded-2xl font-bold transition-all border border-carbon-950/10 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]"
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
                    background: rgba(22,137,95, 0.3);
                    border-radius: 10px;
                    border: 3px solid transparent;
                    background-clip: content-box;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(22,137,95, 0.5);
                    background-clip: content-box;
                }
            `}</style>
        </div>
    );
}
