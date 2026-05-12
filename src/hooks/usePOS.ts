import { useState, useEffect, useMemo } from 'react';
import type { POSTransaction, POSSettings, POSSummary, POSPaymentMethod, OrderDestination, OpenTicket, CartItem } from '../types/pos';

const STORAGE_KEY = 'delivery_calculator_pos_txs';
const SETTINGS_KEY = 'delivery_calculator_pos_settings';
const TICKETS_KEY = 'delivery_calculator_pos_tickets';

export function usePOS() {
  const [transactions, setTransactions] = useState<POSTransaction[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [openTickets, setOpenTickets] = useState<OpenTicket[]>(() => {
    const saved = localStorage.getItem(TICKETS_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<POSSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    return { 
      ivaPercentage: 16,
      printCustomerTicket: true,
      printKitchenTicket: true,
      paperSize: '58mm',
      adminPin: '1234',
      ...parsed
    };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem(TICKETS_KEY, JSON.stringify(openTickets));
  }, [openTickets]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const addTransaction = (amount: number, paymentMethod: POSPaymentMethod, destination: OrderDestination, notes?: string, customerName?: string, dateStr?: string) => {
    const newTx: POSTransaction = {
      id: crypto.randomUUID(),
      date: dateStr || new Date().toISOString(),
      amount,
      paymentMethod,
      destination,
      notes,
      customerName
    };
    setTransactions((prev) => [newTx, ...prev]);
  };

  const removeTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  const saveTicket = (customerName: string, destination: OrderDestination, items: CartItem[], total: number) => {
    const newTicket: OpenTicket = {
        id: crypto.randomUUID(),
        customerName: customerName || 'Cliente Genérico',
        createdAt: new Date().toISOString(),
        destination,
        items,
        total
    };
    setOpenTickets(prev => [newTicket, ...prev]);
  };

  const deleteOpenTicket = (id: string) => {
    setOpenTickets(prev => prev.filter(t => t.id !== id));
  };

  const updateSettings = (newSettings: Partial<POSSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const calculateSummaryInfo = (txs: POSTransaction[]): POSSummary => {
    const total = txs.reduce((acc, tx) => acc + tx.amount, 0);
    
    const byMethod = txs.reduce((acc, tx) => {
       acc[tx.paymentMethod] = (acc[tx.paymentMethod] || 0) + tx.amount;
       return acc;
    }, { Efectivo: 0, Didi: 0, Uber: 0, Rappi: 0, Tarjeta: 0, 'Didi Efectivo': 0 } as Record<POSPaymentMethod, number>);

    const byDestination = txs.reduce((acc, tx) => {
        const dest = tx.destination || 'Tienda';
        acc[dest] = (acc[dest] || 0) + tx.amount;
        return acc;
    }, { Tienda: 0, Uber: 0, Didi: 0, Rappi: 0 } as Record<OrderDestination, number>);
    
    const ivaFactor = settings.ivaPercentage / 100;
    const calculateIVAAmount = (amount: number) => amount - (amount / (1 + ivaFactor));
    
    const cashTotal = (byMethod['Efectivo'] || 0) + (byMethod['Didi Efectivo'] || 0);

    return {
      total,
      byMethod,
      byDestination,
      totalIVA: calculateIVAAmount(total),
      cashIVA: calculateIVAAmount(cashTotal)
    };
  };

  const summaries = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const dailyTxs = transactions.filter(tx => new Date(tx.date) >= startOfToday);
    const weeklyTxs = transactions.filter(tx => new Date(tx.date) >= startOfWeek);
    const monthlyTxs = transactions.filter(tx => new Date(tx.date) >= startOfMonth);
    const yearlyTxs = transactions.filter(tx => new Date(tx.date) >= startOfYear);

    return {
      daily: calculateSummaryInfo(dailyTxs),
      weekly: calculateSummaryInfo(weeklyTxs),
      monthly: calculateSummaryInfo(monthlyTxs),
      yearly: calculateSummaryInfo(yearlyTxs),
    };
  }, [transactions, settings.ivaPercentage]);

  return {
    transactions,
    openTickets,
    settings,
    summaries,
    addTransaction,
    removeTransaction,
    saveTicket,
    deleteOpenTicket,
    updateSettings,
    calculateSummaryInfo
  };
}
