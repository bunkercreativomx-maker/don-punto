import { groupByCategory, productGroups, productHasGroup, productColor, toggleProductGroup, PRODUCT_COLORS, DAY_NAMES, DAY_ORDER, daysLabel, hasDayLimit, soldToday } from '../../lib/productMods';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { usePOS } from '../../hooks/usePOS';
import { useCalculator } from '../../hooks/useCalculator'; 
import type { CartItem, POSPaymentMethod, OrderDestination, OpenTicket, ServiceType, OrderTypeInfo, ReopenInfo } from '../../types/pos';
import { orderTypeLines, orderTypeLabel, pickOrderType } from '../../lib/orderType';
import { Plus, Trash2, ShoppingCart, Minus, CreditCard, Save, History, Bike, Lock, Search, X, CheckCircle, Gift, UserPlus, AlertTriangle, Check, MoreVertical, ChevronDown, Palette, SlidersHorizontal, ChevronRight, Printer, ChefHat, Minimize2, Maximize2, Menu as MenuIcon } from 'lucide-react';
import { isPro, authorizeWithPin, useSession, lockSession, tipWaiters, requiresCashierLogin } from '../../lib/session';
import { getClients, addClient, recordVisit, rewardReady, rewardDiscount, getLoyalty, type Client } from '../../lib/clients';
import { applySaleToInventory, type StockAlert } from '../../lib/inventoryAuto';
import { apiPost } from '../../lib/api';
import { POSTicket } from './POSTicket';
import { CashShiftBar } from './CashShiftBar';
import { getOpenShift, useCashShift, requestOpenShift } from '../../lib/cashShift';
import { PrintArea } from '../print/PrintArea';
import { runPrint } from '../../lib/print';
import { fetchUnseenItems, getActiveBranch } from '../../lib/cloudStore';
import { salePayments, equalParts } from '../../lib/payments';
import type { PaymentPart } from '../../types/pos';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ProductRowData } from '../../types/calculator';
import { rowsForBranch } from '../../lib/branchMenu';
import { money } from '../../lib/format';
import { useQuickPos, setQuickPos } from '../../lib/quickPos';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}


const PAY_COLOR: Record<string, string> = {
    'Efectivo': '#15803d',
    'Tarjeta': '#1d4ed8',
    'Transferencia': '#7e22ce',
    'Didi': '#ea580c',
    'Didi Efectivo': '#a16207',
    'Uber': '#111827',
    'Rappi': '#e11d48',
};
export interface POSMenuOps {
  rows: ProductRowData[];
  settings: ReturnType<typeof useCalculator>['settings'];
  categories: ReturnType<typeof useCalculator>['categories'];
  modifierGroups: ReturnType<typeof useCalculator>['modifierGroups'];
  addProducts: (p: ProductRowData[]) => void;
  removeRow: (id: string) => void;
  updateRow?: (id: string, updates: Partial<ProductRowData>) => void;
  moveProduct?: (id: string, targetId: string) => void;
}

