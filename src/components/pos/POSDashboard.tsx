import { useState, useMemo } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { useCalculator } from '../../hooks/useCalculator'; 
import type { CartItem, POSPaymentMethod, OrderDestination, OpenTicket } from '../../types/pos';
import { Plus, Trash2, ShoppingCart, Minus, CreditCard, Save, History, Bike, Lock } from 'lucide-react';
import { POSTicket } from './POSTicket';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ProductRowData } from '../../types/calculator';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function POSDashboard() {
  const { addTransaction, openTickets, saveTicket, deleteOpenTicket, settings, updateSettings } = usePOS();
  const { rows, settings: calcGlobalSettings, categories, modifierGroups } = useCalculator();

  const [paymentMethod, setPaymentMethod] = useState<POSPaymentMethod>('Efectivo');
  const [orderDestination, setOrderDestination] = useState<OrderDestination>('Tienda');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);

  // Selection Modal State
  const [isModModalOpen, setIsModModalOpen] = useState(false);
  const [isTicketsModalOpen, setIsTicketsModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductRowData | null>(null);
  const [pendingModifiers, setPendingModifiers] = useState<CartItem['selectedModifiers']>([]);
  const [customerNote, setCustomerNote] = useState('');
  
  // Change Calculator State
  const [isChangeModalOpen, setIsChangeModalOpen] = useState(false);
  const [receivedAmount, setReceivedAmount] = useState<string>('');
  const [orderCustomerName, setOrderCustomerName] = useState(''); // Customer name for the whole order

  // Manual Discount State
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');

  // Security / PIN State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);

  const requirePin = (action: () => void) => {
    setPinAction(() => action);
    setPinInput('');
    setPinError(false);
    setIsPinModalOpen(true);
  };

  const handlePinSubmit = () => {
    const validPin = settings.adminPin || '1234';
    if (pinInput === validPin) {
        pinAction?.();
        setIsPinModalOpen(false);
    } else {
        setPinError(true);
        setPinInput('');
    }
  };

  // Print state
  const [lastOrder, setLastOrder] = useState<{
    items: CartItem[];
    total: number;
    paymentMethod: POSPaymentMethod;
    destination: OrderDestination;
    customerName: string;
    receivedAmount?: number;
    discountAmount?: number;
  } | null>(null);

  // Filtering products by category
  const filteredProducts = useMemo(() => {
    if (!activeCategoryId) return rows;
    return rows.filter(r => r.categoryId === activeCategoryId);
  }, [rows, activeCategoryId]);

  // Pricing Logic (Extended to include Modifiers)
  const computePlatformPrice = (row: ProductRowData, extraBaseCost: number) => {
    const targetProfit = (row.targetProfit && row.targetProfit > 0) ? row.targetProfit : (row.salePrice || 0);
    const finalTarget = targetProfit + extraBaseCost; // We want to receive the extra cost too
    if (finalTarget <= 0) return 0;
    
    const commissionPct = calcGlobalSettings.baseCommissionPct / 100;
    let low = 0;
    let high = finalTarget * 10;
    let P = 0;

    for (let i = 0; i < 50; i++) {
        P = (low + high) / 2;
        const T = P;
        const clientBase = T * (1 - ((row.discountPct || 0) / 100));
        const finalClientPrice = clientBase - (clientBase * ((row.subsidyPct || 0) / 100));
        
        const commission = finalClientPrice * commissionPct;
        const ivaComm = commission * 0.16;
        const baseGravable = finalClientPrice / 1.16;
        const ivaRet = baseGravable * (calcGlobalSettings.hasValidRFC ? 0.08 : 0.16);
        const isrRet = baseGravable * (calcGlobalSettings.hasValidRFC ? 0.025 : 0.20);
        
        const montoARecibir = finalClientPrice - (row.shippingCost || 0) - commission - ivaComm - ivaRet - isrRet;
        const diff = montoARecibir - finalTarget;

        if (diff > 0.0001) high = P;
        else if (diff < -0.0001) low = P;
        else break;
    }
    return P;
  };

  const getItemPrice = (rowId: string, mods: CartItem['selectedModifiers']) => {
    const row = rows.find(r => r.id === rowId);
    if (!row) return 0;

    const extraCost = mods.reduce((acc, g) => acc + g.modifiers.reduce((sum, m) => sum + m.extraPrice, 0), 0);

    if (orderDestination === 'Tienda') {
        return (row.salePrice || 0) + extraCost;
    } else {
        return computePlatformPrice(row, extraCost);
    }
  };

  const handleProductClick = (product: ProductRowData) => {
    setSelectedProduct(product);
    setPendingModifiers([]);
    setCustomerNote('');
    setIsModModalOpen(true);
  };

  const addToCart = (rowId: string, mods: CartItem['selectedModifiers'], note: string) => {
    const cartId = crypto.randomUUID();
    setCart(prev => [...prev, { cartId, rowId, quantity: 1, selectedModifiers: mods, customerNote: note }]);
    setIsModModalOpen(false);
  };

  const updateCartQuantity = (cartId: string, delta: number) => {
    setCart(prev => prev.map(item => {
        if (item.cartId === cartId) {
            const nextQ = item.quantity + delta;
            return nextQ > 0 ? { ...item, quantity: nextQ } : item;
        }
        return item;
    }));
  };

  const removeFromCart = (cartId: string) => {
    setCart(prev => prev.filter(i => i.cartId !== cartId));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((acc, item) => acc + (getItemPrice(item.rowId, item.selectedModifiers) * item.quantity), 0);
  }, [cart, paymentMethod]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percent') {
        return cartTotal * (discountInput / 100);
    } else {
        return discountInput;
    }
  }, [cartTotal, discountInput, discountType]);

  const finalTotal = useMemo(() => {
    return Math.max(0, cartTotal - discountAmount);
  }, [cartTotal, discountAmount]);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    
    // If it's cash, show calculator first
    if (paymentMethod === 'Efectivo' || paymentMethod === 'Didi Efectivo') {
        setReceivedAmount('');
        setIsChangeModalOpen(true);
        return;
    }

    processCheckout();
  };

  const processCheckout = () => {
    const detail = cart.map(item => {
        const row = rows.find(r => r.id === item.rowId);
        const mods = item.selectedModifiers.flatMap(g => g.modifiers.map(m => m.name)).join('+');
        const noteStr = item.customerNote ? ` [${item.customerNote}]` : '';
        return `${item.quantity}x ${row?.name}${mods ? ` (${mods})` : ''}${noteStr}`;
    }).join(', ');
    
    const customerName = orderCustomerName.trim() || cart.find(i => i.customerNote)?.customerNote || 'Venta Mostrador';
    
    // Include discount details in transactions table for reporting
    const discountStr = discountAmount > 0 
        ? ` (Desc: ${discountType === 'percent' ? `${discountInput}%` : `$${discountInput}`})` 
        : '';
    addTransaction(finalTotal, paymentMethod, orderDestination, detail + discountStr, customerName, undefined, [...cart], discountAmount);
    
    // Set for printing
    const isCash = paymentMethod === 'Efectivo' || paymentMethod === 'Didi Efectivo';
    setLastOrder({
        items: [...cart],
        total: finalTotal,
        paymentMethod,
        destination: orderDestination,
        customerName,
        receivedAmount: isCash && receivedAmount ? Number(receivedAmount) : undefined,
        discountAmount: discountAmount,
    });

    setCart([]);
    setOrderCustomerName('');
    setDiscountInput(0);

    // Trigger print dialog if any ticket is enabled
    if (settings.printCustomerTicket || settings.printKitchenTicket) {
        document.body.classList.add('printing-ticket');
        setTimeout(() => {
            window.print();
            document.body.classList.remove('printing-ticket');
        }, 300); // More time for React to render the new state
    }
  };

  const handleSaveTicket = () => {
      if (cart.length === 0) return;
      const customerName = orderCustomerName.trim() || cart.find(i => i.customerNote)?.customerNote || 'Sin Nombre';
      saveTicket(customerName, orderDestination, cart, finalTotal);
      setCart([]);
      setOrderCustomerName('');
      setDiscountInput(0);
  };

  const handleResumeTicket = (ticket: OpenTicket) => {
      setCart(ticket.items);
      setOrderDestination(ticket.destination);
      setOrderCustomerName(ticket.customerName === 'Sin Nombre' ? '' : ticket.customerName);
      deleteOpenTicket(ticket.id);
      setIsTicketsModalOpen(false);
  };

  return (
    <>
    <div className="space-y-6 no-print">
        {/* Category Filter Bar */}
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
            <button
                onClick={() => setActiveCategoryId(null)}
                className={cn(
                    "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                    activeCategoryId === null 
                        ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20" 
                        : "bg-slate-900 border-white/5 text-slate-400 hover:text-white"
                )}
            >TODOS</button>
            {categories.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={cn(
                        "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                        activeCategoryId === cat.id 
                            ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20" 
                            : "bg-slate-900 border-white/5 text-slate-400 hover:text-white"
                    )}
                >{cat.name.toUpperCase()}</button>
            ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Products Grid */}
            <div className="lg:col-span-8 bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <ShoppingCart size={20} className="text-indigo-400"/> Menú
                        </h2>
                        <div className="h-4 w-px bg-white/10 hidden sm:block"></div>
                        <div className="flex bg-slate-950 p-1 rounded-xl border border-white/10">
                            {(['Tienda', 'Uber', 'Didi', 'Rappi'] as OrderDestination[]).map(d => (
                                <button
                                    key={d}
                                    onClick={() => setOrderDestination(d)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center gap-1.5",
                                        orderDestination === d ? "bg-indigo-500 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
                                    )}
                                >
                                    {d === 'Tienda' ? <ShoppingCart size={12}/> : <Bike size={12}/>}
                                    {d.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <button 
                            onClick={() => setIsTicketsModalOpen(true)}
                            className="flex items-center gap-2 bg-slate-950 border border-white/5 h-10 px-4 rounded-xl text-slate-400 hover:text-white transition-all group shrink-0"
                        >
                            <History size={18} className="text-amber-500 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-black tracking-widest uppercase hidden sm:inline">Tickets Abiertos</span>
                            {openTickets.length > 0 && <span className="bg-amber-500 text-slate-950 w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px]">{openTickets.length}</span>}
                        </button>

                        <div className="flex items-center bg-slate-950/50 border border-white/5 rounded-xl h-10 px-3 gap-3">
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">Ticket</span>
                                <button 
                                    onClick={() => updateSettings({ printCustomerTicket: !settings.printCustomerTicket })}
                                    className={cn(
                                        "w-7 h-3.5 rounded-full transition-colors relative",
                                        settings.printCustomerTicket ? "bg-emerald-500" : "bg-slate-800"
                                    )}
                                >
                                    <div className={cn("absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform", settings.printCustomerTicket && "translate-x-3.5")} />
                                </button>
                            </div>
                            <div className="w-px h-3 bg-white/5" />
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[7px] font-bold text-slate-500 uppercase tracking-tighter">Cocina</span>
                                <button 
                                    onClick={() => updateSettings({ printKitchenTicket: !settings.printKitchenTicket })}
                                    className={cn(
                                        "w-7 h-3.5 rounded-full transition-colors relative",
                                        settings.printKitchenTicket ? "bg-amber-500" : "bg-slate-800"
                                    )}
                                >
                                    <div className={cn("absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform", settings.printKitchenTicket && "translate-x-3.5")} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-6 p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Método de Pago</div>
                    <div className="flex gap-2">
                        {(['Efectivo', 'Tarjeta', 'Uber', 'Didi', 'Rappi', 'Didi Efectivo'] as POSPaymentMethod[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setPaymentMethod(m)}
                                className={cn(
                                    "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all",
                                    paymentMethod === m ? "bg-white/10 text-white border border-white/20" : "text-slate-600 hover:text-slate-400"
                                )}
                            >{m.toUpperCase()}</button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.map(p => (
                        <button
                            key={p.id}
                            onClick={() => handleProductClick(p)}
                            className="bg-slate-800/40 border border-white/5 p-4 rounded-2xl text-left hover:border-indigo-500/50 hover:bg-slate-800/60 transition-all group relative overflow-hidden h-32 flex flex-col justify-between"
                        >
                            <div className="font-bold text-slate-200 group-hover:text-indigo-300 text-sm leading-tight line-clamp-2">{p.name}</div>
                            <div className="font-black text-white text-lg tracking-tighter">${getItemPrice(p.id, []).toFixed(2)}</div>
                            {(() => {
                                const hasMods = (p.modifierGroupIds && p.modifierGroupIds.length > 0) || 
                                    modifierGroups.some(g => p.categoryId && g.appliedToCategories?.includes(p.categoryId));
                                return hasMods && (
                                    <div className="absolute top-2 right-2 text-indigo-400 bg-indigo-500/10 p-1 rounded-md">
                                        <Plus size={12}/>
                                    </div>
                                );
                            })()}
                        </button>
                    ))}
                </div>
            </div>

            {/* Cart Section */}
            <div className="lg:col-span-4 flex flex-col gap-4">
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl flex-grow h-[550px] flex flex-col">
                    <h3 className="text-lg font-bold text-white mb-4">Orden Actual</h3>
                    <div className="flex-grow space-y-3 overflow-y-auto no-scrollbar pr-1">
                        {cart.length === 0 ? (
                            <div className="text-center py-20 text-slate-600">
                                <ShoppingCart size={48} className="mx-auto mb-4 opacity-10"/>
                                <p className="text-sm font-medium">El carrito está vacío</p>
                            </div>
                        ) : cart.map(item => {
                            const p = rows.find(r => r.id === item.rowId);
                            const unitPrice = getItemPrice(item.rowId, item.selectedModifiers);
                            return (
                                <div key={item.cartId} className="bg-slate-950/50 border border-white/5 p-3 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <div className="text-sm font-bold text-slate-200 leading-tight pr-2">{p?.name}</div>
                                            {item.customerNote && <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tight mt-0.5">{item.customerNote}</div>}
                                        </div>
                                        <div className="text-sm font-black text-white whitespace-nowrap">${(unitPrice * item.quantity).toFixed(2)}</div>
                                    </div>
                                    {item.selectedModifiers.map(g => (
                                        <div key={g.groupId} className="flex flex-wrap gap-1">
                                            {g.modifiers.map(m => (
                                                <span key={m.id} className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded italic">+{m.name}</span>
                                            ))}
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[10px] text-slate-600">${unitPrice.toFixed(2)} c/u</span>
                                        <div className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded-lg border border-white/5">
                                            <button onClick={() => requirePin(() => updateCartQuantity(item.cartId, -1))} className="text-slate-500 hover:text-white"><Minus size={14}/></button>
                                            <span className="text-xs font-black text-white w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateCartQuantity(item.cartId, 1)} className="text-slate-500 hover:text-white"><Plus size={14}/></button>
                                            <div className="w-px h-3 bg-white/10 mx-1"></div>
                                            <button onClick={() => requirePin(() => removeFromCart(item.cartId))} className="text-rose-500/50 hover:text-rose-400"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div className="pt-4 border-t border-white/10 mt-4 space-y-3">
                        {/* Customer Name Field - always visible */}
                        <div className="flex items-center gap-2 bg-slate-950/50 border border-white/5 rounded-xl px-3 py-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Cliente:</span>
                            <input
                                type="text"
                                value={orderCustomerName}
                                onChange={(e) => setOrderCustomerName(e.target.value)}
                                placeholder="Nombre del cliente (opcional)"
                                className="flex-grow bg-transparent text-white text-xs font-medium outline-none placeholder:text-slate-700"
                            />
                        </div>
                        {/* Discount Field - always visible */}
                        <div className="flex items-center gap-2 bg-slate-950/50 border border-white/5 rounded-xl px-3 py-1.5">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Descuento:</span>
                            <div className="flex items-center gap-2 flex-grow justify-end">
                                <input
                                    type="number"
                                    min="0"
                                    value={discountInput === 0 ? '' : discountInput}
                                    onChange={(e) => {
                                        const val = e.target.value === '' ? 0 : Number(e.target.value);
                                        setDiscountInput(val);
                                    }}
                                    placeholder="0"
                                    className="w-16 bg-transparent text-white text-xs font-bold outline-none placeholder:text-slate-700 text-right"
                                />
                                <div className="flex bg-slate-900 rounded-lg p-0.5 border border-white/10 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setDiscountType('amount')}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black transition-all",
                                            discountType === 'amount' ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        $
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDiscountType('percent')}
                                        className={cn(
                                            "px-2 py-0.5 rounded text-[10px] font-black transition-all",
                                            discountType === 'percent' ? "bg-indigo-500 text-white" : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        %
                                    </button>
                                </div>
                            </div>
                        </div>
                        {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
                                <span>Subtotal</span>
                                <span>${cartTotal.toFixed(2)}</span>
                            </div>
                        )}
                        {discountAmount > 0 && (
                            <div className="flex justify-between items-center text-xs font-bold text-emerald-500 px-1">
                                <span>Descuento</span>
                                <span>-${discountAmount.toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between items-end mb-2 pt-1 px-1">
                            <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Total Cobrar</span>
                            <span className="text-3xl font-black text-white tracking-tighter">${finalTotal.toFixed(2)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                disabled={cart.length === 0}
                                onClick={handleSaveTicket}
                                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-700 text-slate-300 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <Save size={18}/> GUARDAR
                            </button>
                            <button 
                                disabled={cart.length === 0}
                                onClick={handleCheckout}
                                className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-500/10 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CreditCard size={20}/> FINALIZAR
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    </div>

    {/* Modifier Selection Modal */}
    {isModModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-white/10">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Personalizar</h4>
                    <h3 className="text-xl font-bold text-white">{selectedProduct.name}</h3>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] no-scrollbar">
                    {(() => {
                        const activeGroups = modifierGroups.filter(g => 
                            selectedProduct.modifierGroupIds?.includes(g.id) ||
                            (selectedProduct.categoryId && g.appliedToCategories?.includes(selectedProduct.categoryId))
                        );
                        return activeGroups.map(group => {
                            const gid = group.id;
                            const selection = pendingModifiers.find(pm => pm.groupId === gid)?.modifiers || [];

                            return (
                                <div key={gid} className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h5 className="font-bold text-slate-200 text-sm">{group.name}</h5>
                                        <span className="text-[10px] bg-slate-950 text-slate-500 px-2 py-0.5 rounded-full border border-white/5 uppercase font-black">
                                            {group.selectionType === 'single' ? 'Unica' : 'Múltiple'}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {group.options.map(opt => {
                                            const isSelected = selection.some(m => m.id === opt.id);
                                            return (
                                                <button
                                                    key={opt.id}
                                                    onClick={() => {
                                                        const nextMods = group.selectionType === 'single' 
                                                            ? [opt] 
                                                            : isSelected ? selection.filter(m => m.id !== opt.id) : [...selection, opt];
                                                        
                                                        setPendingModifiers(prev => {
                                                            const filtered = prev.filter(pm => pm.groupId !== gid);
                                                            return [...filtered, { groupId: gid, modifiers: nextMods }];
                                                        });
                                                    }}
                                                    className={cn(
                                                        "p-3 rounded-2xl border text-left transition-all",
                                                        isSelected 
                                                            ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20" 
                                                            : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                                                    )}
                                                >
                                                    <div className="text-xs font-bold leading-tight">{opt.name}</div>
                                                    {opt.extraPrice > 0 && <div className={cn("text-[10px] font-bold mt-1", isSelected ? "text-indigo-200" : "text-emerald-500")}>+${opt.extraPrice}</div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        });
                    })()}

                    <div className="pt-4 border-t border-white/5 space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Nombre del Cliente / Notas</label>
                         <input 
                            type="text"
                            placeholder="Ej. Juan Pérez - Sin cebolla"
                            value={customerNote}
                            onChange={(e) => setCustomerNote(e.target.value)}
                            className="w-full bg-slate-950 border border-white/5 rounded-xl px-4 py-3 text-sm text-white font-medium focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-700"
                         />
                    </div>
                </div>

                <div className="p-6 bg-slate-800/10 border-t border-white/10 flex gap-4">
                    <button onClick={() => setIsModModalOpen(false)} className="flex-grow py-4 rounded-2xl font-bold text-slate-500 hover:text-white transition-all">CANCELAR</button>
                    <button 
                        onClick={() => addToCart(selectedProduct.id, pendingModifiers, customerNote)}
                        className="flex-[2] bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-500/20 transition-all active:scale-95"
                    >AGREGAR A LA ORDEN</button>
                </div>
            </div>
        </div>
    )}

    {/* --- CHANGE CALCULATOR MODAL --- */}
    {isChangeModalOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-white/10">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Calculadora de Cambio</h4>
                    <h3 className="text-xl font-bold text-white">Pago en {paymentMethod.toUpperCase()}</h3>
                </div>

                <div className="p-8 space-y-8">
                    <div className="flex justify-between items-baseline">
                        <span className="text-sm font-bold text-slate-500">Total a Cobrar:</span>
                        <span className="text-3xl font-black text-white">${finalTotal.toFixed(2)}</span>
                    </div>

                    <div className="space-y-4">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Monto Recibido</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-600">$</span>
                            <input 
                                type="number"
                                autoFocus
                                value={receivedAmount}
                                onChange={(e) => setReceivedAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-slate-950 border-2 border-white/10 rounded-2xl pl-10 pr-6 py-5 text-3xl font-black text-white outline-none focus:border-indigo-500 transition-all placeholder:text-slate-900"
                            />
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                            {[20, 50, 100, 200, 500].map(bill => (
                                <button 
                                    key={bill}
                                    onClick={() => setReceivedAmount(bill.toString())}
                                    className="py-3 rounded-xl bg-slate-800 border border-white/5 text-sm font-black text-slate-300 hover:bg-slate-700 hover:text-white transition-all"
                                >
                                    ${bill}
                                </button>
                            ))}
                            <button 
                                onClick={() => setReceivedAmount(finalTotal.toFixed(2))}
                                className="col-span-3 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-black text-indigo-400 hover:bg-indigo-500/20 transition-all"
                            >
                                EXACTO (${finalTotal.toFixed(2)})
                            </button>
                        </div>
                    </div>

                    {Number(receivedAmount) >= finalTotal && (
                        <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                            <span className="text-xs font-bold text-emerald-500/80 uppercase">Cambio a entregar:</span>
                            <span className="text-3xl font-black text-emerald-400">${(Number(receivedAmount) - finalTotal).toFixed(2)}</span>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-slate-800/10 border-t border-white/10 flex gap-4">
                    <button onClick={() => setIsChangeModalOpen(false)} className="flex-grow py-4 rounded-2xl font-bold text-slate-500 hover:text-white transition-all">CANCELAR</button>
                    <button 
                        disabled={!receivedAmount || Number(receivedAmount) < finalTotal}
                        onClick={() => {
                            setIsChangeModalOpen(false);
                            processCheckout();
                        }}
                        className="flex-[2] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:bg-slate-800 text-slate-950 font-black py-4 rounded-2xl shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                    >FINALIZAR Y COBRAR</button>
                </div>
            </div>
        </div>
    )}

    {/* --- PIN SECURITY MODAL --- */}
    {isPinModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-white/10 text-center">
                    <div className="w-12 h-12 bg-pink-500/20 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-white">Autorización Requerida</h3>
                    <p className="text-slate-400 text-xs mt-2">Ingresa el PIN de administrador para continuar.</p>
                </div>
                <div className="p-6">
                    <input 
                        type="password"
                        autoFocus
                        value={pinInput}
                        onChange={(e) => setPinInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handlePinSubmit()}
                        placeholder="••••"
                        className={cn(
                            "w-full bg-slate-950 border-2 rounded-2xl text-center text-4xl tracking-[0.5em] font-black text-white py-4 outline-none transition-all",
                            pinError ? "border-rose-500 text-rose-500" : "border-white/10 focus:border-indigo-500"
                        )}
                    />
                    {pinError && <div className="text-rose-500 text-xs font-bold text-center mt-3 animate-pulse">PIN INCORRECTO</div>}
                    
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <button onClick={() => setIsPinModalOpen(false)} className="py-3 rounded-xl font-bold text-slate-500 hover:text-white transition-all bg-slate-800/50">CANCELAR</button>
                        <button onClick={handlePinSubmit} className="py-3 rounded-xl font-black text-white bg-pink-500 hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95">AUTORIZAR</button>
                    </div>
                </div>
            </div>
        </div>
    )}

    {/* --- TICKETS ABIERTOS MODAL --- */}
    {isTicketsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Pendientes</h4>
                        <h3 className="text-xl font-bold text-white">Tickets Abiertos</h3>
                    </div>
                    <button onClick={() => setIsTicketsModalOpen(false)} className="text-slate-500 hover:text-white">CERRAR</button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh] no-scrollbar">
                    {openTickets.length === 0 ? (
                        <div className="text-center py-20 text-slate-600">
                            <History size={48} className="mx-auto mb-4 opacity-5"/>
                            <p className="text-sm font-medium">No hay tickets guardados</p>
                        </div>
                    ) : (
                        openTickets.map(ticket => (
                            <div key={ticket.id} className="bg-slate-950/50 border border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-white/10 transition-all">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-black border border-indigo-500/20">{ticket.destination.toUpperCase()}</span>
                                        <span className="text-sm font-bold text-white">{ticket.customerName}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">
                                        Creado: {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {ticket.items.length} artículos
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-lg font-black text-white">${ticket.total.toFixed(2)}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => requirePin(() => deleteOpenTicket(ticket.id))}
                                            className="p-2 text-slate-700 hover:text-rose-500 transition-colors"
                                        >
                                            <Trash2 size={18}/>
                                        </button>
                                        <button 
                                            onClick={() => handleResumeTicket(ticket)}
                                            className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-xl text-xs font-black transition-all"
                                        >
                                            REANUDAR
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )}

    {/* --- HIDDEN TICKETS FOR PRINTING --- */}
    {lastOrder && (
        <div className={cn("print-only-ticket", settings.paperSize === 'Standard' ? 'paper-standard' : 'paper-58mm')}>
            {/* Customer Ticket */}
            {settings.printCustomerTicket && (
                <POSTicket 
                    items={lastOrder.items}
                    total={lastOrder.total}
                    paymentMethod={lastOrder.paymentMethod}
                    destination={lastOrder.destination}
                    customerName={lastOrder.customerName}
                    paperSize={settings.paperSize}
                    receivedAmount={lastOrder.receivedAmount}
                    businessName={settings.businessName}
                    businessPhone={settings.businessPhone}
                    businessAddress={settings.businessAddress}
                />
            )}
            
            {/* Separator for thermal paper if both are printed */}
            {settings.printCustomerTicket && settings.printKitchenTicket && settings.paperSize === '58mm' && (
                <div className="h-10 border-b border-black border-dashed mb-10" />
            )}

            {/* Kitchen Ticket (No prices) */}
            {settings.printKitchenTicket && (
                <POSTicket 
                    items={lastOrder.items}
                    total={lastOrder.total}
                    paymentMethod={lastOrder.paymentMethod}
                    destination={lastOrder.destination}
                    customerName={lastOrder.customerName}
                    isKitchen={true}
                    paperSize={settings.paperSize}
                    businessName={settings.businessName}
                />
            )}
        </div>
    )}
    </>
  );
}
