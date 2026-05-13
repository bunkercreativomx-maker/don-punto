import { useState, useEffect } from 'react';
import { useCalculator } from './hooks/useCalculator';
import type { Platform, PaymentMethod } from './types/calculator';
import { BarChart3, ShoppingBasket, Calculator, Layers, User, LineChart, Settings, Plus, Lock, Key, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ProfitGrid } from './components/ProfitGrid';
import { PricingGrid } from './components/PricingGrid';
import { POSDashboard } from './components/pos/POSDashboard';
import { MenuManagement } from './components/pos/MenuManagement';
import { POSReports } from './components/pos/POSReports';
import { LandingPage } from './components/landing/LandingPage';
import { AuthPage } from './components/auth/AuthPage';
import { SubscriptionGate } from './components/auth/SubscriptionGate';
import { MenuScannerModal } from './components/pos/MenuScannerModal';
import { usePOS } from './hooks/usePOS';
import { supabase } from './lib/supabase';
import { Building2, Phone, MapPin, PrinterIcon } from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showAuthFlow, setShowAuthFlow] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  
  const [activeTab, setActiveTab] = useState<'profits' | 'pricing' | 'pos' | 'menu' | 'reports' | 'settings'>('profits');

  // Supabase Auth Listener
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session) {
            setIsAuthenticated(true);
            try {
                // Buscar el restaurante del dueño
                const { data: restaurant, error } = await supabase
                    .from('restaurants')
                    .select('subscription_status')
                    .eq('owner_id', session.user.id)
                    .single();
                
                if (error) {
                    console.warn("Advertencia al buscar restaurante (puede no existir aún):", error);
                    setSubscriptionStatus('inactive');
                    return;
                }
                
                if (restaurant && restaurant.subscription_status === 'active') {
                    setSubscriptionStatus('active');
                } else {
                    setSubscriptionStatus('inactive');
                }
            } catch (err) {
                console.error("Error crítico al validar sesión de restaurante:", err);
                setSubscriptionStatus('inactive');
            }
        } else {
            setIsAuthenticated(false);
            setSubscriptionStatus('inactive'); // Si no está logueado, lógicamente inactivo
        }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSimulatePayment = async () => {
      // Para efectos del prototipo, esto simula que Stripe aprobó el pago
      // y actualizamos el status en la base de datos de Supabase real
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          await supabase
              .from('restaurants')
              .update({ subscription_status: 'active' })
              .eq('owner_id', user.id);
      }
      setSubscriptionStatus('active');
  };
  
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const {
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
  } = useCalculator();

  const { settings: posSettings, updateSettings: updatePosSettings } = usePOS();

  // Settings PIN State
  const [isSettingsPinModalOpen, setIsSettingsPinModalOpen] = useState(false);
  const [settingsPinInput, setSettingsPinInput] = useState('');
  const [settingsPinError, setSettingsPinError] = useState(false);

  const handleSettingsClick = () => {
      setSettingsPinInput('');
      setSettingsPinError(false);
      setIsSettingsPinModalOpen(true);
  };

  const handleSettingsPinSubmit = () => {
      const validPin = posSettings.adminPin || '1234';
      if (settingsPinInput === validPin) {
          setIsSettingsPinModalOpen(false);
          setActiveTab('settings');
      } else {
          setSettingsPinError(true);
          setSettingsPinInput('');
      }
  };

  if (!isAuthenticated) {
    if (showAuthFlow) {
        return <AuthPage onAuthSuccess={() => setIsAuthenticated(true)} />;
    }
    return <LandingPage onLogin={() => setShowAuthFlow(true)} onSubscribe={() => setShowAuthFlow(true)} />;
  }

  return (
    <SubscriptionGate 
        status={subscriptionStatus} 
        onSimulatePayment={handleSimulatePayment}
    >
      <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 flex overflow-hidden">
      
      {/* --- AI MENU SCANNER MODAL --- */}
      {isScannerOpen && (
          <MenuScannerModal 
              onClose={() => setIsScannerOpen(false)} 
              onScanSuccess={(mockProducts) => {
                  addProducts(mockProducts);
              }}
          />
      )}

      {/* --- SETTINGS PIN MODAL --- */}
      {isSettingsPinModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md no-print">
              <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 bg-slate-800/30 border-b border-white/10 text-center">
                      <div className="w-12 h-12 bg-pink-500/20 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Lock size={24} />
                      </div>
                      <h3 className="text-xl font-bold text-white">Configuración del Sistema</h3>
                      <p className="text-slate-400 text-xs mt-2">Ingresa el PIN de administrador para acceder a los ajustes.</p>
                  </div>
                  <div className="p-6">
                      <input 
                          type="password"
                          autoFocus
                          value={settingsPinInput}
                          onChange={(e) => setSettingsPinInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSettingsPinSubmit()}
                          placeholder="••••"
                          className={cn(
                              "w-full bg-slate-950 border-2 rounded-2xl text-center text-4xl tracking-[0.5em] font-black text-white py-4 outline-none transition-all",
                              settingsPinError ? "border-rose-500 text-rose-500" : "border-white/10 focus:border-indigo-500"
                          )}
                      />
                      {settingsPinError && <div className="text-rose-500 text-xs font-bold text-center mt-3 animate-pulse">PIN INCORRECTO</div>}
                      
                      <div className="grid grid-cols-2 gap-3 mt-6">
                          <button onClick={() => setIsSettingsPinModalOpen(false)} className="py-3 rounded-xl font-bold text-slate-500 hover:text-white transition-all bg-slate-800/50">CANCELAR</button>
                          <button onClick={handleSettingsPinSubmit} className="py-3 rounded-xl font-black text-white bg-pink-500 hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95">ACCEDER</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- PREMIUM SIDEBAR --- */}
      <nav className="w-20 bg-slate-900/40 border-r border-white/5 flex flex-col items-center py-8 gap-10 relative z-30 backdrop-blur-xl shrink-0 no-print">
        <div className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 cursor-pointer hover:border-white/20 transition-all">
          <User size={24} />
        </div>

        <div className="flex flex-col gap-6 flex-grow">
          <button onClick={() => setActiveTab('profits')} className={cn("p-3 rounded-2xl transition-all duration-300 relative group", activeTab === 'profits' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-500/5" : "text-slate-500 hover:text-slate-300")}>
            <BarChart3 size={24} />
            {activeTab === 'profits' && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-emerald-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('pricing')} className={cn("p-3 rounded-2xl transition-all duration-300 relative group", activeTab === 'pricing' ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300")}>
            <Calculator size={24} />
            {activeTab === 'pricing' && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-indigo-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('pos')} className={cn("p-3 rounded-2xl transition-all duration-300 relative group", activeTab === 'pos' ? "bg-pink-500/10 text-pink-500 border border-pink-500/20" : "text-slate-500 hover:text-slate-300")}>
            <ShoppingBasket size={24} />
            {activeTab === 'pos' && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-pink-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('reports')} className={cn("p-3 rounded-2xl transition-all duration-300 relative group", activeTab === 'reports' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-slate-500 hover:text-slate-300")}>
            <LineChart size={24} />
            {activeTab === 'reports' && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-cyan-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('menu')} className={cn("p-3 rounded-2xl transition-all duration-300 relative group", activeTab === 'menu' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "text-slate-500 hover:text-slate-300")}>
            <Layers size={24} />
            {activeTab === 'menu' && <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-amber-500 rounded-r-full" />}
          </button>
        </div>

        <div className="mt-auto flex flex-col gap-4">
             <button onClick={handleSettingsClick} className={cn("p-3 rounded-2xl transition-all", activeTab === 'settings' ? "bg-white/10 text-white" : "text-slate-600 hover:text-slate-400")}>
                <Settings size={24} />
             </button>
             <button onClick={() => supabase.auth.signOut()} className="p-3 rounded-2xl transition-all text-slate-600 hover:text-rose-400 group relative">
                <Lock size={24} />
             </button>
        </div>
      </nav>

      <div className="flex-grow relative flex overflow-hidden">
        <div className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] opacity-20 blur-[120px] pointer-events-none transition-colors duration-1000 no-print",
            settings.platform === 'Uber' && "bg-green-600",
            settings.platform === 'Didi' && "bg-orange-600",
            settings.platform === 'Rappi' && "bg-pink-600"
        )} />

        <div className="flex-grow px-8 py-10 overflow-auto relative z-10 no-scrollbar">
          <div className="max-w-7xl mx-auto">
            <header className="mb-10 flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4 no-print">
              <div>
                <h1 className="text-4xl font-black text-white tracking-tighter">
                  {activeTab === 'profits' && 'Análisis de Ganancias'}
                  {activeTab === 'pricing' && 'Estrategia de Precios'}
                  {activeTab === 'pos' && 'Punto de Venta POS'}
                  {activeTab === 'reports' && 'Reportes e Historial'}
                  {activeTab === 'menu' && 'Catálogo de Productos'}
                  {activeTab === 'settings' && 'Ajustes del Sistema'}
                </h1>
                <p className="text-slate-500 mt-2 font-medium tracking-wide">
                  {activeTab === 'profits' && `Desglose matemático de retorno para ${settings.platform}.`}
                  {activeTab === 'pricing' && 'Calcula precios sugeridos para no perder ni un peso en plataformas.'}
                  {activeTab === 'pos' && 'Registra tus ventas y personaliza pedidos en tiempo real.'}
                  {activeTab === 'reports' && 'Analiza tu IVA y revisa el historial de transacciones pasadas.'}
                  {activeTab === 'menu' && 'Administra tus categorías, modificadores y catálogo.'}
                  {activeTab === 'settings' && 'Personaliza tu plataforma, régimen y métodos de pago.'}
                </p>
              </div>
              
              {(activeTab === 'profits' || activeTab === 'pricing' || activeTab === 'menu') && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsScannerOpen(true)}
                        className="bg-slate-900 border border-indigo-500/30 hover:bg-slate-800 text-indigo-400 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-500/10 active:scale-95 flex items-center gap-2"
                    >
                        <Sparkles size={18} /> ESCANEAR MENÚ
                    </button>
                    {(activeTab === 'profits' || activeTab === 'pricing') && (
                        <button
                          onClick={addRow}
                          className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
                        >
                          <Plus size={18} strokeWidth={3} /> AGREGAR PRODUCTO
                        </button>
                    )}
                </div>
              )}
            </header>

            <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {activeTab === 'profits' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-9">
                        <ProfitGrid rows={rows} results={results} updateRow={updateRow} removeRow={removeRow} addRow={addRow} />
                    </div>
                    <div className="lg:col-span-3">
                         <div className="bg-slate-900/40 backdrop-blur-2xl border border-white/5 rounded-3xl p-6 shadow-2xl relative group overflow-hidden">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">ROI Neto Estimado</p>
                            <div className="text-4xl font-black text-white tracking-tighter">
                                ${results.reduce((acc, r) => acc + r.netProfit, 0).toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
              )}
              {activeTab === 'pricing' && (
                <PricingGrid rows={rows} pricingResults={pricingResults} updateRow={updateRow} removeRow={removeRow} addRow={addRow} syncWithStorePrices={syncWithStorePrices} />
              )}
              {activeTab === 'pos' && <POSDashboard />}
              {activeTab === 'reports' && <POSReports />}
              {activeTab === 'menu' && (
                <MenuManagement 
                    categories={categories}
                    modifierGroups={modifierGroups}
                    products={rows}
                    addCategory={addCategory}
                    updateCategory={updateCategory}
                    removeCategory={removeCategory}
                    addModifierGroup={addModifierGroup}
                    updateModifierGroup={updateModifierGroup}
                    removeModifierGroup={removeModifierGroup}
                    updateProduct={updateRow}
                />
              )}
              {activeTab === 'settings' && (
                  <div className="max-w-2xl space-y-6">

                      {/* Business Info */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-white tracking-tight mb-1">Información del Negocio</h3>
                              <p className="text-[11px] text-slate-500">Aparece en el encabezado de todos tus tickets impresos.</p>
                          </div>
                          <div className="space-y-4">
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <Building2 size={16} className="text-indigo-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Nombre del Negocio</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessName || ''}
                                          onChange={(e) => updatePosSettings({ businessName: e.target.value })}
                                          placeholder="Ej: Las Alitas de Siempre"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <Phone size={16} className="text-emerald-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Teléfono</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessPhone || ''}
                                          onChange={(e) => updatePosSettings({ businessPhone: e.target.value })}
                                          placeholder="Ej: 656-123-4567"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <MapPin size={16} className="text-rose-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Dirección</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessAddress || ''}
                                          onChange={(e) => updatePosSettings({ businessAddress: e.target.value })}
                                          placeholder="Ej: Av. Juárez 123, Col. Centro"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                          </div>
                          {/* Print Settings */}
                          <div className="border-t border-white/5 pt-6 space-y-4">
                              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <PrinterIcon size={14} /> Configuración de Impresión
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: '58mm' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          (posSettings.paperSize || '58mm') === '58mm' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-white/5 text-slate-500 hover:text-white"
                                      )}
                                  >🖨️ Térmica 58mm</button>
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: 'Standard' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          posSettings.paperSize === 'Standard' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-white/5 text-slate-500 hover:text-white"
                                      )}
                                  >🖨️ Normal (A4/Carta)</button>
                              </div>
                          </div>
                      </div>

                      {/* Security Settings */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-rose-500 tracking-tight mb-1 flex items-center gap-2"><Lock size={18}/> Seguridad Antifraude</h3>
                              <p className="text-[11px] text-slate-500">Este PIN se solicitará para borrar tickets, eliminar productos y entrar a esta configuración.</p>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                              <Key size={16} className="text-rose-400 shrink-0" />
                              <div className="flex-1">
                                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">PIN de Administrador</div>
                                  <input
                                      type="password"
                                      maxLength={4}
                                      value={posSettings.adminPin || '1234'}
                                      onChange={(e) => updatePosSettings({ adminPin: e.target.value })}
                                      placeholder="1234"
                                      className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700 tracking-[0.5em]"
                                  />
                              </div>
                          </div>
                      </div>

                      {/* Calculator Settings */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-8">
                          <h3 className="text-base font-black text-white tracking-tight">Configuración de la Calculadora</h3>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Plataforma Principal</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Uber', 'Didi', 'Rappi'] as Platform[]).map((p) => (
                                <button key={p} onClick={() => updateSetting('platform', p)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.platform === p ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>{p.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Método de Cobro Predeterminado</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Efectivo', 'Transferencia', 'Tarjeta'] as PaymentMethod[]).map((method) => (
                                <button key={method} onClick={() => updateSetting('paymentMethod', method)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.paymentMethod === method ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>{method.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between p-6 bg-slate-950 rounded-2xl border border-white/5">
                            <div>
                                <div className="text-white font-bold">RFC Válido</div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">ISR RETENTION IMPACT</div>
                            </div>
                            <label className="relative flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only" checked={settings.hasValidRFC} onChange={(e) => updateSetting('hasValidRFC', e.target.checked)} />
                                <div className={cn("w-12 h-6 bg-slate-800 rounded-full transition-colors", settings.hasValidRFC && "bg-indigo-500")}>
                                    <div className={cn("absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform", settings.hasValidRFC && "translate-x-6")} />
                                </div>
                            </label>
                          </div>
                      </div>
                  </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
    </SubscriptionGate>
  );
}

export default App;