export function POSDashboard({ menu }: { menu?: POSMenuOps } = {}) {
  const { addTransaction, openTickets, saveTicket, deleteOpenTicket, refreshOpenTickets, settings, updateSettings, transactions } = usePOS();
  // Cuentas abiertas de otros dispositivos (meseros, otra caja): cada 10 s con la pantalla visible y al volver a ella
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') void refreshOpenTickets(); };
    tick();
    const t = setInterval(tick, 10000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useCashShift(); // re-render al abrir/cerrar turno
  // El menú viene de App (misma fuente que Catálogo) para que agregar/borrar aquí no lo pise otra pantalla
  const ownCalc = useCalculator([], { persist: !menu });
  const { rows: allRows, settings: calcGlobalSettings, categories, modifierGroups } = menu || ownCalc;
  // Solo los productos que se venden en ESTA sucursal, con su precio propio si lo tiene
  const rows = useMemo(() => rowsForBranch(allRows, getActiveBranch()), [allRows]);

  const [paymentMethod, setPaymentMethod] = useState<POSPaymentMethod>('Efectivo');
  const [orderDestination, setOrderDestination] = useState<OrderDestination>('Tienda');
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  // «Modo caja rápida» (opción por equipo, solo ≥768 px)
  const quick = useQuickPos();
  const [quickSearch, setQuickSearch] = useState(false);
  const [quickMenu, setQuickMenu] = useState(false);
  const [quickMore, setQuickMore] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);
  const [quickH, setQuickH] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!quick) return;
    // Alto = lo que queda de la ventana: todo en una pantalla, sin scroll de la página
    const fit = () => { const el = quickRef.current; if (!el) return; const top = el.getBoundingClientRect().top + (el.closest('.overflow-auto')?.scrollTop || 0); setQuickH(Math.max(420, Math.floor(window.innerHeight - top))); };
    fit(); const t = setTimeout(fit, 300);
    window.addEventListener('resize', fit);
    return () => { clearTimeout(t); window.removeEventListener('resize', fit); };
  }, [quick]);

  // Synchronize payment method based on order destination
  useEffect(() => {
    if (orderDestination === 'Tienda') {
      if (paymentMethod !== 'Efectivo' && paymentMethod !== 'Tarjeta') {
        setPaymentMethod('Efectivo');
      }
    } else if (orderDestination === 'Uber') {
      if (paymentMethod !== 'Uber') {
        setPaymentMethod('Uber');
      }
    } else if (orderDestination === 'Didi') {
      if (paymentMethod !== 'Didi' && paymentMethod !== 'Didi Efectivo') {
        setPaymentMethod('Didi');
      }
    } else if (orderDestination === 'Rappi') {
      if (paymentMethod !== 'Rappi') {
        setPaymentMethod('Rappi');
      }
    }
  }, [orderDestination, paymentMethod]);

  const availablePaymentMethods = useMemo(() => {
    switch (orderDestination) {
      case 'Tienda':
        return ['Efectivo', 'Tarjeta'] as POSPaymentMethod[];
      case 'Uber':
        return ['Uber'] as POSPaymentMethod[];
      case 'Didi':
        return ['Didi', 'Didi Efectivo'] as POSPaymentMethod[];
      case 'Rappi':
        return ['Rappi'] as POSPaymentMethod[];
      default:
        return ['Efectivo', 'Tarjeta'] as POSPaymentMethod[];
    }
  }, [orderDestination]);
  
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
  // Tipo de orden: en tienda comer aquí / para llevar (+ mesa); en DiDi el número de pedido; Uber/Rappi el nombre
  const [service, setService] = useState<ServiceType | ''>('');
  const [table, setTable] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [orderError, setOrderError] = useState('');
  // Celular/tablet: botón flotante "Ver orden" cuando la orden (arriba) ya no se ve
  const cartRef = useRef<HTMLDivElement>(null);
  const [cartVisible, setCartVisible] = useState(true);
  useEffect(() => {
    const el = cartRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setCartVisible(e.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Si la cuenta viene de reabrir una venta, se arrastra el monto original para el corte (antes → después)
  const [reopened, setReopened] = useState<ReopenInfo | null>(null);
  const orderType: OrderTypeInfo = pickOrderType({ service: orderDestination === 'Tienda' ? (service || undefined) : undefined, table: orderDestination === 'Tienda' && service === 'aqui' ? table : undefined, orderRef: orderDestination === 'Didi' ? orderRef : undefined, reopenedFrom: reopened || undefined });
  /** Qué falta para poder cobrar o guardar la orden */
  const missingOrderInfo = (): string => {
    if (orderDestination === 'Tienda' && !service) return 'Elige si es para COMER AQUÍ o PARA LLEVAR.';
    if (orderDestination === 'Didi' && !orderRef.trim().replace(/^#+/, '')) return 'Escribe el número de pedido de DiDi (ej. 12).';
    if ((orderDestination === 'Uber' || orderDestination === 'Rappi') && !orderCustomerName.trim()) return `Escribe el nombre del cliente de ${orderDestination}.`;
    return '';
  };
  /** Mesa ya ocupada por otra cuenta abierta (misma sucursal). "03" = "3", sin importar mayúsculas */
  const tableKey = (t?: string) => (t || '').trim().toUpperCase().replace(/^0+(?=.)/, '');
  const busyTicket = (list: OpenTicket[], t?: string): OpenTicket | undefined => {
    const k = tableKey(t);
    if (!k) return undefined;
    return list.find((x) => (x.destination || 'Tienda') === 'Tienda' && x.service === 'aqui' && tableKey(x.table) === k);
  };
  const busyMsg = (tk: OpenTicket) => `La MESA ${tableKey(tk.table)} ya tiene una cuenta abierta${tk.waiterName ? ` (${tk.waiterName})` : ''}. Agrégale desde TICKETS (Reanudar) o cambia el número de mesa.`;
  const localBusy = orderType.table ? busyTicket(openTickets, orderType.table) : undefined;
  const [checkingTable, setCheckingTable] = useState(false);
  const resetOrderType = () => { setService(''); setTable(''); setOrderRef(''); setOrderError(''); setReopened(null); };
  useEffect(() => { setOrderError(''); }, [orderDestination, service, orderRef, orderCustomerName, table]);
  // Clientes frecuentes (Pro)
  const pro = isPro();
  const [clients, setClients] = useState<Client[]>(() => (isPro() ? getClients() : []));
  const [clientId, setClientId] = useState<string | null>(null);
  const [rewardOn, setRewardOn] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [stockAlerts, setStockAlerts] = useState<StockAlert[]>([]);
  const loyalty = useMemo(() => getLoyalty(), []);
  const selectedClient = clients.find((c) => c.id === clientId) || null;
  const suggestions = useMemo(() => {
    const t = orderCustomerName.trim().toLowerCase();
    if (!pro || t.length < 2 || clientId) return [];
    const digits = t.replace(/\D/g, '');
    return clients.filter((c) => c.name.toLowerCase().includes(t) || (digits.length >= 3 && (c.phone || '').includes(digits))).slice(0, 5);
  }, [orderCustomerName, clients, clientId, pro]);

  // Propina, personas y cortesía
  const [tipInput, setTipInput] = useState<string>('');
  const [guests, setGuests] = useState<string>('');
  const [courtesy, setCourtesy] = useState(false);

  // Manual Discount State
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');

  // Security / PIN State
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);
  const [pinAction, setPinAction] = useState<(() => void) | null>(null);
  // Mesero: solo toma órdenes. Y si se reanuda una cuenta, la venta sigue a nombre de quien la tomó.
  const { operator } = useSession();
  const waiterMode = operator?.role === 'mesero';
  // Solo dueño o gerente identificados pueden agregar/borrar productos desde el punto de venta
  const canEditMenu = !!menu && (operator?.role === 'dueno' || operator?.role === 'gerente');
  const [newProd, setNewProd] = useState<{ name: string; price: string; categoryId: string; mods: string[]; off: string[]; color: string } | null>(null);
  const [colorFor, setColorFor] = useState<ProductRowData | null>(null);
  const isOwner = operator?.role === 'dueno';
  const deleteProduct = (p: ProductRowData) => {
    if (!menu || !canEditMenu) return;
    if (!window.confirm(`¿Eliminar "${p.name}" del menú?\n\nSe quita del punto de venta, de tu Menú y de tu tienda en línea. Las ventas que ya hiciste no se borran.`)) return;
    menu.removeRow(p.id);
    showToast(`Se eliminó "${p.name}"`);
  };
  const saveNewProduct = () => {
    if (!menu || !canEditMenu || !newProd) return;
    const name = newProd.name.trim();
    const price = Math.round((parseFloat(newProd.price.replace(',', '.')) || 0) * 100) / 100;
    if (!name) { showToast('Escribe el nombre del producto'); return; }
    if (allRows.some(r => r.name.trim().toLowerCase() === name.toLowerCase())) { showToast('Ya existe un producto con ese nombre'); return; }
    menu.addProducts([{ id: crypto.randomUUID(), name, costPrice: 0, salePrice: price, categoryId: newProd.categoryId || undefined, color: newProd.color || undefined,
      modifierGroupIds: newProd.mods.filter(id => { const g = modifierGroups.find(x => x.id === id); return g && !groupByCategory({ categoryId: newProd.categoryId }, g); }),
      modifierGroupOff: newProd.off.filter(id => { const g = modifierGroups.find(x => x.id === id); return g && groupByCategory({ categoryId: newProd.categoryId }, g); }) }]);
    setNewProd(null);
    showToast(`Se agregó "${name}"`);
  };
  const [resumedWaiter, setResumedWaiter] = useState<{ id: string; name: string } | null>(null);
  // Meseros que la caja puede elegir (incluye "solo propinas"); si la cuenta trae un mesero que ya no está en la lista, se conserva
  const waiterOptions: { id: string; name: string }[] = (() => {
    const list = tipWaiters().map((e) => ({ id: e.id, name: e.name }));
    return resumedWaiter && !list.some((w) => w.id === resumedWaiter.id) ? [resumedWaiter, ...list] : list;
  })();

  const requirePin = (action: () => void) => {
    setPinAction(() => action);
    setPinInput('');
    setPinError(false);
    setIsPinModalOpen(true);
  };

  const handlePinSubmit = () => {
    // Dueño o gerente pueden autorizar; un cajero no
    if (authorizeWithPin(pinInput, settings.adminPin)) {
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
    kitchenOnly?: boolean;
    waiterName?: string;
    tip?: number;
    orderLines?: string[];
    payments?: PaymentPart[];
    splitWays?: number;
    } | null>(null);
  // Dividir cuenta / pago mixto
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTab, setSplitTab] = useState<'mixto' | 'iguales' | 'platillos'>('mixto');
  const [mixCash, setMixCash] = useState('');
  const [mixFirst, setMixFirst] = useState<POSPaymentMethod>('Efectivo');
  const [ways, setWays] = useState(2);
  const [wayMethods, setWayMethods] = useState<POSPaymentMethod[]>([]);
  const [pickQty, setPickQty] = useState<Record<string, number>>({});
  const [splitError, setSplitError] = useState('');
  /** Lo que falta por cobrar cuando se cobra por platillos (la parte cobrada ya salió del carrito) */
  const [splitRest, setSplitRest] = useState<{ items: CartItem[]; customerName: string; service: ServiceType | ''; table: string; orderRef: string; waiter: { id: string; name: string } | null; guests: string; destination: OrderDestination; paidParts: number; reopened?: ReopenInfo | null } | null>(null);

  // Search query state
  const [searchQuery, setSearchQuery] = useState('');

  // Toast notification state
  const [toast, setToast] = useState('');
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 1800);
  };

  // Count products per category for badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    rows.forEach(r => { if (r.categoryId) counts[r.categoryId] = (counts[r.categoryId] || 0) + 1; });
    return counts;
  }, [rows]);

  // Al abrir el POS arranca en la primera categoría que tenga productos (no en «Todos», que revuelve todo el menú)
  const catInit = useRef(false);
  useEffect(() => {
    if (catInit.current || categories.length === 0 || rows.length === 0) return;
    catInit.current = true;
    const first = categories.find(c => categoryCounts[c.id]);
    if (first) setActiveCategoryId(first.id);
  }, [categories, rows.length, categoryCounts]);
  // Si borran la categoría elegida, regresa a la primera
  useEffect(() => {
    if (activeCategoryId && categories.length && !categories.some(c => c.id === activeCategoryId)) {
      setActiveCategoryId(categories.find(c => categoryCounts[c.id])?.id ?? null);
    }
  }, [categories, activeCategoryId, categoryCounts]);

  // Filtering products by category + search (la búsqueda siempre busca en todo el menú)
  const filteredProducts = useMemo(() => {
    let result = !activeCategoryId || searchQuery.trim() ? rows : rows.filter(r => r.categoryId === activeCategoryId);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(q));
    }
    return result;
  }, [rows, activeCategoryId, searchQuery]);

  // Reacomodar productos (solo dueño/gerente, sin búsqueda): con mouse se arrastra directo;
  // con el dedo se mantiene presionado ~0.4 s (así no estorba el scroll normal) y se arrastra.
  const canReorder = canEditMenu && !!menu?.moveProduct && !searchQuery.trim();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const dragActive = useRef(false);
  // El bloqueo del scroll con el dedo debe estar puesto ANTES de tocar (si se agrega al tocar,
  // el navegador ya decidió hacer scroll y cancela el arrastre)
  const blockTouch = useRef((ev: TouchEvent) => { if (dragActive.current) ev.preventDefault(); }).current;
  const setGridRef = useCallback((el: HTMLDivElement | null) => {
    gridRef.current?.removeEventListener('touchmove', blockTouch);
    gridRef.current = el;
    el?.addEventListener('touchmove', blockTouch, { passive: false });
  }, [blockTouch]);
  const [dragProdId, setDragProdId] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const moveProdRef = useRef(menu?.moveProduct);
  moveProdRef.current = menu?.moveProduct;
  const onCardPointerDown = (e: React.PointerEvent, p: ProductRowData) => {
    if (!canReorder) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    const touch = e.pointerType !== 'mouse';
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    let moved = false;
    const start = () => { started = true; dragActive.current = true; setDragProdId(p.id); if (touch) navigator.vibrate?.(30); };
    const timer = touch ? window.setTimeout(start, 400) : 0;
    // Los listeners van en window: React mueve la tarjeta en el DOM al reordenar
    const onMove = (ev: PointerEvent) => {
      const far = Math.abs(ev.clientX - sx) > 8 || Math.abs(ev.clientY - sy) > 8;
      if (!started) {
        if (!far) return;
        if (touch) { cleanup(); return; } // el dedo se movió antes de tiempo = scroll normal
        start();
      }
      ev.preventDefault();
      const cards = Array.from(gridRef.current?.querySelectorAll<HTMLElement>('[data-prod-card]') || []);
      const over = cards.find((c) => {
        const b = c.getBoundingClientRect();
        return ev.clientX >= b.left && ev.clientX <= b.right && ev.clientY >= b.top && ev.clientY <= b.bottom;
      });
      const target = over?.dataset.prodCard;
      if (target && target !== p.id) { moveProdRef.current?.(p.id, target); moved = true; }
      if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
      else if (ev.clientY < 70) window.scrollBy(0, -14);
    };
    const cleanup = () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
      dragActive.current = false;
      if (started) {
        // El clic que llega al soltar no debe agregar el producto a la orden
        suppressClick.current = true;
        window.setTimeout(() => { suppressClick.current = false; }, 400);
        setDragProdId(null);
        if (moved) showToast('Orden del menú guardado');
      }
    };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
  };

  // Pricing Logic (Extended to include Modifiers)
  const computePlatformPrice = (row: ProductRowData, extraBaseCost: number) => {
    const targetProfit = (row.targetProfit && row.targetProfit > 0) ? row.targetProfit : (row.salePrice || 0);
    const finalTarget = targetProfit + extraBaseCost;
    if (finalTarget <= 0) return 0;
    
    const commissionPct = calcGlobalSettings.baseCommissionPct / 100;
    let low = 0;
    let high = finalTarget * 10;
    let P = 0;

    for (let i = 0; i < 50; i++) {
        P = (low + high) / 2;
        const T = P;
        const clientBase = T * (1 - ((row.discountPct || 0) / 100));
        // Find P WITHOUT subsidy (subsidy only benefits monto, not price)
        const baseForCalc = clientBase;
        
        const commission = baseForCalc * commissionPct;
        const ivaRate = calcGlobalSettings.ivaRate ?? 0.16;
        const ivaComm = commission * ivaRate;
        const baseGravable = baseForCalc / (1 + ivaRate);
        const ivaRet = baseGravable * (calcGlobalSettings.hasValidRFC ? 0.08 : 0.16);
        const isrRet = baseGravable * (calcGlobalSettings.hasValidRFC ? 0.025 : 0.20);
        
        const montoARecibir = baseForCalc - (row.shippingCost || 0) - commission - ivaComm - ivaRet - isrRet;
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
    } else if (orderDestination === 'Didi' && row.didiPrice && row.didiPrice > 0) {
        return row.didiPrice + extraCost;
    } else if (orderDestination === 'Uber' && row.uberPrice && row.uberPrice > 0) {
        return row.uberPrice + extraCost;
    } else if (orderDestination === 'Rappi' && row.rappiPrice && row.rappiPrice > 0) {
        return row.rappiPrice + extraCost;
    } else {
        return computePlatformPrice(row, extraCost);
    }
  };

  /** Sin turno abierto no se vende: el cajero lo abre ahí mismo; el mesero pide que lo abran */
  const needsShift = () => {
    if (getOpenShift()) return false;
    if (waiterMode) showToast('La caja no tiene turno abierto. Pide al cajero que lo abra.');
    else requestOpenShift();
    return true;
  };

  const handleProductClick = (product: ProductRowData) => {
    if (needsShift()) return;
    if (!soldToday(product.days, new Date().getDay()) && !window.confirm(`"${product.name}" es ${daysLabel(product.days).toLowerCase()}. ¿Venderlo de todos modos?`)) return;
    setSelectedProduct(product);
    setPendingModifiers([]);
    setCustomerNote('');
    setIsModModalOpen(true);
  };

  const addToCart = (rowId: string, mods: CartItem['selectedModifiers'], note: string) => {
    const cartId = crypto.randomUUID();
    setCart(prev => [...prev, { cartId, rowId, quantity: 1, selectedModifiers: mods, customerNote: note }]);
    setIsModModalOpen(false);
    const product = rows.find(r => r.id === rowId);
    showToast(`${product?.name ?? 'Producto'} agregado`);
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
    if (courtesy) return cartTotal;
    if (rewardOn && selectedClient) return rewardDiscount(cartTotal, loyalty);
    if (discountType === 'percent') {
        return cartTotal * (discountInput / 100);
    } else {
        return discountInput;
    }
  }, [cartTotal, discountInput, discountType, rewardOn, selectedClient, loyalty, courtesy]);

  const finalTotal = useMemo(() => {
    return Math.max(0, cartTotal - discountAmount);
  }, [cartTotal, discountAmount]);
  // La propina solo aplica en tienda y no forma parte de la venta
  const tipAmount = orderDestination === 'Tienda' && !courtesy ? Math.max(0, Number(tipInput) || 0) : 0;
  const chargeTotal = finalTotal + tipAmount;
  /** Si el negocio tiene meseros, no deja cobrar sin elegir mesero cuando hay propina o es para comer aquí (para que nadie se quede sin su propina) */
  const WAITER_MSG = 'Elige el MESERO que atendió: hay propina o es para comer aquí y su propina debe quedar a su nombre.';
  useEffect(() => { setOrderError((e) => (e === WAITER_MSG ? '' : e)); }, [resumedWaiter, tipInput]);
  const missingWaiter = (): string =>
    orderDestination === 'Tienda' && waiterOptions.length > 0 && !resumedWaiter && (tipAmount > 0 || service === 'aqui') ? WAITER_MSG : '';

  const handleCheckout = () => {
    if (waiterMode) return; // el mesero no cobra
    if (cart.length === 0) return;
    if (needsShift()) return;
    const miss = missingOrderInfo();
    if (miss) { setOrderError(miss); return; }
    if (localBusy) { setOrderError(busyMsg(localBusy)); return; }
    const noWaiter = missingWaiter();
    if (noWaiter) { setOrderError(noWaiter); document.getElementById('pos-waiter')?.focus(); return; }
    
    // If it's cash, show calculator first
    if (paymentMethod === 'Efectivo' || paymentMethod === 'Didi Efectivo') {
        setReceivedAmount('');
        setIsChangeModalOpen(true);
        return;
    }

    processCheckout();
  };

  const processCheckout = (split?: { payments: PaymentPart[]; primary: POSPaymentMethod; splitWays?: number }) => {
    const method = split ? split.primary : paymentMethod;
    const detail = cart.map(item => {
        const row = rows.find(r => r.id === item.rowId);
        const mods = item.selectedModifiers.flatMap(g => g.modifiers.map(m => m.name)).join('+');
        const noteStr = item.customerNote ? ` [${item.customerNote}]` : '';
        return `${item.quantity}x ${row?.name}${mods ? ` (${mods})` : ''}${noteStr}`;
    }).join(', ');
    
    const customerName = orderCustomerName.trim() || (orderDestination === 'Tienda' ? 'Venta Mostrador' : orderDestination === 'Didi' ? `Pedido DiDi #${orderType.orderRef}` : `Pedido ${orderDestination}`);
    
    // Include discount details in transactions table for reporting
    const discountStr = discountAmount > 0 
        ? ` (Desc: ${discountType === 'percent' ? `${discountInput}%` : `$${discountInput}`})` 
        : '';
    const rewardStr = rewardOn && selectedClient ? ' (Recompensa cliente frecuente)' : '';
    const courtesyStr = courtesy ? ' (Cortesía)' : '';
    const shift = getOpenShift();
    const nGuests = Math.max(0, Math.round(Number(guests) || 0));
    addTransaction(Math.round(finalTotal * 100) / 100, method, orderDestination, detail + (courtesyStr || rewardStr || discountStr), customerName, undefined, [...cart], discountAmount,
      { ...(selectedClient ? { clientId: selectedClient.id, rewardApplied: rewardOn } : {}), ...(resumedWaiter ? { waiterId: resumedWaiter.id, waiterName: resumedWaiter.name } : {}),
        ...(tipAmount > 0 ? { tip: Math.round(tipAmount * 100) / 100 } : {}), ...(nGuests ? { guests: nGuests } : {}), ...(courtesy ? { courtesy: true } : {}), ...(shift ? { shiftId: shift.id } : {}), ...(split && (split.payments.length > 1 || split.splitWays) ? { payments: split.payments } : {}), ...(split?.splitWays ? { splitWays: split.splitWays } : {}), ...orderType });
    setResumedWaiter(null);
    if (pro && selectedClient) { recordVisit(selectedClient.id, finalTotal, rewardOn); setClients(getClients()); }
    // Inventario automático (Pro): descontar insumos de las recetas
    if (pro) {
      const { alerts } = applySaleToInventory(cart, rows);
      if (alerts.length) {
        setStockAlerts(alerts);
        apiPost('/api/push', { action: 'stock', items: alerts.map((a) => ({ nombre: a.nombre, saldo: a.saldo, unidad: a.unidad, level: a.level })) }).catch(() => {});
      }
    }
    
    // Set for printing
    const isCash = !split && (paymentMethod === 'Efectivo' || paymentMethod === 'Didi Efectivo');
    setLastOrder({
        items: [...cart],
        total: finalTotal,
        paymentMethod: method,
        ...(split && (split.payments.length > 1 || split.splitWays) ? { payments: split.payments } : {}),
        ...(split?.splitWays ? { splitWays: split.splitWays } : {}),
        destination: orderDestination,
        customerName,
        receivedAmount: isCash && receivedAmount ? Number(receivedAmount) : undefined,
        discountAmount: discountAmount,
        tip: tipAmount,
        orderLines: orderTypeLines({ ...orderType, destination: orderDestination, customerName }),
    });

    setCart([]);
    setOrderCustomerName('');
    setDiscountInput(0);
    setClientId(null);
    setRewardOn(false);
    setTipInput('');
    setGuests('');
    setCourtesy(false);
    resetOrderType();
    // Cobro por platillos: regresa al carrito lo que falta por pagar, con la misma mesa/cliente
    if (splitRest) {
        const r = splitRest;
        setCart(r.items);
        setOrderDestination(r.destination);
        setOrderCustomerName(r.customerName);
        setService(r.service); setTable(r.table); setOrderRef(r.orderRef);
        setReopened(r.reopened || null);
        setResumedWaiter(r.waiter);
        setGuests(r.guests);
        setSplitRest(null);
        showToast(`Parte ${r.paidParts} cobrada. Falta por cobrar lo que quedó en la orden.`);
    }

    // Trigger print dialog if any ticket is enabled
    if (settings.printCustomerTicket || settings.printKitchenTicket) runPrint('ticket');
  };

  // ---------- Dividir cuenta / pago mixto
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const otherMethod = (m: POSPaymentMethod): POSPaymentMethod => (m === 'Efectivo' ? 'Tarjeta' : 'Efectivo');
  const openSplit = () => {
    if (waiterMode || cart.length === 0) return;
    if (needsShift()) return;
    const miss = missingOrderInfo();
    if (miss) { setOrderError(miss); return; }
    if (localBusy) { setOrderError(busyMsg(localBusy)); return; }
    const noWaiter = missingWaiter();
    if (noWaiter) { setOrderError(noWaiter); document.getElementById('pos-waiter')?.focus(); return; }
    setSplitError(''); setMixCash(''); setMixFirst('Efectivo'); setPickQty({});
    setWayMethods(Array.from({ length: 8 }, () => 'Efectivo' as POSPaymentMethod));
    setSplitTab('mixto');
    setSplitOpen(true);
  };
  const confirmMixto = () => {
    const first = r2(Number(mixCash) || 0);
    if (first <= 0 || first >= r2(chargeTotal)) { setSplitError(`Escribe cuánto paga en ${mixFirst.toLowerCase()} (más de $0 y menos de $${money(chargeTotal)}).`); return; }
    const sp = salePayments([{ method: mixFirst, amount: first }, { method: otherMethod(mixFirst), amount: r2(chargeTotal - first) }], finalTotal, tipAmount);
    if (!sp) { setSplitError(`La propina ($${money(tipAmount)}) va en el pago con ${otherMethod(mixFirst).toLowerCase()}: no alcanza.`); return; }
    setSplitOpen(false);
    processCheckout(sp);
  };
  const equalAmounts = equalParts(r2(chargeTotal), ways);
  const confirmIguales = () => {
    const sp = salePayments(equalAmounts.map((a, i) => ({ method: wayMethods[i] || 'Efectivo', amount: a })), finalTotal, tipAmount);
    if (!sp) { setSplitError('La propina no cabe en la última parte; quita personas o baja la propina.'); return; }
    setSplitOpen(false);
    processCheckout({ ...sp, splitWays: ways });
  };
  const pickedTotal = cart.reduce((a, it) => a + getItemPrice(it.rowId, it.selectedModifiers) * (pickQty[it.cartId] || 0), 0);
  const confirmPlatillos = () => {
    const part: CartItem[] = [];
    const rest: CartItem[] = [];
    cart.forEach((it) => {
      const q = Math.min(it.quantity, Math.max(0, pickQty[it.cartId] || 0));
      if (q > 0) part.push({ ...it, quantity: q });
      if (it.quantity - q > 0) rest.push({ ...it, quantity: it.quantity - q });
    });
    if (!part.length) { setSplitError('Marca los platillos de la persona que va a pagar.'); return; }
    if (!rest.length) { setSplitError('Marcaste toda la cuenta: ciérrala y usa FINALIZAR normal.'); return; }
    setSplitRest((prev) => ({
      items: prev ? mergeItems(rest, prev.items) : rest,
      customerName: orderCustomerName, service, table, orderRef, waiter: resumedWaiter, guests, destination: orderDestination, reopened,
      paidParts: (prev?.paidParts || 0) + 1,
    }));
    setCart(part);
    setGuests('');
    setSplitOpen(false);
  };
  const mergeItems = (a: CartItem[], b: CartItem[]): CartItem[] => {
    const out = a.map((x) => ({ ...x }));
    b.forEach((it) => {
      const m = out.find((x) => x.cartId === it.cartId);
      if (m) m.quantity += it.quantity; else out.push({ ...it });
    });
    return out;
  };
  const restTotal = splitRest ? splitRest.items.reduce((a, it) => a + getItemPrice(it.rowId, it.selectedModifiers) * it.quantity, 0) : 0;
  const joinSplit = () => {
    if (!splitRest) return;
    setCart((c) => mergeItems(c, splitRest.items));
    setSplitRest(null);
  };

  const handleSaveTicket = async () => {
      if (cart.length === 0 || checkingTable) return;
      if (splitRest) { setOrderError('Estás cobrando una parte de la cuenta: cóbrala o toca JUNTAR CUENTA antes de guardar.'); return; }
      if (needsShift()) return;
      const miss = missingOrderInfo();
      if (miss) { setOrderError(miss); return; }
      if (localBusy) { setOrderError(busyMsg(localBusy)); return; }
      if (orderType.table) {
          // Otra caja o mesero pudo abrir esa mesa en otro dispositivo: se revisa en la nube (máx. 4 s; sin internet se guarda)
          setCheckingTable(true);
          const remote = await Promise.race([
              fetchUnseenItems<OpenTicket>('delivery_calculator_pos_tickets').catch(() => [] as OpenTicket[]),
              new Promise<OpenTicket[]>((r) => setTimeout(() => r([]), 4000)),
          ]);
          setCheckingTable(false);
          const rb = busyTicket(remote, orderType.table);
          if (rb) { setOrderError(busyMsg(rb)); return; }
      }
      const customerName = orderCustomerName.trim() || (orderDestination === 'Tienda' && orderType.table ? `Mesa ${orderType.table}` : orderDestination === 'Didi' ? `Pedido DiDi #${orderType.orderRef}` : 'Sin Nombre');
      const savedType = orderType;
      saveTicket(customerName, orderDestination, cart, finalTotal, resumedWaiter || undefined, Math.max(0, Math.round(Number(guests) || 0)) || undefined, savedType);
      resetOrderType();
      const items = [...cart];
      setCart([]);
      setOrderCustomerName('');
      setDiscountInput(0);
      setResumedWaiter(null);
      setGuests('');
      setTipInput('');
      setCourtesy(false);
      if (waiterMode) {
          // Comanda a cocina y se cierra la sesión del mesero para que el siguiente ponga su PIN
          if (settings.printKitchenTicket) {
              setLastOrder({ items, total: finalTotal, paymentMethod: 'Efectivo', destination: orderDestination, customerName, kitchenOnly: true, waiterName: operator?.name, orderLines: orderTypeLines({ ...savedType, destination: orderDestination, customerName }) });
              runPrint('ticket', () => lockSession());
          } else {
              showToast(`Orden de ${customerName} enviada`);
              setTimeout(() => lockSession(), 1200);
          }
      }
  };

  const handleResumeTicket = (ticket: OpenTicket) => {
      setCart(ticket.items);
      setOrderDestination(ticket.destination);
      setOrderCustomerName(ticket.customerName === 'Sin Nombre' ? '' : ticket.customerName);
      setResumedWaiter(ticket.waiterId && ticket.waiterName ? { id: ticket.waiterId, name: ticket.waiterName } : null);
      setGuests(ticket.guests ? String(ticket.guests) : '');
      setService(ticket.service || ''); setTable(ticket.table || ''); setOrderRef(ticket.orderRef || ''); setOrderError('');
      setReopened(ticket.reopenedFrom || null);
      deleteOpenTicket(ticket.id);
      setIsTicketsModalOpen(false);
  };


  // ---- Piezas compartidas por la vista normal y el «Modo caja rápida» ----
  const chooseDestination = (d: OrderDestination) => { setOrderDestination(d); if (d !== 'Tienda') { setService(''); setTable(''); } if (d !== 'Didi') setOrderRef(''); };
  const renderPayButton = (m: POSPaymentMethod, quick = false) => {
    // Color fijo por forma de pago para que la caja vea de un vistazo cómo está cobrando
    const c = PAY_COLOR[m] || '#475569';
    const on = paymentMethod === m;
    return (
        <button
            key={m}
            onClick={() => setPaymentMethod(m)}
            aria-pressed={on}
            style={on
                ? { background: c, borderColor: c, color: '#fff', boxShadow: `0 6px 16px -6px ${c}` }
                : { background: `${c}14`, borderColor: `${c}55`, color: c }}
            className={cn(
                quick ? "px-2.5 py-1 rounded-lg text-[10px] font-black border-2 transition-all active:scale-95 flex items-center gap-1" : "px-4 py-2 rounded-xl text-xs font-black border-2 transition-all active:scale-95 flex items-center gap-1.5",
                on && !quick && "scale-105"
            )}
        >
            {on && <Check size={quick ? 12 : 14} strokeWidth={3} />}
            {m.toUpperCase()}
        </button>
    );
  };
  const renderCard = (p: ProductRowData, quick = false) => (
    <div
        key={p.id}
        data-prod-card={p.id}
        onPointerDown={canReorder ? (e) => onCardPointerDown(e, p) : undefined}
        onContextMenu={canReorder ? (e) => e.preventDefault() : undefined}
        style={canReorder ? { WebkitTouchCallout: 'none' } : undefined}
        className={cn("relative group/card", canReorder && "select-none", dragProdId === p.id && "z-20 scale-105 rounded-2xl ring-2 ring-agave-500 shadow-xl opacity-90")}
    >
    <button
        onClick={() => { if (suppressClick.current) return; handleProductClick(p); }}
        style={productColor(p.color) ? { background: productColor(p.color)!.bg, boxShadow: `inset 0 -4px 0 ${productColor(p.color)!.bar}` } : undefined}
        className={quick
            ? "bg-white px-2.5 py-2 rounded-xl text-center shadow-[0_1px_2px_rgba(13,16,14,0.06)] hover:ring-2 hover:ring-agave-400/60 active:scale-[0.97] active:bg-agave-50 transition-all duration-150 group relative overflow-hidden w-full h-[96px] xl:h-[104px] flex flex-col items-center justify-center gap-1"
            : "bg-white border border-carbon-950/10 p-4 rounded-2xl text-left shadow-[0_1px_2px_rgba(13,16,14,0.05)] hover:border-agave-400 hover:shadow-[0_10px_24px_-14px_rgba(14,111,77,0.45)] active:scale-[0.98] transition-all duration-200 group relative overflow-hidden w-full h-32 flex flex-col justify-between"}
    >
        <div className={quick ? "font-bold text-carbon-900 group-hover:text-agave-700 text-[14px] leading-[1.15] line-clamp-3 px-3 break-words" : cn("font-semibold text-carbon-900 group-hover:text-agave-700 text-[15px] leading-tight line-clamp-2", canEditMenu ? "pr-8" : "pr-6", hasDayLimit(p.days) && "mt-2")}>{p.name}</div>
        <div className={quick ? "text-[11px] font-semibold text-slate-500 tabular-nums" : "font-display font-bold text-carbon-950 text-xl tracking-tight tabular-nums"}>${money(getItemPrice(p.id, []))}</div>
        {hasDayLimit(p.days) && (
            <div className={cn("whitespace-nowrap rounded-md px-1.5 text-[9px] font-black uppercase tracking-wide", quick ? "absolute left-1/2 -translate-x-1/2 top-1" : "absolute left-4 top-1.5", soldToday(p.days, new Date().getDay()) ? "bg-agave-600 text-white" : "bg-carbon-200 text-carbon-600")}>
                {DAY_ORDER.filter(x => p.days!.includes(x)).map(x => DAY_NAMES[x].slice(0, 3)).join(' · ')}
            </div>
        )}
        {(() => {
            const hasMods = modifierGroups.some(g => productHasGroup(p, g));
            return hasMods && (
                <div className={cn("absolute text-indigo-400 bg-indigo-500/10 rounded-md", quick ? "top-1.5 right-1.5 p-0.5" : "top-2 right-2 p-1")}>
                    <Plus size={12}/>
                </div>
            );
        })()}
    </button>
    {canEditMenu && menu?.updateRow && (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setColorFor(p); }}
            data-no-drag
            title={isOwner ? "Color y modificadores" : "Color del botón"}
            aria-label={`Editar ${p.name}`}
            className={cn("absolute rounded-lg text-carbon-500 bg-white/80 hover:bg-white hover:text-carbon-900 transition-all", quick ? "bottom-1.5 left-1.5 p-1" : "bottom-12 right-3 p-1.5")}
        >
            {isOwner ? <SlidersHorizontal size={14} /> : <Palette size={14} />}
        </button>
    )}
    {canEditMenu && (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); deleteProduct(p); }}
            data-no-drag
            title="Eliminar producto"
            aria-label={`Eliminar ${p.name}`}
            className={cn("absolute p-1.5 rounded-lg text-rose-400 bg-white border border-rose-200 hover:bg-rose-50 hover:text-rose-600 transition-all", quick ? "bottom-1.5 right-1.5 p-1" : "bottom-3 right-3")}
        >
            <Trash2 size={14} />
        </button>
    )}
    </div>
  );
  const orderTypeBlock = (
    <>
      {splitRest && (
          <div className="rounded-xl border border-maiz-400 bg-maiz-50 px-3 py-2 flex items-center gap-2">
              <p className="flex-grow min-w-0 text-[11px] font-bold text-carbon-900">Cobrando la parte {splitRest.paidParts}. Faltan <b>${money(restTotal)}</b> por cobrar ({splitRest.items.reduce((a, i) => a + i.quantity, 0)} platillos).</p>
              <button type="button" onClick={joinSplit} className="shrink-0 rounded-lg border border-carbon-950/20 bg-white px-2 py-1 text-[10px] font-black">JUNTAR CUENTA</button>
          </div>
      )}
      {/* Tipo de orden: sale en grande en ticket y comanda */}
      <div className={cn("rounded-xl border px-3 py-2 space-y-2", orderError ? "border-rose-400 bg-rose-50" : "border-carbon-950/10 bg-slate-950/50")} data-tour="order-type">
          {orderDestination === 'Tienda' && (
              <>
                  <div className="grid grid-cols-2 gap-2">
                      {([['aqui', 'COMER AQUÍ'], ['llevar', 'PARA LLEVAR']] as const).map(([k, l]) => (
                          <button key={k} type="button" onClick={() => setService(k)} className={cn("rounded-lg py-2 text-[11px] font-black tracking-wide border transition-all", service === k ? "bg-agave-600 text-white border-agave-600" : "bg-white text-carbon-700 border-carbon-950/15 hover:border-agave-400")}>{l}</button>
                      ))}
                  </div>
                  {service === 'aqui' && (
                      <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Mesa #:</span>
                          <input type="text" inputMode="numeric" maxLength={8} value={table} onChange={(e) => setTable(e.target.value)} placeholder="Opcional (ej. 4)" className="flex-grow min-w-0 bg-transparent text-carbon-950 text-xs font-bold outline-none placeholder:text-slate-500" />
                      </div>
                  )}
                  {service === 'aqui' && localBusy && !orderError && (
                      <p className="text-[11px] font-bold text-rose-600">Mesa {tableKey(localBusy.table)} ocupada: ya tiene cuenta abierta.</p>
                  )}
              </>
          )}
          {orderDestination === 'Didi' && (
              <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Pedido DiDi #:</span>
                  <input type="text" inputMode="numeric" maxLength={10} value={orderRef} onChange={(e) => setOrderRef(e.target.value.replace(/^#+/, ''))} placeholder="Obligatorio (ej. 12)" className="flex-grow min-w-0 bg-transparent text-carbon-950 text-sm font-black outline-none placeholder:text-slate-500 placeholder:font-medium placeholder:text-xs" />
              </div>
          )}
          {(orderDestination === 'Uber' || orderDestination === 'Rappi') && (
              <p className="text-[11px] font-semibold text-carbon-600">Pedido de {orderDestination}: escribe abajo el <b>nombre del cliente</b> como sale en la app.</p>
          )}
          {orderError && orderError !== WAITER_MSG && <p className="text-[11px] font-bold text-rose-600">{orderError}</p>}
      </div>
    </>
  );
  // Caja rápida: tipo de orden en un solo renglón, sin bordes (en tablet el bloque grande se cortaba)
  const quickOrderType = (
    <>
      {splitRest && (
          <div className="rounded-lg bg-maiz-50 px-2.5 py-1.5 flex items-center gap-2">
              <p className="flex-grow min-w-0 text-[10px] font-bold text-carbon-900">Parte {splitRest.paidParts}. Faltan <b>${money(restTotal)}</b></p>
              <button type="button" onClick={joinSplit} className="shrink-0 rounded-md bg-white px-2 py-0.5 text-[10px] font-black">JUNTAR</button>
          </div>
      )}
      <div data-tour="order-type" className={cn("space-y-1", orderError && "rounded-lg bg-rose-50 p-1")}>
          {orderDestination === 'Tienda' && (
              <div className="flex items-center gap-1.5">
                  <div className="flex flex-1 min-w-0 rounded-lg bg-carbon-100 p-0.5">
                      {([['aqui', 'Aquí'], ['llevar', 'Para llevar']] as const).map(([k, l]) => (
                          <button key={k} type="button" onClick={() => setService(k)} aria-pressed={service === k}
                              className={cn("flex-1 h-7 rounded-md text-[11px] font-black whitespace-nowrap transition-colors", service === k ? "bg-agave-600 text-white shadow-sm" : "text-carbon-600 hover:text-carbon-950")}>{l}</button>
                      ))}
                  </div>
                  {service === 'aqui' && (
                      <input type="text" inputMode="numeric" maxLength={8} value={table} onChange={(e) => setTable(e.target.value)} placeholder="Mesa" aria-label="Mesa (opcional)"
                          className="w-14 h-8 shrink-0 rounded-lg bg-carbon-100 px-2 text-center text-xs font-bold text-carbon-950 outline-none placeholder:text-slate-500 placeholder:font-semibold focus:ring-2 focus:ring-agave-400" />
                  )}
              </div>
          )}
          {orderDestination === 'Didi' && (
              <input type="text" inputMode="numeric" maxLength={10} value={orderRef} onChange={(e) => setOrderRef(e.target.value.replace(/^#+/, ''))} placeholder="# de pedido DiDi (obligatorio)" aria-label="Número de pedido DiDi"
                  className="w-full h-8 rounded-lg bg-carbon-100 px-2.5 text-xs font-black text-carbon-950 outline-none placeholder:text-slate-500 placeholder:font-semibold focus:ring-2 focus:ring-agave-400" />
          )}
          {service === 'aqui' && orderDestination === 'Tienda' && localBusy && !orderError && (
              <p className="text-[10px] font-bold text-rose-600 px-0.5">Mesa {tableKey(localBusy.table)} ocupada: ya tiene cuenta abierta.</p>
          )}
          {orderError && orderError !== WAITER_MSG && <p className="text-[10px] font-bold text-rose-600 px-0.5">{orderError}</p>}
      </div>
    </>
  );
  const extrasBlock = (
    <>
      {/* Customer Name Field - always visible */}
      <div className="relative">
      <div className="flex items-center gap-2 bg-slate-950/50 border border-carbon-950/10 rounded-xl px-3 py-2">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Cliente:</span>
          <input
              type="text"
              value={orderCustomerName}
              onChange={(e) => { setOrderCustomerName(e.target.value); setClientId(null); setRewardOn(false); setShowSuggest(true); }}
              onFocus={() => setShowSuggest(true)}
              onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
              placeholder={orderDestination === 'Uber' || orderDestination === 'Rappi' ? 'Nombre del cliente (obligatorio)' : pro ? 'Nombre o teléfono del cliente' : 'Nombre del cliente (opcional)'}
              className="flex-grow min-w-0 bg-transparent text-carbon-950 text-xs font-medium outline-none placeholder:text-slate-500"
          />
          {pro && !clientId && orderCustomerName.trim().length >= 2 && suggestions.length === 0 && (
              <button type="button" title="Guardar como cliente" onClick={() => {
                  const phone = prompt(`Teléfono de ${orderCustomerName.trim()} (opcional):`) ?? '';
                  const c = addClient(orderCustomerName.trim(), phone);
                  setClients(getClients()); setClientId(c.id);
              }} className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-agave-50 px-2 py-1 text-[10px] font-bold text-agave-700 hover:bg-agave-100"><UserPlus size={12} /> Guardar</button>
          )}
      </div>
      {showSuggest && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 bottom-full mb-1 z-30 rounded-xl border border-carbon-950/10 bg-white shadow-[0_12px_32px_-12px_rgba(13,16,14,0.3)] p-1">
              {suggestions.map((c) => (
                  <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setClientId(c.id); setOrderCustomerName(c.name); setShowSuggest(false); }} className="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-agave-50">
                      <span className="text-sm font-semibold text-carbon-900 truncate">{c.name}</span>
                      <span className="text-[11px] text-carbon-500 shrink-0">{c.visits} visitas{rewardReady(c, loyalty) ? ' · 🎁' : ''}</span>
                  </button>
              ))}
          </div>
      )}
      </div>
      <div className="flex items-center gap-2 bg-slate-950/50 border border-carbon-950/10 rounded-xl px-3 py-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Personas:</span>
          <div className="flex items-center gap-1 ml-auto">
              <button type="button" onClick={() => setGuests(String(Math.max(0, (Number(guests) || 0) - 1) || ''))} className="w-7 h-7 rounded-lg bg-white border border-carbon-950/10 text-carbon-700 flex items-center justify-center"><Minus size={12} /></button>
              <input type="number" min="0" value={guests} onChange={(e) => setGuests(e.target.value)} placeholder="0" className="w-10 bg-transparent text-center text-carbon-950 text-xs font-bold outline-none placeholder:text-slate-500" />
              <button type="button" onClick={() => setGuests(String((Number(guests) || 0) + 1))} className="w-7 h-7 rounded-lg bg-white border border-carbon-950/10 text-carbon-700 flex items-center justify-center"><Plus size={12} /></button>
          </div>
      </div>
      {selectedClient && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-maiz-200 bg-maiz-50 px-3 py-2">
              <div className="min-w-0">
                  <div className="text-xs font-bold text-carbon-900 truncate">{selectedClient.name}{selectedClient.notes ? ` · ${selectedClient.notes}` : ''}</div>
                  <div className="text-[11px] text-carbon-600">{selectedClient.visits} visitas · {loyalty.enabled ? `${Math.min(selectedClient.stamps, loyalty.every - 1)}/${loyalty.every - 1} para su recompensa` : `$${money(selectedClient.total)} gastado`}</div>
              </div>
              {rewardReady(selectedClient, loyalty) && (
                  <button type="button" onClick={() => setRewardOn((v) => !v)} className={cn('shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold', rewardOn ? 'bg-agave-600 text-white' : 'bg-white text-maiz-800 border border-maiz-300 animate-pulse')}>
                      <Gift size={13} /> {rewardOn ? 'Recompensa aplicada' : 'Aplicar recompensa'}
                  </button>
              )}
          </div>
      )}
      {/* Descuento: el mesero no puede */}
      {!waiterMode && <div className="flex flex-wrap items-center gap-2 bg-slate-950/50 border border-carbon-950/10 rounded-xl px-3 py-1.5">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Descuento:</span>
          <div className="flex items-center gap-2 flex-grow justify-end min-w-0">
              <input
                  type="number"
                  min="0"
                  value={discountInput === 0 ? '' : discountInput}
                  onChange={(e) => {
                      const val = e.target.value === '' ? 0 : Number(e.target.value);
                      setDiscountInput(val);
                  }}
                  placeholder="0"
                  className="w-16 bg-transparent text-carbon-950 text-xs font-bold outline-none placeholder:text-slate-500 text-right"
              />
              <div className="flex bg-slate-900 rounded-lg p-0.5 border border-carbon-950/10 shrink-0">
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
          <button type="button" title="Cortesía: la casa invita (requiere PIN)" onClick={() => courtesy ? setCourtesy(false) : requirePin(() => setCourtesy(true))}
              className={cn("shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black border", courtesy ? "bg-maiz-400 border-maiz-500 text-carbon-950" : "bg-white border-carbon-950/10 text-carbon-600 hover:text-carbon-950")}>
              <Gift size={12} /> {courtesy ? 'CORTESÍA' : 'Cortesía'}
          </button>
      </div>}
      {!waiterMode && orderDestination === 'Tienda' && (waiterOptions.length > 0 || resumedWaiter) && (
          <div className={cn("flex items-center gap-2 bg-slate-950/50 border rounded-xl px-3 py-1.5", orderError === WAITER_MSG ? "border-rose-400 ring-2 ring-rose-200" : "border-carbon-950/10")}>
              <label htmlFor="pos-waiter" className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Mesero:</label>
              <select id="pos-waiter" value={resumedWaiter?.id || ''}
                  onChange={(e) => { const w = waiterOptions.find((x) => x.id === e.target.value); setResumedWaiter(w ? { id: w.id, name: w.name } : null); }}
                  className={cn("min-w-0 flex-grow bg-transparent text-xs font-bold outline-none text-right", resumedWaiter ? "text-carbon-950" : orderError === WAITER_MSG ? "text-rose-600" : "text-slate-500")}>
                  <option value="">Sin mesero</option>
                  {waiterOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
          </div>
      )}
      {!waiterMode && orderError === WAITER_MSG && <p className="text-[11px] font-bold text-rose-600 px-1">{orderError}</p>}
      {!waiterMode && orderDestination === 'Tienda' && !courtesy && (
          <div className="flex items-center gap-2 bg-slate-950/50 border border-carbon-950/10 rounded-xl px-3 py-1.5">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest whitespace-nowrap">Propina:</span>
              <div className="flex items-center gap-1 flex-grow justify-end">
                  {[10, 15].map((p) => (
                      <button key={p} type="button" onClick={() => setTipInput((Math.round(finalTotal * p) / 100).toFixed(2))} className="px-2 py-0.5 rounded-md bg-white border border-carbon-950/10 text-[10px] font-black text-carbon-600 hover:text-carbon-950">{p}%</button>
                  ))}
                  <span className="text-xs font-bold text-slate-500 ml-1">$</span>
                  <input type="number" min="0" value={tipInput} onChange={(e) => setTipInput(e.target.value)} placeholder="0" className="w-16 bg-transparent text-carbon-950 text-xs font-bold outline-none placeholder:text-slate-500 text-right" />
              </div>
          </div>
      )}
    </>
  );
  const totalsBlock = (
    <>
      {discountAmount > 0 && (
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
              <span>Subtotal</span>
              <span>${money(cartTotal)}</span>
          </div>
      )}
      {discountAmount > 0 && (
          <div className="flex justify-between items-center text-xs font-bold text-emerald-500 px-1">
              <span>Descuento</span>
              <span>-${money(discountAmount)}</span>
          </div>
      )}
      {tipAmount > 0 && (
          <>
              <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
                  <span>Venta</span>
                  <span>${money(finalTotal)}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold text-slate-500 px-1">
                  <span>Propina</span>
                  <span>+${money(tipAmount)}</span>
              </div>
          </>
      )}
      <div className="flex justify-between items-end mb-2 pt-1 px-1">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest">{waiterMode ? 'Total' : 'Total Cobrar'}</span>
          <span className="text-3xl font-black text-carbon-950 tracking-tighter">${money(waiterMode ? finalTotal : chargeTotal)}</span>
      </div>
    </>
  );

  // ---- «Modo caja rápida» (solo pantallas ≥768 px, opción por equipo) ----
  const activeCatName = activeCategoryId ? (categories.find(c => c.id === activeCategoryId)?.name || 'Categoría') : 'Todos';
  const extrasSummary = [
    orderCustomerName.trim() && orderCustomerName.trim(),
    guests && Number(guests) > 0 && `${guests} pers.`,
    discountAmount > 0 && `-$${money(discountAmount)}`,
    courtesy && 'Cortesía',
    tipAmount > 0 && `Propina $${money(tipAmount)}`,
    resumedWaiter && resumedWaiter.name,
  ].filter(Boolean) as string[];
  const extrasOpen = quickMore || orderError === WAITER_MSG || ((orderDestination === 'Uber' || orderDestination === 'Rappi') && !orderCustomerName.trim());
  const quickView = (
    <div ref={quickRef} style={quickH ? { height: quickH } : undefined} className="flex min-h-[420px] no-print bg-white" data-quick-pos>
        {/* Productos */}
        <section className="flex-1 min-w-0 flex flex-col bg-carbon-50 overflow-hidden">
            <div className="flex items-center gap-1.5 lg:gap-3 border-b border-carbon-950/[0.06] bg-white px-3 lg:px-4 py-2">
                <button type="button" onClick={() => window.dispatchEvent(new Event('dp:opennav'))} aria-label="Abrir menú de secciones"
                    className="shrink-0 grid h-10 w-10 place-items-center rounded-xl bg-carbon-950 text-white"><MenuIcon size={18} /></button>
                {quickSearch ? (
                    <div className="relative flex-1 min-w-0">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input autoFocus type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchQuery(''); setQuickSearch(false); } }}
                            placeholder="Buscar producto…" className="w-full rounded-xl border border-carbon-950/15 bg-white pl-9 pr-3 py-2 text-sm font-semibold text-carbon-950 outline-none focus:border-agave-500" />
                    </div>
                ) : (
                    <h2 className="flex-1 min-w-[4.5rem] lg:min-w-[7rem] truncate font-display text-lg lg:text-xl font-bold text-carbon-950">{activeCatName}</h2>
                )}
                <button type="button" onClick={() => { if (quickSearch) { setSearchQuery(''); setQuickSearch(false); } else setQuickSearch(true); }}
                    aria-label={quickSearch ? 'Cerrar búsqueda' : 'Buscar producto'} className="shrink-0 grid h-10 w-10 place-items-center rounded-xl border border-carbon-950/10 text-carbon-700 hover:bg-carbon-50">
                    {quickSearch ? <X size={18} /> : <Search size={18} />}
                </button>
                {operator && requiresCashierLogin() && (
                    <button type="button" onClick={() => lockSession()} title="Cambiar de cajero" className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-carbon-950/10 bg-white pl-3 pr-3 lg:pr-1 py-1 text-[11px] text-carbon-600 hover:bg-carbon-50">
                        <b className="max-w-[64px] lg:max-w-[90px] truncate text-carbon-900">{operator.name}</b><span className="hidden lg:inline rounded-full bg-carbon-100 px-2 py-0.5 font-semibold text-carbon-800">Cambiar</span>
                    </button>
                )}
                {!waiterMode && <div className="shrink-0"><CashShiftBar compact transactions={transactions} settings={settings} rows={rows} categories={categories} /></div>}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
                <div ref={setGridRef} className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                    {filteredProducts.length === 0 && (
                        <div className="col-span-full text-center py-12 text-slate-600">
                            <Search size={32} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">{searchQuery ? `Sin resultados para "${searchQuery}"` : 'Sin productos en esta categoría'}</p>
                        </div>
                    )}
                    {filteredProducts.map(p => renderCard(p, true))}
                    {canEditMenu && !searchQuery && (
                        <button type="button" onClick={() => setNewProd({ name: '', price: '', categoryId: activeCategoryId || '', mods: [], off: [], color: '' })}
                            className="w-full border-2 border-dashed border-agave-400/60 text-agave-700 rounded-xl h-[96px] xl:h-[104px] flex flex-col items-center justify-center gap-1 font-bold text-xs hover:bg-agave-50 transition-all">
                            <Plus size={18} /> Agregar producto
                        </button>
                    )}
                </div>
            </div>

            {/* Categorías abajo: botones chicos en renglones, todas a la vista */}
            <nav aria-label="Categorías" className="flex flex-wrap gap-1 border-t border-carbon-950/[0.06] bg-white px-2 py-1.5 max-h-[96px] overflow-y-auto">
                {categories.map(c => ({ id: c.id as string | null, name: c.name, n: categoryCounts[c.id] || 0 })).map(c => {
                    const on = activeCategoryId === c.id;
                    return (
                        <button key={c.id ?? 'all'} type="button" onClick={() => setActiveCategoryId(on ? null : c.id)} aria-pressed={on} title={on ? 'Toca otra vez para ver todos' : undefined}
                            className={cn("shrink-0 inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md border px-2.5 text-[11px] font-bold transition-colors",
                                on ? "border-agave-600 bg-agave-600 text-white" : "border-transparent bg-carbon-100 text-carbon-700 hover:bg-carbon-200")}>
                            {c.name}
                            {c.n > 0 && <span className={cn("text-[10px] font-semibold", on ? "text-white/80" : "text-slate-500")}>{c.n}</span>}
                        </button>
                    );
                })}
            </nav>
        </section>

        {/* Ticket fijo a la derecha */}
        <aside ref={cartRef} className="relative w-[290px] lg:w-[320px] xl:w-[350px] shrink-0 flex flex-col [&_.text-3xl]:text-2xl [&_.mb-2]:mb-0 border-l border-carbon-950/[0.08] bg-white overflow-hidden">
            <div className="flex items-center gap-2 border-b border-carbon-950/[0.06] px-3 py-2">
                <h3 className="font-display text-lg font-bold text-carbon-950 mr-auto">Ticket</h3>
                <button type="button" onClick={() => { setIsTicketsModalOpen(true); void refreshOpenTickets(); }} title="Tickets abiertos"
                    className="relative inline-flex h-8 items-center gap-1.5 rounded-lg bg-carbon-100 px-2.5 text-[10px] font-black text-carbon-700 hover:bg-carbon-200">
                    <History size={16} className="text-maiz-600" /> ABIERTOS
                    {openTickets.length > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-maiz-400 px-1 text-[10px] font-black text-carbon-950">{openTickets.length}</span>}
                </button>
                <div className="relative">
                    <button type="button" onClick={() => setQuickMenu(v => !v)} aria-label="Más opciones" className="grid h-8 w-8 place-items-center rounded-lg bg-carbon-100 text-carbon-700 hover:bg-carbon-200"><MoreVertical size={18} /></button>
                    {quickMenu && (
                        <>
                        <div className="fixed inset-0 z-40" onClick={() => setQuickMenu(false)} />
                        <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-carbon-950/10 bg-white p-2 shadow-[0_18px_40px_-18px_rgba(13,16,14,0.45)]">
                            <button type="button" onClick={() => updateSettings({ printCustomerTicket: !settings.printCustomerTicket })} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-carbon-800 hover:bg-carbon-50">
                                <span className="inline-flex items-center gap-2"><Printer size={16} /> Imprimir ticket</span>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", settings.printCustomerTicket ? "bg-agave-600 text-white" : "bg-carbon-100 text-carbon-600")}>{settings.printCustomerTicket ? 'SÍ' : 'NO'}</span>
                            </button>
                            <button type="button" onClick={() => updateSettings({ printKitchenTicket: !settings.printKitchenTicket })} className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-carbon-800 hover:bg-carbon-50">
                                <span className="inline-flex items-center gap-2"><ChefHat size={16} /> Imprimir comanda</span>
                                <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", settings.printKitchenTicket ? "bg-agave-600 text-white" : "bg-carbon-100 text-carbon-600")}>{settings.printKitchenTicket ? 'SÍ' : 'NO'}</span>
                            </button>
                            <div className="my-1 h-px bg-carbon-950/10" />
                            <button type="button" onClick={() => { setQuickMenu(false); setQuickPos(false); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-carbon-800 hover:bg-carbon-50">
                                <Minimize2 size={16} /> Salir de caja rápida
                            </button>
                        </div>
                        </>
                    )}
                </div>
            </div>

            <div className="px-3 pt-2">
                <label htmlFor="pos-dest" className="sr-only">Dónde se vendió</label>
                <select id="pos-dest" value={orderDestination} onChange={(e) => chooseDestination(e.target.value as OrderDestination)}
                    className="w-full h-9 appearance-none rounded-lg bg-carbon-100 pl-3 pr-9 text-sm font-bold text-carbon-950 outline-none focus:ring-2 focus:ring-agave-400"
                    style={{ backgroundRepeat: 'no-repeat', backgroundSize: '16px', backgroundPosition: 'right 12px center', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
                    <option value="Tienda">Tienda (mostrador)</option>
                    <option value="Uber">Uber</option>
                    <option value="Didi">DiDi</option>
                    <option value="Rappi">Rappi</option>
                </select>
            </div>

            <div className="relative flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-[72px] overflow-y-auto px-4 py-2">
                {cart.length === 0 ? (
                    <div className="h-full grid place-items-center text-center text-slate-500">
                        <div><ShoppingCart size={40} className="mx-auto mb-2 opacity-15" /><p className="text-sm font-medium">Toca un producto para agregarlo</p></div>
                    </div>
                ) : cart.map(item => {
                    const p = rows.find(r => r.id === item.rowId);
                    const unitPrice = getItemPrice(item.rowId, item.selectedModifiers);
                    return (
                        <div key={item.cartId} className="border-b border-carbon-950/[0.06] py-2.5 last:border-b-0">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 text-sm font-bold text-carbon-950 leading-tight">{p?.name} <span className="font-semibold text-slate-500">× {item.quantity}</span></div>
                                <div className="shrink-0 text-sm font-black text-carbon-950 tabular-nums">${money(unitPrice * item.quantity)}</div>
                            </div>
                            {item.selectedModifiers.some(g => g.modifiers.length) && (
                                <div className="mt-0.5 text-[11px] text-slate-500 leading-snug">{item.selectedModifiers.flatMap(g => g.modifiers.map(m => m.name)).map(n => `+${n}`).join(' · ')}</div>
                            )}
                            {item.customerNote && <div className="mt-0.5 text-[10px] font-bold uppercase tracking-tight text-indigo-500">{item.customerNote}</div>}
                            <div className="mt-1.5 flex items-center justify-between">
                                <span className="text-[10px] text-slate-500">${money(unitPrice)} c/u</span>
                                <div className="flex items-center gap-1">
                                    <button type="button" onClick={() => requirePin(() => updateCartQuantity(item.cartId, -1))} aria-label="Quitar uno" className="grid h-8 w-8 place-items-center rounded-lg bg-carbon-100 text-carbon-700 hover:bg-carbon-200"><Minus size={14} /></button>
                                    <span className="w-6 text-center text-xs font-black text-carbon-950">{item.quantity}</span>
                                    <button type="button" onClick={() => updateCartQuantity(item.cartId, 1)} aria-label="Agregar uno" className="grid h-8 w-8 place-items-center rounded-lg bg-carbon-100 text-carbon-700 hover:bg-carbon-200"><Plus size={14} /></button>
                                    <button type="button" onClick={() => requirePin(() => removeFromCart(item.cartId))} aria-label="Quitar platillo" className="ml-1 grid h-8 w-8 place-items-center rounded-lg text-rose-500/70 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="shrink-0 border-t border-carbon-950/[0.06] px-3 pt-2 pb-1.5 space-y-1.5">
                {quickOrderType}
                <button type="button" onClick={() => setQuickMore(v => !v)} aria-expanded={extrasOpen}
                    className="flex w-full h-8 items-center gap-2 rounded-lg bg-carbon-100 px-2.5 text-left hover:bg-carbon-200 transition-colors">
                    <UserPlus size={14} className="shrink-0 text-carbon-600" />
                    <span className={cn("min-w-0 flex-1 truncate text-[11px] font-bold", extrasSummary.length ? "text-carbon-950" : "text-carbon-600")}>
                        {extrasSummary.length ? extrasSummary.join(' · ') : `Cliente, descuento${!waiterMode && orderDestination === 'Tienda' ? ', propina' : ''}`}
                    </span>
                    <ChevronRight size={15} className="shrink-0 text-slate-500" />
                </button>
                {!waiterMode && availablePaymentMethods.length > 1 && (
                    <div className="flex rounded-lg bg-carbon-100 p-0.5" aria-label="Forma de pago">
                        {availablePaymentMethods.map(m => {
                            const c = PAY_COLOR[m] || '#475569';
                            const on = paymentMethod === m;
                            return (
                                <button key={m} type="button" onClick={() => setPaymentMethod(m)} aria-pressed={on}
                                    style={on ? { background: c, color: '#fff' } : { color: c }}
                                    className={cn("flex-1 h-7 rounded-md text-[11px] font-black inline-flex items-center justify-center gap-1 transition-colors", on && "shadow-sm")}>
                                    {on && <Check size={12} strokeWidth={3} />}{m}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Cliente/personas/descuento/propina: panel encima de la lista (en tablet no cabe en línea y se cortaba) */}
            {extrasOpen && (
                <div className="absolute inset-0 z-20 flex flex-col bg-white">
                    <div className="flex items-center gap-2 border-b border-carbon-950/[0.06] px-3 py-2">
                        <span className="mr-auto min-w-0 truncate text-[10px] font-black uppercase tracking-widest text-slate-500">Cliente, descuento{!waiterMode && orderDestination === 'Tienda' ? ', propina' : ''}</span>
                        <button type="button" onClick={() => setQuickMore(false)} className="shrink-0 rounded-lg bg-agave-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-agave-700">LISTO</button>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-1.5 [&_input[type=number]]:w-12 [&_.bottom-full]:bottom-auto [&_.bottom-full]:top-full [&_.bottom-full]:mb-0 [&_.bottom-full]:mt-1 [&_.rounded-xl]:border-transparent [&_.rounded-xl]:bg-carbon-100 [&_.bottom-full]:bg-white [&_.bottom-full]:shadow-xl">
                        {extrasBlock}
                    </div>
                </div>
            )}
            </div>
            <div className="shrink-0 border-t border-carbon-950/[0.06] px-3 pt-2 pb-2.5 space-y-1.5">
                {totalsBlock}
                {waiterMode ? (
                    <button disabled={cart.length === 0 || checkingTable} onClick={handleSaveTicket}
                        className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2">
                        <Save size={20} /> ENVIAR ORDEN
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-2">
                        <button disabled={cart.length === 0 || checkingTable} onClick={handleSaveTicket}
                            className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-500 text-slate-300 font-black py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-xs">
                            <Save size={15} /> GUARDAR
                        </button>
                        <button disabled={cart.length === 0} onClick={handleCheckout}
                            className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-sm">
                            <CreditCard size={16} /> COBRAR
                        </button>
                    </div>
                )}
                {!waiterMode && orderDestination === 'Tienda' && (
                    <button type="button" disabled={cart.length === 0} onClick={openSplit} data-tour="split"
                        className="w-full py-1 rounded-md text-carbon-600 text-[10px] font-black tracking-wide hover:bg-carbon-100 hover:text-carbon-950 disabled:opacity-40 transition-colors">DIVIDIR CUENTA / PAGO MIXTO</button>
                )}
            </div>
        </aside>
    </div>
  );

  return (
    <>
    {stockAlerts.length > 0 && (
            <div className="fixed bottom-5 right-5 z-[90] w-80 rounded-2xl border border-maiz-300 bg-white p-4 shadow-[0_18px_40px_-18px_rgba(13,16,14,0.45)]">
                <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-maiz-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-carbon-900">Se está acabando</div>
                        <ul className="mt-1 space-y-0.5 text-xs text-carbon-700">
                            {stockAlerts.slice(0, 5).map((a) => <li key={a.id}><b className={a.level === 'critical' ? 'text-rose-600' : 'text-maiz-800'}>{a.nombre}</b>: quedan {a.saldo} {a.unidad}</li>)}
                        </ul>
                    </div>
                    <button onClick={() => setStockAlerts([])} className="text-carbon-400 hover:text-carbon-700"><X size={16} /></button>
                </div>
            </div>
        )}
    {quick ? quickView : (
    <div className="space-y-4 no-print">
        {!waiterMode && <CashShiftBar transactions={transactions} settings={settings} rows={rows} categories={categories} />}
        {/* Category Filter: en celular lista desplegable; en tablet/compu etiquetas en renglones (sin scroll de lado) */}
        <div className="md:hidden">
            <label className="sr-only" htmlFor="pos-cat">Categoría</label>
            <select
                id="pos-cat"
                value={activeCategoryId ?? ''}
                onChange={(e) => setActiveCategoryId(e.target.value || null)}
                className={cn(
                    "w-full rounded-xl border pl-4 pr-10 py-3 text-sm font-bold outline-none appearance-none",
                    activeCategoryId ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-carbon-950/15 bg-white text-carbon-900"
                )}
                style={{ backgroundRepeat: 'no-repeat', backgroundSize: '16px', backgroundPosition: 'right 14px center', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23334155' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
            >
                <option value="">Todas las categorías ({rows.length})</option>
                {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}{categoryCounts[cat.id] ? ` (${categoryCounts[cat.id]})` : ''}</option>
                ))}
            </select>
        </div>
        {/* Category Filter Bar */}
        <div className="hidden md:flex flex-wrap gap-1.5">
            <button
                onClick={() => setActiveCategoryId(null)}
                className={cn(
                    "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap border flex items-center gap-1.5",
                    activeCategoryId === null
                        ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20"
                        : "bg-white border-carbon-950/10 text-carbon-700 hover:border-agave-300 hover:text-agave-700"
                )}
            >
                TODOS
                <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full", activeCategoryId === null ? "bg-carbon-950/20" : "bg-carbon-950/5")}>{rows.length}</span>
            </button>
            {categories.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveCategoryId(cat.id)}
                    className={cn(
                        "px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all whitespace-nowrap border flex items-center gap-1.5",
                        activeCategoryId === cat.id
                            ? "bg-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/20"
                            : "bg-white border-carbon-950/10 text-carbon-700 hover:border-agave-300 hover:text-agave-700"
                    )}
                >
                    {cat.name.toUpperCase()}
                    {categoryCounts[cat.id] ? (
                        <span className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full", activeCategoryId === cat.id ? "bg-carbon-950/20" : "bg-carbon-950/5")}>{categoryCounts[cat.id]}</span>
                    ) : null}
                </button>
            ))}
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-x-8 lg:gap-y-0">
            {/* Products Grid */}
            {/* Encabezado (tienda/apps, método de pago): en celular va arriba de la orden; en compu es la parte de arriba de la tarjeta de productos */}
            <div className="order-1 lg:order-none lg:col-span-8 bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl lg:rounded-b-none lg:border-b-0 p-4 sm:p-6 lg:pb-0 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] lg:shadow-none">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        <h2 className="font-display text-xl font-bold text-carbon-950 flex items-center gap-2">
                            <ShoppingCart size={20} className="text-indigo-400"/> Menú
                        </h2>
                        <div className="h-4 w-px bg-carbon-950/10 hidden sm:block"></div>
                        <div className="grid grid-cols-4 w-full sm:w-auto sm:flex bg-slate-950 p-1 rounded-xl border border-carbon-950/10">
                            {(['Tienda', 'Uber', 'Didi', 'Rappi'] as OrderDestination[]).map(d => {
                                const activeColors: Record<string, string> = {
                                    Tienda: 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20',
                                    Uber:   'bg-[#06C167] text-white shadow-lg shadow-green-500/20',
                                    Didi:   'bg-orange-500 text-white shadow-lg shadow-orange-500/20',
                                    Rappi:  'bg-[#FF424D] text-white shadow-lg shadow-red-500/20',
                                };
                                return (
                                    <button
                                        key={d}
                                        onClick={() => chooseDestination(d)}
                                        className={cn(
                                            "px-1.5 sm:px-3 py-1.5 rounded-lg text-[10px] font-black transition-all flex items-center justify-center gap-1 sm:gap-1.5",
                                            orderDestination === d ? activeColors[d] : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        {d === 'Tienda' ? <ShoppingCart size={12}/> : <Bike size={12}/>}
                                        {d.toUpperCase()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-3">
                        <button type="button" onClick={() => setQuickPos(true)} title="Pantalla completa para cobrar rápido (este equipo)"
                            className="hidden md:inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-agave-400/60 bg-agave-50 text-agave-700 text-[10px] font-black tracking-widest uppercase hover:bg-agave-100 shrink-0">
                            <Maximize2 size={16} /> Caja rápida
                        </button>
                        <button 
                            onClick={() => { setIsTicketsModalOpen(true); void refreshOpenTickets(); }}
                            className="flex items-center gap-2 bg-slate-950 border border-carbon-950/10 h-10 px-4 rounded-xl text-slate-400 hover:text-carbon-950 transition-all group shrink-0"
                        >
                            <History size={18} className="text-amber-500 group-hover:scale-110 transition-transform"/>
                            <span className="text-[10px] font-black tracking-widest uppercase hidden sm:inline">Tickets Abiertos</span>
                            {openTickets.length > 0 && <span className="bg-maiz-400 text-carbon-950 w-5 h-5 rounded-full flex items-center justify-center font-black text-[10px]">{openTickets.length}</span>}
                        </button>

                        <div className="flex items-center bg-slate-950/50 border border-carbon-950/10 rounded-xl h-10 px-3 gap-3">
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Ticket</span>
                                <button 
                                    onClick={() => updateSettings({ printCustomerTicket: !settings.printCustomerTicket })}
                                    className={cn(
                                        "w-7 h-3.5 rounded-full transition-colors relative",
                                        settings.printCustomerTicket ? "bg-emerald-500" : "bg-slate-700"
                                    )}
                                >
                                    <div className={cn("absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform", settings.printCustomerTicket && "translate-x-3.5")} />
                                </button>
                            </div>
                            <div className="w-px h-3 bg-carbon-950/5" />
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Cocina</span>
                                <button 
                                    onClick={() => updateSettings({ printKitchenTicket: !settings.printKitchenTicket })}
                                    className={cn(
                                        "w-7 h-3.5 rounded-full transition-colors relative",
                                        settings.printKitchenTicket ? "bg-agave-500" : "bg-slate-700"
                                    )}
                                >
                                    <div className={cn("absolute top-0.5 left-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform", settings.printKitchenTicket && "translate-x-3.5")} />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between mb-6 p-4 bg-slate-950/50 rounded-2xl border border-carbon-950/10">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Método de Pago</div>
                    <div className="flex flex-wrap justify-end gap-2">
                        {availablePaymentMethods.map(m => renderPayButton(m))}
                    </div>
                </div>

            </div>

            <div className="order-3 lg:order-none lg:col-span-8 bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl lg:rounded-t-none lg:border-t-0 p-4 sm:p-6 lg:pt-0 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
                {/* Search bar */}
                <div className="relative mb-4">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
                        placeholder="Buscar producto... (Esc para limpiar)"
                        className="w-full bg-slate-950/80 border border-carbon-950/10 rounded-xl pl-9 pr-9 py-2.5 text-sm text-carbon-950 outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-slate-500 transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-carbon-950 transition-colors">
                            <X size={14} />
                        </button>
                    )}
                </div>

                {canReorder && filteredProducts.length > 1 && (
                    <p className="text-[11px] text-slate-500 -mt-1 mb-3">Para cambiar el orden, mantén presionado un producto y arrástralo.</p>
                )}
                <div ref={setGridRef} className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredProducts.length === 0 && (
                        <div className="col-span-full text-center py-12 text-slate-600">
                            <Search size={32} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm font-medium">Sin resultados para "{searchQuery}"</p>
                        </div>
                    )}
                    {filteredProducts.map(p => renderCard(p))}
                    {canEditMenu && !searchQuery && (
                        <button
                            type="button"
                            onClick={() => setNewProd({ name: '', price: '', categoryId: activeCategoryId || '', mods: [], off: [], color: '' })}
                            className="w-full border-2 border-dashed border-agave-400/60 text-agave-700 rounded-2xl h-32 flex flex-col items-center justify-center gap-1 font-bold text-sm hover:bg-agave-50 transition-all"
                        >
                            <Plus size={20} /> Agregar producto
                        </button>
                    )}
                </div>
            </div>

            {/* Cart Section */}
            {/* En celular y tablet la orden va ARRIBA de los productos; en computadora, a la derecha */}
            <div ref={cartRef} className="order-2 lg:order-none lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:row-span-2 flex flex-col gap-4 scroll-mt-20">
                <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl p-4 sm:p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex-grow flex flex-col lg:min-h-[520px]">
                    <h3 className="text-lg font-bold text-carbon-950 mb-4">Orden Actual</h3>
                    <div className="flex-grow space-y-3 overflow-y-auto no-scrollbar pr-1 max-h-[45vh] lg:max-h-none">
                        {cart.length === 0 ? (
                            <div className="text-center py-6 lg:py-20 text-slate-600">
                                <ShoppingCart size={48} className="mx-auto mb-2 lg:mb-4 opacity-10 hidden lg:block"/>
                                <p className="text-sm font-medium">El carrito está vacío</p>
                            </div>
                        ) : cart.map(item => {
                            const p = rows.find(r => r.id === item.rowId);
                            const unitPrice = getItemPrice(item.rowId, item.selectedModifiers);
                            return (
                                <div key={item.cartId} className="bg-slate-950/50 border border-carbon-950/10 p-3 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col">
                                            <div className="text-sm font-bold text-slate-200 leading-tight pr-2">{p?.name}</div>
                                            {item.customerNote && <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-tight mt-0.5">{item.customerNote}</div>}
                                        </div>
                                        <div className="text-sm font-black text-carbon-950 whitespace-nowrap">${money((unitPrice * item.quantity))}</div>
                                    </div>
                                    {item.selectedModifiers.map(g => (
                                        <div key={g.groupId} className="flex flex-wrap gap-1">
                                            {g.modifiers.map(m => (
                                                <span key={m.id} className="text-[10px] text-slate-500 bg-carbon-950/5 px-1.5 py-0.5 rounded italic">+{m.name}</span>
                                            ))}
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between mt-1">
                                        <span className="text-[10px] text-slate-600">${money(unitPrice)} c/u</span>
                                        <div className="flex items-center gap-2 bg-slate-900 px-2 py-1 rounded-lg border border-carbon-950/10">
                                            <button onClick={() => requirePin(() => updateCartQuantity(item.cartId, -1))} className="text-slate-500 hover:text-carbon-950"><Minus size={14}/></button>
                                            <span className="text-xs font-black text-carbon-950 w-4 text-center">{item.quantity}</span>
                                            <button onClick={() => updateCartQuantity(item.cartId, 1)} className="text-slate-500 hover:text-carbon-950"><Plus size={14}/></button>
                                            <div className="w-px h-3 bg-carbon-950/10 mx-1"></div>
                                            <button onClick={() => requirePin(() => removeFromCart(item.cartId))} className="text-rose-500/50 hover:text-rose-400"><Trash2 size={14}/></button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                    <div className="pt-4 border-t border-carbon-950/10 mt-4 space-y-3">
                        {orderTypeBlock}
                        {extrasBlock}
                        {totalsBlock}
                        {waiterMode ? (
                            <button
                                disabled={cart.length === 0 || checkingTable}
                                onClick={handleSaveTicket}
                                className="w-full bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-500 text-white font-black py-4 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Save size={20}/> ENVIAR ORDEN
                            </button>
                        ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <button 
                                disabled={cart.length === 0 || checkingTable}
                                onClick={handleSaveTicket}
                                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-500 text-slate-300 font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm"
                            >
                                <Save size={18}/> GUARDAR
                            </button>
                            <button 
                                disabled={cart.length === 0}
                                onClick={handleCheckout}
                                className="bg-indigo-500 hover:bg-indigo-400 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:text-slate-600 text-white font-black py-4 rounded-2xl transition-all shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/10 active:scale-95 flex items-center justify-center gap-2"
                            >
                                <CreditCard size={20}/> FINALIZAR
                            </button>
                        </div>
                        )}
                        {!waiterMode && orderDestination === 'Tienda' && (
                            <button
                                type="button"
                                disabled={cart.length === 0}
                                onClick={openSplit}
                                data-tour="split"
                                className="w-full mt-2 py-2.5 rounded-xl border border-carbon-950/15 bg-white text-carbon-800 text-[11px] font-black tracking-wide hover:border-agave-400 disabled:opacity-40 transition-all"
                            >DIVIDIR CUENTA / PAGO MIXTO</button>
                        )}
                    </div>
                </div>
            </div>
        </div>

    </div>
    )}

    {/* Modifier Selection Modal */}
    {isModModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-lg shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-carbon-950/10">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Personalizar</h4>
                    <h3 className="text-xl font-bold text-carbon-950">{selectedProduct.name}</h3>
                </div>
                
                <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh] no-scrollbar">
                    {(() => {
                        const activeGroups = productGroups(selectedProduct, modifierGroups);
                        return activeGroups.map(group => {
                            const gid = group.id;
                            const selection = pendingModifiers.find(pm => pm.groupId === gid)?.modifiers || [];

                            return (
                                <div key={gid} className="space-y-3">
                                    <div className="flex justify-between items-center">
                                        <h5 className="font-bold text-slate-200 text-sm">{group.name}</h5>
                                        <span className="text-[10px] bg-slate-950 text-slate-500 px-2 py-0.5 rounded-full border border-carbon-950/10 uppercase font-black">
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
                                                            : "bg-slate-950 border-carbon-950/10 text-slate-400 hover:text-carbon-950"
                                                    )}
                                                >
                                                    <div className="text-xs font-bold leading-tight">{opt.name}</div>
                                                    {opt.extraPrice > 0 && <div className={cn("text-[10px] font-bold mt-1", isSelected ? "text-indigo-700" : "text-emerald-500")}>+${opt.extraPrice}</div>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        });
                    })()}

                    <div className="pt-4 border-t border-carbon-950/10 space-y-2">
                         <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Notas</label>
                         <input 
                            type="text"
                            placeholder="Ej. Sin cebolla, salsa aparte"
                            value={customerNote}
                            onChange={(e) => setCustomerNote(e.target.value)}
                            className="w-full bg-slate-950 border border-carbon-950/10 rounded-xl px-4 py-3 text-sm text-carbon-950 font-medium focus:ring-1 focus:ring-indigo-500 outline-none transition-all placeholder:text-slate-500"
                         />
                    </div>
                </div>

                <div className="p-6 bg-slate-800/10 border-t border-carbon-950/10 flex gap-4">
                    <button onClick={() => setIsModModalOpen(false)} className="flex-grow py-4 rounded-2xl font-bold text-slate-500 hover:text-carbon-950 transition-all">CANCELAR</button>
                    <button 
                        onClick={() => addToCart(selectedProduct.id, pendingModifiers, customerNote)}
                        className="flex-[2] bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-2xl shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 transition-all active:scale-95"
                    >AGREGAR A LA ORDEN</button>
                </div>
            </div>
        </div>
    )}

    {/* --- CHANGE CALCULATOR MODAL --- */}
    {isChangeModalOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-3 bg-carbon-950/35 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-md max-h-[calc(100dvh-1.5rem)] shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="shrink-0 px-5 py-3 bg-slate-800/30 border-b border-carbon-950/10">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Calculadora de Cambio</h4>
                    <h3 className="text-xl font-bold text-carbon-950">Pago en {paymentMethod.toUpperCase()}</h3>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    <div className="flex justify-between items-baseline">
                        <span className="text-sm font-bold text-slate-500">Total a Cobrar:</span>
                        <span className="text-3xl font-black text-carbon-950">${money(chargeTotal)}</span>
                    </div>

                    <div className="space-y-2.5">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Monto Recibido</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-600">$</span>
                            <input 
                                type="number"
                                autoFocus
                                value={receivedAmount}
                                onChange={(e) => setReceivedAmount(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && Number(receivedAmount) >= chargeTotal) { setIsChangeModalOpen(false); processCheckout(); } }}
                                placeholder="0.00"
                                className="w-full bg-white border-2 border-carbon-950/10 rounded-2xl pl-10 pr-6 py-3 text-3xl font-black text-carbon-950 outline-none focus:border-indigo-500 transition-all placeholder:text-slate-500"
                            />
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                            {[20, 50, 100, 200, 500].map(bill => (
                                <button 
                                    key={bill}
                                    onClick={() => setReceivedAmount(bill.toString())}
                                    className="py-3 rounded-xl bg-slate-800 border border-carbon-950/10 text-sm font-black text-slate-300 hover:bg-slate-700 hover:text-carbon-950 transition-all"
                                >
                                    ${bill}
                                </button>
                            ))}
                            <button 
                                onClick={() => setReceivedAmount(chargeTotal.toFixed(2))}
                                className="col-span-3 py-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-[10px] font-black text-indigo-400 hover:bg-indigo-500/20 transition-all"
                            >
                                EXACTO (${money(chargeTotal)})
                            </button>
                        </div>
                    </div>

                    {Number(receivedAmount) >= chargeTotal && (
                        <div className="px-5 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
                            <span className="text-xs font-bold text-emerald-500/80 uppercase">Cambio a entregar:</span>
                            <span className="text-3xl font-black text-emerald-400">${money((Number(receivedAmount) - chargeTotal))}</span>
                        </div>
                    )}
                </div>

                <div className="shrink-0 px-5 py-3 bg-slate-800/10 border-t border-carbon-950/10 flex gap-3">
                    <button onClick={() => setIsChangeModalOpen(false)} className="flex-grow py-3 rounded-2xl font-bold text-slate-500 hover:text-carbon-950 transition-all">CANCELAR</button>
                    <button 
                        disabled={!receivedAmount || Number(receivedAmount) < chargeTotal}
                        onClick={() => {
                            setIsChangeModalOpen(false);
                            processCheckout();
                        }}
                        className="flex-[2] bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none text-white font-black py-3 rounded-2xl shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-emerald-500/20 transition-all active:scale-95"
                    >FINALIZAR Y COBRAR</button>
                </div>
            </div>
        </div>
    )}

    {splitOpen && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-md max-h-[92vh] shadow-[0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col overflow-hidden">
                <div className="p-5 bg-slate-800/30 border-b border-carbon-950/10">
                    <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Cobrar</h4>
                    <h3 className="text-xl font-bold text-carbon-950">Total ${money(chargeTotal)}</h3>
                    <div className="grid grid-cols-3 gap-1 mt-3">
                        {([['mixto', 'PAGO MIXTO'], ['iguales', 'PARTES IGUALES'], ['platillos', 'POR PLATILLOS']] as const).map(([k, l]) => (
                            <button key={k} type="button" onClick={() => { setSplitTab(k); setSplitError(''); }} className={cn("rounded-lg py-2 text-[10px] font-black border", splitTab === k ? "bg-agave-600 text-white border-agave-600" : "bg-white text-carbon-700 border-carbon-950/15")}>{l}</button>
                        ))}
                    </div>
                </div>
                <div className="p-5 space-y-4 overflow-y-auto">
                    {splitTab === 'mixto' && (
                        <>
                            <p className="text-xs text-carbon-600">Una parte con un método y el resto con el otro.</p>
                            <div className="grid grid-cols-2 gap-2">
                                {(['Efectivo', 'Tarjeta'] as POSPaymentMethod[]).map((m) => (
                                    <button key={m} type="button" onClick={() => setMixFirst(m)} className={cn("rounded-lg py-2 text-[11px] font-black border", mixFirst === m ? "bg-carbon-950 text-white border-carbon-950" : "bg-white text-carbon-700 border-carbon-950/15")}>Primero {m.toUpperCase()}</button>
                                ))}
                            </div>
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Paga en {mixFirst.toLowerCase()}</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black text-slate-600">$</span>
                                <input type="number" inputMode="decimal" autoFocus value={mixCash} onChange={(e) => { setMixCash(e.target.value); setSplitError(''); }} placeholder="100" className="w-full bg-white border-2 border-carbon-950/10 rounded-2xl pl-10 pr-6 py-4 text-2xl font-black text-carbon-950 outline-none focus:border-indigo-500" />
                            </div>
                            <div className="flex justify-between items-baseline rounded-2xl bg-white border border-carbon-950/10 px-4 py-3">
                                <span className="text-xs font-bold text-slate-500 uppercase">Resto en {otherMethod(mixFirst).toLowerCase()}</span>
                                <span className="text-2xl font-black text-carbon-950">${money(Math.max(0, chargeTotal - (Number(mixCash) || 0)))}</span>
                            </div>
                        </>
                    )}
                    {splitTab === 'iguales' && (
                        <>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-carbon-700">¿Entre cuántas personas?</span>
                                <div className="flex items-center gap-3">
                                    <button type="button" onClick={() => setWays((w) => Math.max(2, w - 1))} className="w-9 h-9 rounded-lg border border-carbon-950/15 bg-white font-black"><Minus size={14} className="mx-auto" /></button>
                                    <span className="text-2xl font-black w-6 text-center">{ways}</span>
                                    <button type="button" onClick={() => setWays((w) => Math.min(8, w + 1))} className="w-9 h-9 rounded-lg border border-carbon-950/15 bg-white font-black"><Plus size={14} className="mx-auto" /></button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                {equalAmounts.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 rounded-xl bg-white border border-carbon-950/10 px-3 py-2">
                                        <span className="text-xs font-black text-carbon-700 w-16">Persona {i + 1}</span>
                                        <span className="flex-grow text-lg font-black text-carbon-950">${money(a)}</span>
                                        {(['Efectivo', 'Tarjeta'] as POSPaymentMethod[]).map((m) => (
                                            <button key={m} type="button" onClick={() => setWayMethods((w) => w.map((x, j) => (j === i ? m : x)))} className={cn("rounded-lg px-2 py-1 text-[10px] font-black border", (wayMethods[i] || 'Efectivo') === m ? "bg-carbon-950 text-white border-carbon-950" : "bg-white text-carbon-600 border-carbon-950/15")}>{m === 'Efectivo' ? 'EFECT.' : 'TARJ.'}</button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {splitTab === 'platillos' && (
                        <>
                            <p className="text-xs text-carbon-600">Marca lo que paga esta persona. Lo demás se queda en la orden para cobrarlo después.</p>
                            <div className="space-y-2">
                                {cart.map((it) => {
                                    const q = pickQty[it.cartId] || 0;
                                    const name = rows.find((r) => r.id === it.rowId)?.name || 'Producto';
                                    return (
                                        <div key={it.cartId} className="flex items-center gap-2 rounded-xl bg-white border border-carbon-950/10 px-3 py-2">
                                            <div className="flex-grow min-w-0">
                                                <p className="text-xs font-black text-carbon-950 truncate">{name}</p>
                                                <p className="text-[10px] text-slate-500">{it.quantity} en la cuenta · ${money(getItemPrice(it.rowId, it.selectedModifiers))} c/u</p>
                                            </div>
                                            <button type="button" onClick={() => setPickQty((p) => ({ ...p, [it.cartId]: Math.max(0, q - 1) }))} className="w-8 h-8 rounded-lg border border-carbon-950/15"><Minus size={12} className="mx-auto" /></button>
                                            <span className="w-5 text-center font-black">{q}</span>
                                            <button type="button" onClick={() => setPickQty((p) => ({ ...p, [it.cartId]: Math.min(it.quantity, q + 1) }))} className="w-8 h-8 rounded-lg border border-carbon-950/15"><Plus size={12} className="mx-auto" /></button>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-between items-baseline rounded-2xl bg-white border border-carbon-950/10 px-4 py-3">
                                <span className="text-xs font-bold text-slate-500 uppercase">Esta parte</span>
                                <span className="text-2xl font-black text-carbon-950">${money(pickedTotal)}</span>
                            </div>
                        </>
                    )}
                    {splitError && <p className="text-[11px] font-bold text-rose-600">{splitError}</p>}
                </div>
                <div className="p-5 border-t border-carbon-950/10 flex gap-3">
                    <button type="button" onClick={() => setSplitOpen(false)} className="flex-grow py-4 rounded-2xl font-bold text-slate-500">CANCELAR</button>
                    <button type="button" onClick={splitTab === 'mixto' ? confirmMixto : splitTab === 'iguales' ? confirmIguales : confirmPlatillos} className="flex-[2] bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-2xl active:scale-95">
                        {splitTab === 'platillos' ? 'COBRAR ESTA PARTE' : 'FINALIZAR Y COBRAR'}
                    </button>
                </div>
            </div>
        </div>
    )}

    {/* --- PIN SECURITY MODAL --- */}
    {isPinModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-sm shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-carbon-950/10 text-center">
                    <div className="w-12 h-12 bg-pink-500/20 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock size={24} />
                    </div>
                    <h3 className="text-xl font-bold text-carbon-950">Autorización Requerida</h3>
                    <p className="text-slate-400 text-xs mt-2">Escribe el PIN del dueño o de un gerente para continuar.</p>
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
                            "w-full bg-slate-950 border-2 rounded-2xl text-center text-4xl tracking-[0.5em] font-black text-carbon-950 py-4 outline-none transition-all",
                            pinError ? "border-rose-500 text-rose-500" : "border-carbon-950/10 focus:border-indigo-500"
                        )}
                    />
                    {pinError && <div className="text-rose-500 text-xs font-bold text-center mt-3 animate-pulse">PIN INCORRECTO</div>}
                    
                    <div className="grid grid-cols-2 gap-3 mt-6">
                        <button onClick={() => setIsPinModalOpen(false)} className="py-3 rounded-xl font-bold text-slate-500 hover:text-carbon-950 transition-all bg-slate-800/50">CANCELAR</button>
                        <button onClick={handlePinSubmit} className="py-3 rounded-xl font-black text-white bg-pink-500 hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95">AUTORIZAR</button>
                    </div>
                </div>
            </div>
        </div>
    )}

    {/* --- TICKETS ABIERTOS MODAL --- */}
    {isTicketsModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print">
            <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl w-full max-w-2xl shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-800/30 border-b border-carbon-950/10 flex justify-between items-center">
                    <div>
                        <h4 className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">Pendientes</h4>
                        <h3 className="text-xl font-bold text-carbon-950">Tickets Abiertos</h3>
                    </div>
                    <button onClick={() => setIsTicketsModalOpen(false)} className="text-slate-500 hover:text-carbon-950">CERRAR</button>
                </div>

                <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh] no-scrollbar">
                    {openTickets.length === 0 ? (
                        <div className="text-center py-20 text-slate-600">
                            <History size={48} className="mx-auto mb-4 opacity-5"/>
                            <p className="text-sm font-medium">No hay tickets guardados</p>
                        </div>
                    ) : (
                        openTickets.map(ticket => (
                            <div key={ticket.id} className="bg-slate-950/50 border border-carbon-950/10 p-4 rounded-2xl flex items-center justify-between group hover:border-carbon-950/10 transition-all">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded-full font-black border border-indigo-500/20">{orderTypeLabel(ticket) || ticket.destination.toUpperCase()}</span>
                                        <span className="text-sm font-bold text-carbon-950">{ticket.customerName}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-600 font-medium">
                                        Creado: {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {ticket.items.length} artículos{ticket.waiterName ? ` • ${ticket.waiterName}` : ''}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-lg font-black text-carbon-950">${money(ticket.total)}</div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => requirePin(() => deleteOpenTicket(ticket.id))}
                                            className="p-2 text-slate-500 hover:text-rose-500 transition-colors"
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

                {newProd && (
                    <div className="fixed inset-0 z-[120] overflow-y-auto bg-carbon-950/40 backdrop-blur-sm no-print" onClick={() => setNewProd(null)}>
                        <div className="min-h-full flex items-center justify-center p-4 pb-24">
                        <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-lg font-bold text-carbon-950">Agregar producto</h3>
                            <label className="block text-xs font-bold text-slate-500">Nombre
                                <input autoFocus value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveNewProduct()} placeholder="Ej. Agua 1 litro" className="mt-1 w-full rounded-xl border border-carbon-950/15 px-3 py-2.5 text-sm text-carbon-950 outline-none focus:border-agave-500" />
                            </label>
                            <label className="block text-xs font-bold text-slate-500">Precio en tienda
                                <input inputMode="decimal" value={newProd.price} onChange={(e) => setNewProd({ ...newProd, price: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveNewProduct()} placeholder="0.00" className="mt-1 w-full rounded-xl border border-carbon-950/15 px-3 py-2.5 text-sm text-carbon-950 outline-none focus:border-agave-500" />
                            </label>
                            <label className="block text-xs font-bold text-slate-500">Categoría
                                <select value={newProd.categoryId} onChange={(e) => setNewProd({ ...newProd, categoryId: e.target.value })} className="mt-1 w-full rounded-xl border border-carbon-950/15 px-3 py-2.5 text-sm text-carbon-950 outline-none bg-white">
                                    <option value="">Sin categoría</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </label>
                            {modifierGroups.length > 0 && (
                                <div className="text-xs font-bold text-slate-500">Modificadores
                                    <div className="mt-1 max-h-48 overflow-y-auto rounded-xl border border-carbon-950/15 divide-y divide-carbon-950/[0.06]">
                                        {modifierGroups.map(g => {
                                            const byCat = groupByCategory({ categoryId: newProd.categoryId }, g);
                                            const checked = byCat ? !newProd.off.includes(g.id) : newProd.mods.includes(g.id);
                                            return (
                                                <label key={g.id} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-carbon-950 cursor-pointer hover:bg-agave-50">
                                                    <input type="checkbox" checked={checked} onChange={(e) => {
                                                        const on = e.target.checked;
                                                        setNewProd(byCat
                                                            ? { ...newProd, off: on ? newProd.off.filter(x => x !== g.id) : [...newProd.off, g.id] }
                                                            : { ...newProd, mods: on ? [...newProd.mods, g.id] : newProd.mods.filter(x => x !== g.id) });
                                                    }} className="w-4 h-4 accent-emerald-600 shrink-0" />
                                                    <span className={cn("flex-1 min-w-0 break-words", !checked && "text-slate-500")}>{g.name}</span>
                                                    {byCat && <span className={cn("shrink-0 text-[10px]", checked ? "font-normal text-slate-500" : "font-bold text-rose-500")}>{checked ? 'por su categoría' : 'quitado'}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            <div className="text-xs font-bold text-slate-500">Color del botón
                                <ColorSwatches value={newProd.color} onChange={(c) => setNewProd({ ...newProd, color: c })} />
                            </div>
                            <p className="text-[11px] text-slate-500">Los precios de apps y la foto los ajustas en Menú / Plataformas.</p>
                            <div className="flex gap-2 pt-1">
                                <button type="button" onClick={() => setNewProd(null)} className="flex-1 py-2.5 rounded-xl border border-carbon-950/15 font-bold text-sm">Cancelar</button>
                                <button type="button" onClick={saveNewProduct} className="flex-1 py-2.5 rounded-xl bg-agave-600 text-white font-black text-sm">GUARDAR</button>
                            </div>
                        </div>
                        </div>
                    </div>
                )}
                {colorFor && (() => {
                    const ep = allRows.find(r => r.id === colorFor.id) || colorFor;
                    return (
                    <div className="fixed inset-0 z-[120] overflow-y-auto bg-carbon-950/40 backdrop-blur-sm no-print" onClick={() => setColorFor(null)}>
                        <div className="min-h-full flex items-center justify-center p-4 pb-24">
                        <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                            <h3 className="text-base font-bold text-carbon-950 break-words">{ep.name}</h3>
                            <div className="text-xs font-bold text-slate-500">Color del botón
                                <ColorSwatches value={ep.color || ''} onChange={(c) => menu?.updateRow?.(ep.id, { color: c || undefined })} />
                            </div>
                            <div className="text-xs font-bold text-slate-500">Días que se vende
                                <div className="mt-1 grid grid-cols-7 gap-1">
                                    {DAY_ORDER.map(x => {
                                        const all = !hasDayLimit(ep.days);
                                        const on = all || ep.days!.includes(x);
                                        return (
                                            <button key={x} type="button" title={DAY_NAMES[x]} aria-pressed={on}
                                                onClick={() => {
                                                    const cur = all ? [] : ep.days!;
                                                    // Con «todos» activo, tocar un día = solo ese día
                                                    const next = all ? [x] : on ? cur.filter(y => y !== x) : [...cur, x];
                                                    menu?.updateRow?.(ep.id, { days: next.length === 0 || next.length === 7 ? undefined : next.sort() });
                                                }}
                                                className={cn("h-9 rounded-lg text-xs font-black transition-colors", on ? (all ? "bg-carbon-100 text-carbon-700" : "bg-agave-600 text-white") : "bg-white text-carbon-400 shadow-[inset_0_0_0_1px_rgba(13,16,14,0.12)]")}>
                                                {DAY_NAMES[x].slice(0, 2).replace(/^./, c => c.toUpperCase())}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="mt-1 text-[10px] font-normal text-slate-500">{hasDayLimit(ep.days) ? `${daysLabel(ep.days)}. En tu tienda en línea los otros días sale apagado y el día que toca sale hasta arriba en «Promos de hoy».` : 'Todos los días. Para una promo de un día (ej. martes), toca ese día.'}</p>
                                {hasDayLimit(ep.days) && <button type="button" onClick={() => menu?.updateRow?.(ep.id, { days: undefined })} className="mt-1 text-[11px] font-bold text-agave-700 underline">Vender todos los días</button>}
                            </div>
                            {isOwner && modifierGroups.length > 0 && (
                                <div className="text-xs font-bold text-slate-500">Modificadores que lleva
                                    <div className="mt-1 max-h-[45vh] overflow-y-auto rounded-xl bg-carbon-50 divide-y divide-carbon-950/[0.06]">
                                        {modifierGroups.map(g => {
                                            const byCat = groupByCategory(ep, g);
                                            const checked = productHasGroup(ep, g);
                                            return (
                                                <label key={g.id} className="flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-carbon-950 cursor-pointer hover:bg-agave-50">
                                                    <input type="checkbox" checked={checked} onChange={(e) => menu?.updateRow?.(ep.id, toggleProductGroup(ep, g, e.target.checked))} className="w-5 h-5 accent-emerald-600 shrink-0" />
                                                    <span className={cn("flex-1 min-w-0 break-words", !checked && "text-slate-500")}>{g.name}</span>
                                                    {byCat && <span className={cn("shrink-0 text-[10px]", checked ? "font-normal text-slate-500" : "font-bold text-rose-500")}>{checked ? 'por su categoría' : 'quitado'}</span>}
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <p className="mt-1 text-[10px] font-normal text-slate-500">Solo cambia este producto. Los demás de la categoría quedan igual.</p>
                                </div>
                            )}
                            <button type="button" onClick={() => setColorFor(null)} className="w-full py-2.5 rounded-xl bg-agave-600 font-black text-sm text-white">LISTO</button>
                        </div>
                        </div>
                    </div>
                    );
                })()}
    {/* --- HIDDEN TICKETS FOR PRINTING --- */}
    {lastOrder && (
        <PrintArea kind="ticket" paper={settings.paperSize}>
            {/* Customer Ticket */}
            {settings.printCustomerTicket && !lastOrder.kitchenOnly && (
                <POSTicket 
                    items={lastOrder.items}
                    total={lastOrder.total}
                    paymentMethod={lastOrder.paymentMethod}
                    payments={lastOrder.payments}
                    splitWays={lastOrder.splitWays}
                    destination={lastOrder.destination}
                    customerName={lastOrder.customerName}
                    orderLines={lastOrder.orderLines}
                    paperSize={settings.paperSize}
                    receivedAmount={lastOrder.receivedAmount}
                    discountAmount={lastOrder.discountAmount}
                    tip={lastOrder.tip}
                    businessName={settings.businessName}
                    businessPhone={settings.businessPhone}
                    businessAddress={settings.businessAddress}
                />
            )}
            
            {/* Separator for thermal paper if both are printed */}
            {settings.printCustomerTicket && settings.printKitchenTicket && !lastOrder.kitchenOnly && (
                settings.paperSize === 'Standard'
                    ? <div className="print-page-break" />
                    : <div className="h-10 border-b border-black border-dashed mb-10" />
            )}

            {/* Kitchen Ticket (No prices) */}
            {settings.printKitchenTicket && (
                <POSTicket 
                    items={lastOrder.items}
                    total={lastOrder.total}
                    paymentMethod={lastOrder.paymentMethod}
                    payments={lastOrder.payments}
                    splitWays={lastOrder.splitWays}
                    destination={lastOrder.destination}
                    customerName={lastOrder.customerName}
                    orderLines={lastOrder.orderLines}
                    isKitchen={true}
                    waiterName={lastOrder.waiterName}
                    paperSize={settings.paperSize}
                    businessName={settings.businessName}
                />
            )}
        </PrintArea>
    )}

    {/* Celular/tablet: ir a la orden (está arriba) */}
    {cart.length > 0 && !cartVisible && !quick && (
        <button type="button" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] no-print inline-flex items-center gap-2 rounded-full bg-agave-600 px-5 py-3 text-sm font-black text-white shadow-[0_12px_28px_-10px_rgba(14,111,77,0.7)]">
            <ShoppingCart size={18} /> Ver orden ({cart.reduce((a, i) => a + i.quantity, 0)}) · ${money(waiterMode ? finalTotal : chargeTotal)}
        </button>
    )}

    {/* Toast notification */}
    {toast && (
        <div className="fixed bottom-8 right-8 z-[200] bg-emerald-500 text-white px-5 py-3 rounded-xl font-bold text-sm shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] shadow-emerald-500/30 flex items-center gap-2 animate-in slide-in-from-bottom-3 duration-200 no-print">
            <CheckCircle size={16} />
            {toast}
        </div>
    )}
    </>
  );
}

function ColorSwatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="mt-1 grid grid-cols-5 gap-2">
      <button type="button" onClick={() => onChange('')} aria-pressed={!value} title="Sin color"
        className={cn("h-10 rounded-xl bg-white text-[10px] font-bold text-carbon-500 shadow-[inset_0_0_0_1px_rgba(13,16,14,0.12)]", !value && "ring-2 ring-carbon-950 ring-offset-1")}>Sin</button>
      {PRODUCT_COLORS.map(c => (
        <button key={c.id} type="button" onClick={() => onChange(c.id)} aria-pressed={value === c.id} title={c.name} aria-label={c.name}
          style={{ background: c.bg, boxShadow: `inset 0 -4px 0 ${c.bar}` }}
          className={cn("h-10 rounded-xl grid place-items-center", value === c.id && "ring-2 ring-carbon-950 ring-offset-1")}>
          {value === c.id && <Check size={14} strokeWidth={3} style={{ color: c.bar }} />}
        </button>
      ))}
    </div>
  );
}
