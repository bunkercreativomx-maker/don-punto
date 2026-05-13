import React from 'react';
import { ArrowRight, CheckCircle2, DollarSign, Zap, TrendingUp, ShieldCheck, PieChart, Store, Calculator, Printer, Smartphone, Tablet, Monitor, Star, MessageSquare, Lock, Wifi, FileText, Layers } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';
import { POSDashboard } from '../pos/POSDashboard';
import { POSReports } from '../pos/POSReports';
import { PricingGrid } from '../PricingGrid';
import { useCalculator } from '../../hooks/useCalculator';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface LandingPageProps {
  onLogin: () => void;
  onSubscribe: () => void;
}

export function LandingPage({ onLogin, onSubscribe }: LandingPageProps) {
  const {
    rows,
    pricingResults,
    updateRow,
    removeRow,
    addRow,
    syncWithStorePrices,
  } = useCalculator([
    { id: '1', name: 'Pizza Suprema Grande', costPrice: 90, salePrice: 240, targetProfit: 150 },
    { id: '2', name: 'Hamburguesa Especial', costPrice: 45, salePrice: 125, targetProfit: 80 },
    { id: '3', name: 'Alitas BBQ (10 pzas)', costPrice: 60, salePrice: 160, targetProfit: 100 }
  ], { persist: false });

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-sans selection:bg-indigo-500/30 overflow-y-auto no-scrollbar relative w-full">
      {/* Background Effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[800px] bg-gradient-to-b from-indigo-900/20 via-[#020617] to-[#020617] blur-[100px] pointer-events-none rounded-full" />
      
      {/* Header */}
      <header className="relative z-10 w-full px-6 py-6 flex items-center justify-between border-b border-white/5 bg-[#020617]/50 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-black text-xl shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            D
          </div>
          <span className="text-2xl font-black text-white tracking-tight">Don Punto</span>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onLogin} className="text-slate-400 hover:text-white font-bold transition-colors text-sm">
            Iniciar Sesión
          </button>
          <button onClick={onSubscribe} className="bg-white text-black px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-200 transition-colors shadow-lg active:scale-95">
            Suscribirse
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 px-6 pt-24 pb-32">
        <div className="text-center max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold tracking-widest uppercase">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            La Mejor Solución del Mercado
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-[1.05]">
            Deja de Perder Dinero. <br className="hidden md:block"/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400">
              Multiplica tus Ganancias.
            </span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto font-medium leading-relaxed">
            El Punto de Venta definitivo para restaurantes y negocios que quieren dominar Uber Eats, Rappi y Didi Food sin sacrificar un solo peso de utilidad.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
            <button 
              onClick={onSubscribe}
              className="w-full sm:w-auto px-10 py-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-black text-xl transition-all shadow-[0_0_40px_rgba(99,102,241,0.4)] hover:shadow-[0_0_60px_rgba(99,102,241,0.6)] active:scale-95 flex items-center justify-center gap-3"
            >
              Comenzar Ahora <ArrowRight size={24} />
            </button>
          </div>
        </div>

        {/* Bento Grid Features - WITH REAL APP PREVIEWS */}
        <div className="mt-32 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter">Tu sistema real, <span className="text-indigo-400">en acción.</span></h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {/* Bento Box 1: POS Mockup (Large) */}
            <div className="md:col-span-8 bg-[#090D1F] border border-white/10 rounded-[2rem] overflow-hidden group hover:border-indigo-500/50 transition-all duration-500 relative shadow-2xl flex flex-col">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="p-10 relative z-10 shrink-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400"><Store size={24} /></div>
                  <h3 className="text-3xl font-black text-white">POS Ultra Rápido</h3>
                </div>
                <p className="text-slate-400 text-lg max-w-md">Gestiona pedidos en milisegundos. Diseñado para las horas pico de tu negocio. Olvídate de los sistemas lentos del pasado.</p>
              </div>
              <div className="w-full mt-4 ml-10 rounded-tl-3xl overflow-hidden border-t border-l border-white/10 shadow-[-20px_-20px_60px_rgba(0,0,0,0.5)] bg-slate-950 flex-grow relative">
                {/* REAL LIVE COMPONENT INSTEAD OF SCREENSHOT */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                    <div className="w-[150%] h-[150%] origin-top-left scale-[0.66] p-8">
                        <POSDashboard />
                    </div>
                </div>
              </div>
            </div>

            {/* Bento Box 2: Delivery Calculator (Tall) */}
            <div className="md:col-span-4 bg-[#090D1F] border border-white/10 rounded-[2rem] overflow-hidden group hover:border-emerald-500/50 transition-all duration-500 relative shadow-2xl flex flex-col">
               <div className="p-8 relative z-10 shrink-0">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400"><TrendingUp size={24} /></div>
                  <h3 className="text-2xl font-black text-white">Blindaje de Ganancias</h3>
                </div>
                <p className="text-slate-400 leading-snug"><span className="text-emerald-400 font-bold">Magia pura.</span> Sube tu menú con precios de mostrador y nuestro algoritmo recalcula automáticamente el precio exacto para Uber, Didi y Rappi. Tu utilidad queda 100% protegida contra comisiones. ¡Cero pérdidas garantizadas!</p>
              </div>
              <div className="mt-auto w-full h-[400px] px-8 pb-0 relative">
                 <div className="w-full h-full rounded-t-3xl overflow-hidden border-t border-x border-white/10 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] bg-slate-950 relative">
                   {/* REAL LIVE COMPONENT INSTEAD OF SCREENSHOT */}
                   <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                        <div className="w-[200%] h-[200%] origin-top-left scale-[0.5] p-6">
                            <PricingGrid 
                                rows={rows} 
                                pricingResults={pricingResults} 
                                updateRow={updateRow} 
                                removeRow={removeRow} 
                                addRow={addRow} 
                                syncWithStorePrices={syncWithStorePrices} 
                            />
                        </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Bento Box 3: Reports (Wide) */}
            <div className="md:col-span-6 bg-[#090D1F] border border-white/10 rounded-[2rem] overflow-hidden group hover:border-cyan-500/50 transition-all duration-500 relative shadow-2xl p-8 flex flex-col justify-between h-[450px]">
              <div className="flex items-center justify-between mb-8 shrink-0">
                 <div>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 bg-cyan-500/20 rounded-xl text-cyan-400"><PieChart size={24} /></div>
                      <h3 className="text-2xl font-black text-white">Reportes Financieros</h3>
                    </div>
                    <p className="text-slate-400">Métricas en tiempo real. Analiza qué se vende, cuándo y con qué margen de rentabilidad.</p>
                 </div>
              </div>
              <div className="w-full h-[250px] rounded-2xl overflow-hidden border border-white/10 mt-auto bg-slate-950 relative">
                 {/* REAL LIVE COMPONENT INSTEAD OF SCREENSHOT */}
                 <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
                      <div className="w-[150%] h-[150%] origin-top-left scale-[0.66] p-6">
                          <POSReports />
                      </div>
                  </div>
              </div>
            </div>

            {/* Bento Box 4: Security/Support */}
            <div className="md:col-span-6 bg-gradient-to-br from-indigo-900 to-[#090D1F] border border-indigo-500/30 rounded-[2rem] p-10 flex flex-col justify-center shadow-2xl">
               <h3 className="text-4xl font-black text-white mb-6">El sistema que se paga solo.</h3>
               <div className="space-y-6">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-emerald-400 shrink-0"><Zap size={24} /></div>
                   <div>
                     <div className="font-bold text-white text-lg">Activación Inmediata</div>
                     <div className="text-slate-400 text-sm">Empieza a cobrar en 5 minutos.</div>
                   </div>
                 </div>
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-blue-400 shrink-0"><ShieldCheck size={24} /></div>
                   <div>
                     <div className="font-bold text-white text-lg">Soporte 24/7 VIP</div>
                     <div className="text-slate-400 text-sm">Nunca estarás solo si algo falla.</div>
                   </div>
                 </div>
               </div>
            </div>

            {/* Bento Box 5: Impuestos */}
            <div className="md:col-span-7 bg-[#090D1F] border border-white/10 rounded-[2rem] p-10 group hover:border-pink-500/50 transition-all duration-500 shadow-2xl relative overflow-hidden flex flex-col justify-center">
               <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 blur-[80px] pointer-events-none" />
               <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-pink-500/20 rounded-xl text-pink-400"><Calculator size={28} /></div>
                    <h3 className="text-3xl font-black text-white">Cero estrés fiscal</h3>
                  </div>
                  <p className="text-slate-400 text-lg mb-6">Olvídate de calcular el IVA y retenciones a mano al final del día. El sistema aparta y calcula automáticamente los impuestos de cada venta. Sabrás exactamente qué es tuyo y qué es del SAT.</p>
                  <div className="flex flex-wrap gap-2 text-pink-400 font-bold bg-pink-500/10 px-4 py-2 rounded-lg border border-pink-500/20 w-max">
                     Desglose de IVA al centavo
                  </div>
               </div>
            </div>

            {/* Bento Box 6: Impresoras */}
            <div className="md:col-span-5 bg-[#090D1F] border border-white/10 rounded-[2rem] p-10 group hover:border-amber-500/50 transition-all duration-500 shadow-2xl relative overflow-hidden flex flex-col justify-center">
               <div className="absolute top-0 left-0 w-64 h-64 bg-amber-500/10 blur-[80px] pointer-events-none" />
               <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400"><Printer size={28} /></div>
                    <h3 className="text-3xl font-black text-white">Conecta e Imprime</h3>
                  </div>
                  <p className="text-slate-400 text-lg mb-6">Emite tickets de cocina y cliente al instante. Cero configuraciones complejas.</p>
                  <div className="flex flex-col gap-3">
                     <span className="text-sm font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/20 text-center">Térmica Bluetooth (58mm)</span>
                     <span className="text-sm font-bold text-amber-500 bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/20 text-center">Impresora Normal (A4)</span>
                  </div>
               </div>
            </div>
          </div>
        </div>

        {/* Advanced Features List */}
        <div className="mt-32 max-w-7xl mx-auto">
           <div className="text-center mb-16">
             <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4">Todo lo que necesitas. <span className="text-slate-500">Nada de sobra.</span></h2>
             <p className="text-slate-400 text-xl">Funciones diseñadas específicamente para evitar robos, errores y acelerar tu operación diaria.</p>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { title: "Corte de Caja Perfecto", desc: "Registra cobros mixtos (efectivo/tarjeta) sin enredos. El sistema te dice exactamente cuánto efectivo físico debe haber, previniendo el robo hormiga.", icon: <ShieldCheck size={24} className="text-emerald-400" /> },
                { title: "Menú en Tiempo Real", desc: "Agrega platillos, sube precios o pausa productos agotados al instante. Tú tienes el control total sin depender del soporte técnico.", icon: <Zap size={24} className="text-indigo-400" /> },
                { title: "Modificadores y Extras", desc: "Configura 'extras' (ej. extra queso $15). Pedidos clarísimos para cocina y cero ingredientes adicionales regalados por olvido del cajero.", icon: <Layers size={24} className="text-cyan-400" /> },
                { title: "Permisos Antifraude", desc: "Tú decides mediante PIN qué empleados pueden borrar un ticket, hacer descuentos o abrir el cajón de dinero. Descansa tranquilo.", icon: <Lock size={24} className="text-pink-400" /> },
                { title: "Tolerancia a Caídas", desc: "¿Se cayó el WiFi? Sigue cobrando e imprimiendo de manera local. Al regresar la conexión, todo se sincroniza a la nube en automático.", icon: <Wifi size={24} className="text-amber-400" /> },
                { title: "Reportes Detallados", desc: "Conoce cuáles son tus horas pico, tus platillos más rentables y los más rezagados. Toma decisiones basadas en números reales.", icon: <FileText size={24} className="text-blue-400" /> }
              ].map((feat, i) => (
                 <div key={i} className="bg-[#090D1F] border border-white/10 rounded-3xl p-8 hover:border-indigo-500/50 transition-colors group cursor-default">
                    <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                       {feat.icon}
                    </div>
                    <h4 className="text-xl font-bold text-white mb-3">{feat.title}</h4>
                    <p className="text-slate-400 leading-relaxed">{feat.desc}</p>
                 </div>
              ))}
           </div>
        </div>

        {/* Multi-Device Banner */}
        <div className="mt-24 max-w-5xl mx-auto bg-gradient-to-r from-indigo-900/40 to-cyan-900/40 border border-white/10 rounded-3xl p-10 flex flex-col md:flex-row items-center justify-between gap-10 shadow-2xl">
           <div className="md:w-1/2 space-y-4">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/20">
                Basado en la Nube
             </div>
             <h3 className="text-3xl font-black text-white">Tu negocio en tu bolsillo.</h3>
             <p className="text-slate-400 text-lg">No compres equipo caro. Funciona perfectamente en la computadora vieja de tu cajero, en el iPad de tu mesero y en tu celular mientras estás de viaje.</p>
           </div>
           <div className="md:w-1/2 flex justify-center gap-6 text-slate-500">
              <div className="flex flex-col items-center gap-3">
                 <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50"><Monitor size={32} /></div>
                 <span className="text-sm font-medium">PC/Mac</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                 <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50"><Tablet size={32} /></div>
                 <span className="text-sm font-medium">Tablets</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                 <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50"><Smartphone size={32} /></div>
                 <span className="text-sm font-medium">Celulares</span>
              </div>
           </div>
        </div>

        {/* Testimonials */}
        <div className="mt-32 max-w-7xl mx-auto">
           <div className="text-center mb-16">
             <h2 className="text-4xl md:text-5xl font-black text-white tracking-tighter mb-4">Lo que dicen los dueños</h2>
             <p className="text-slate-400 text-xl">Restaurantes que ya dejaron de perder dinero.</p>
           </div>
           <div className="grid md:grid-cols-3 gap-6">
              {[
                 { quote: "Antes perdía el 30% de mis ganancias con Uber Eats por calcular mal los precios. Con Don Punto recuperé mi margen en la primera semana.", name: "Carlos R.", role: "Dueño de Taquería" },
                 { quote: "Increíblemente fácil de usar. Mis meseros aprendieron a usarlo en 10 minutos. Y el reporte de ventas desde mi celular me da mucha paz.", name: "Mariana L.", role: "Gerente de Cafetería" },
                 { quote: "Lo que más me gusta es no tener que calcular el IVA al final del mes. El sistema me dice exactamente cuánto dinero es del restaurante.", name: "Roberto G.", role: "Propietario de Pizzería" }
              ].map((testimonial, i) => (
                 <div key={i} className="bg-[#090D1F] border border-white/10 rounded-3xl p-8 relative">
                    <div className="flex text-amber-400 mb-6 gap-1">
                       <Star size={16} className="fill-amber-400" />
                       <Star size={16} className="fill-amber-400" />
                       <Star size={16} className="fill-amber-400" />
                       <Star size={16} className="fill-amber-400" />
                       <Star size={16} className="fill-amber-400" />
                    </div>
                    <p className="text-slate-300 text-lg mb-8 italic">"{testimonial.quote}"</p>
                    <div className="flex items-center gap-4 mt-auto">
                       <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-bold">{testimonial.name.charAt(0)}</div>
                       <div>
                          <div className="font-bold text-white">{testimonial.name}</div>
                          <div className="text-sm text-slate-500">{testimonial.role}</div>
                       </div>
                    </div>
                 </div>
              ))}
           </div>
        </div>

        {/* Pricing Section */}
        <div id="pricing" className="mt-40 max-w-5xl mx-auto">
          <div className="text-center mb-16">
             <h2 className="text-5xl md:text-6xl font-black text-white tracking-tighter mb-4">Planes Simples. <span className="text-indigo-400">Sin Letras Chicas.</span></h2>
             <p className="text-slate-400 text-xl">Elige el plan que mejor se adapte a tu operación. Cancela cuando quieras.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-stretch">
            {/* Basic Plan */}
            <div className="bg-[#090D1F] border border-white/10 rounded-[3rem] p-10 flex flex-col relative group hover:border-indigo-500/30 transition-all">
                <div className="text-indigo-400 font-bold uppercase tracking-widest text-sm mb-4">Plan Básico</div>
                <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-6xl font-black text-white tracking-tighter">$350</span>
                    <span className="text-slate-500 font-bold text-xl">/ mes</span>
                </div>
                <p className="text-slate-400 mb-8 min-h-[48px]">Perfecto para dueños independientes y negocios que van empezando.</p>
                
                <div className="space-y-4 mb-10 flex-grow">
                    {[
                      'Punto de Venta Ilimitado',
                      'Calculadoras Uber/Didi/Rappi',
                      'Reportes Básicos Mensuales',
                      '1 Usuario / Dispositivo',
                      'Soporte Técnico'
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-4 text-slate-300 font-medium">
                        <CheckCircle2 className="text-indigo-400 shrink-0" size={20} /> <span>{feature}</span>
                      </div>
                    ))}
                </div>
                
                <button 
                    onClick={onSubscribe}
                    className="w-full py-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 text-white font-black text-xl transition-all active:scale-95"
                >
                    Comenzar Básico
                </button>
            </div>

            {/* Pro Plan */}
            <div className="bg-gradient-to-br from-indigo-900/50 to-[#090D1F] border border-indigo-500/50 rounded-[3rem] p-10 flex flex-col relative shadow-[0_0_80px_rgba(99,102,241,0.15)] overflow-hidden">
                <div className="absolute top-0 right-0 bg-indigo-500 text-white text-xs font-black uppercase tracking-widest py-1.5 px-4 rounded-bl-2xl">Recomendado</div>
                
                <div className="text-white font-bold uppercase tracking-widest text-sm mb-4">Plan PRO</div>
                <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-6xl font-black text-white tracking-tighter">$799</span>
                    <span className="text-indigo-300/60 font-bold text-xl">/ mes</span>
                </div>
                <p className="text-indigo-200/80 mb-8 min-h-[48px]">Para restaurantes establecidos que necesitan control total y seguridad anti-robos.</p>
                
                <div className="space-y-4 mb-10 flex-grow">
                    <div className="flex items-center gap-4 text-white font-bold pb-2 border-b border-white/10">
                        <CheckCircle2 className="text-emerald-400 shrink-0" size={20} /> <span>Todo lo del Plan Básico, más:</span>
                    </div>
                    {[
                      'Múltiples Usuarios y Sucursales',
                      'Seguridad Antifraude (PIN)',
                      'Escáner de Menú con IA (Fotos)',
                      'Reportes Financieros en Tiempo Real',
                      'Soporte VIP Prioritario 24/7'
                    ].map((feature, i) => (
                      <div key={i} className="flex items-center gap-4 text-indigo-100 font-medium">
                        <CheckCircle2 className="text-indigo-400 shrink-0" size={20} /> <span>{feature}</span>
                      </div>
                    ))}
                </div>
                
                <button 
                    onClick={onSubscribe}
                    className="w-full py-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-white font-black text-xl transition-all shadow-[0_10px_30px_rgba(99,102,241,0.3)] active:scale-95"
                >
                    Suscribirse al PRO
                </button>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mt-40 max-w-3xl mx-auto">
           <div className="text-center mb-16">
             <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-500/10 text-indigo-400 mb-6">
                <MessageSquare size={32} />
             </div>
             <h2 className="text-4xl font-black text-white tracking-tighter">Dudas Frecuentes</h2>
           </div>
           
           <div className="space-y-4">
              {[
                 { q: "¿Hay plazos forzosos o contratos?", a: "Cero contratos. Pagas mes a mes y puedes cancelar en cualquier momento con un solo clic, sin preguntas." },
                 { q: "¿Necesito comprar equipo especial?", a: "No. Puedes usar cualquier computadora, laptop, tablet o celular que ya tengas. Solo necesitas conexión a internet y un navegador web." },
                 { q: "¿Es fácil capacitar a mi personal?", a: "El sistema está diseñado para ser tan intuitivo como usar WhatsApp. Tus cajeros aprenderán a cobrar en menos de 10 minutos." },
                 { q: "¿Qué impresoras son compatibles?", a: "Soportamos cualquier impresora normal (tamaño carta/A4) y todas las impresoras térmicas Bluetooth genéricas (58mm y 80mm)." }
              ].map((faq, i) => (
                 <details key={i} className="group bg-[#090D1F] border border-white/10 rounded-2xl overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex items-center justify-between p-6 text-white font-bold cursor-pointer select-none">
                       {faq.q}
                       <span className="text-slate-500 group-open:rotate-45 transition-transform text-2xl font-light">+</span>
                    </summary>
                    <div className="px-6 pb-6 text-slate-400 leading-relaxed">
                       {faq.a}
                    </div>
                 </details>
              ))}
           </div>
        </div>

        {/* Final CTA */}
        <div className="mt-40 mb-20 text-center max-w-4xl mx-auto bg-gradient-to-b from-[#090D1F] to-transparent border-t border-white/5 pt-20">
           <h2 className="text-5xl md:text-7xl font-black text-white tracking-tighter mb-8">
              ¿Listo para recuperar el <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">control?</span>
           </h2>
           <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
              Únete a los restaurantes que ya están dominando las apps de delivery y multiplicando sus ganancias reales.
           </p>
           <button 
              onClick={onSubscribe}
              className="px-12 py-6 rounded-2xl bg-white hover:bg-slate-200 text-black font-black text-xl transition-all shadow-[0_0_60px_rgba(255,255,255,0.2)] active:scale-95"
           >
              Abrir mi cuenta ahora
           </button>
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-16 text-center text-slate-500 font-medium relative z-10 bg-[#020617]">
        <div className="flex items-center justify-center gap-2 mb-6 text-white opacity-80">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center text-black font-black text-sm">
            D
          </div>
          <span className="font-black text-xl tracking-tight">Don Punto</span>
        </div>
        <p>© 2026 Don Punto POS. El sistema operativo para restaurantes y negocios.</p>
      </footer>
    </div>
  );
}
