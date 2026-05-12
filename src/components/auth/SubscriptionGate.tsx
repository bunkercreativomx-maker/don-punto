import { CreditCard, CheckCircle2, Building2, Lock, Sparkles, ArrowRight } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface SubscriptionGateProps {
    status: 'active' | 'inactive' | 'checking';
    onSimulatePayment: () => void; // Para el prototipo
    children: React.ReactNode;
}

export function SubscriptionGate({ status, onSimulatePayment, children }: SubscriptionGateProps) {
    const [isProcessing, setIsProcessing] = useState(false);

    if (status === 'checking') {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    if (status === 'active') {
        return <>{children}</>;
    }

    const handleCheckout = () => {
        setIsProcessing(true);
        // Simulamos un retraso de red como si redirigiera a Stripe
        setTimeout(() => {
            setIsProcessing(false);
            onSimulatePayment();
        }, 2000);
    };

    // UI para cuenta inactiva (Muro de Pago)
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] bg-indigo-500/20 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-4xl z-10 animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-12">
                    <div className="inline-flex p-3 bg-pink-500/20 text-pink-500 rounded-full mb-6">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
                        Activa tu Restaurante
                    </h1>
                    <p className="text-slate-400 text-lg max-w-xl mx-auto">
                        Tu periodo de prueba ha terminado o tu cuenta está inactiva. Elige un plan para desbloquear el Punto de Venta y todas las herramientas IA.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
                    {/* Plan Básico */}
                    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-3xl p-8 flex flex-col relative group hover:border-indigo-500/30 transition-all">
                        <h3 className="text-xl font-bold text-white mb-2">Básico</h3>
                        <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-4xl font-black text-white">$350</span>
                            <span className="text-slate-500 text-sm font-bold uppercase tracking-widest">MXN / MES</span>
                        </div>
                        
                        <ul className="space-y-4 mb-8 flex-grow">
                            <li className="flex items-center gap-3 text-sm text-slate-300">
                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                Punto de Venta Básico
                            </li>
                            <li className="flex items-center gap-3 text-sm text-slate-300">
                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                1 Usuario / Dispositivo
                            </li>
                            <li className="flex items-center gap-3 text-sm text-slate-300">
                                <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                                Reportes Mensuales
                            </li>
                        </ul>

                        <button 
                            disabled={isProcessing}
                            onClick={handleCheckout}
                            className="w-full py-4 rounded-2xl font-black text-white bg-slate-800 hover:bg-slate-700 transition-all"
                        >
                            SELECCIONAR BÁSICO
                        </button>
                    </div>

                    {/* Plan Pro */}
                    <div className="bg-indigo-900/40 backdrop-blur-xl border border-indigo-500/50 rounded-3xl p-8 flex flex-col relative shadow-[0_0_50px_-12px_rgba(99,102,241,0.5)] transform md:-translate-y-4">
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-xs font-black px-4 py-1.5 rounded-full flex items-center gap-1 shadow-lg">
                            <Sparkles size={14} /> MÁS POPULAR
                        </div>
                        
                        <h3 className="text-xl font-bold text-white mb-2 text-indigo-100">Pro</h3>
                        <div className="flex items-baseline gap-2 mb-6">
                            <span className="text-4xl font-black text-white">$799</span>
                            <span className="text-indigo-300/60 text-sm font-bold uppercase tracking-widest">MXN / MES</span>
                        </div>
                        
                        <ul className="space-y-4 mb-8 flex-grow">
                            <li className="flex items-center gap-3 text-sm text-white">
                                <CheckCircle2 size={18} className="text-pink-400 shrink-0" />
                                <strong>Todo lo del plan Básico</strong>
                            </li>
                            <li className="flex items-center gap-3 text-sm text-indigo-100">
                                <CheckCircle2 size={18} className="text-pink-400 shrink-0" />
                                Múltiples Usuarios y Sucursales
                            </li>
                            <li className="flex items-center gap-3 text-sm text-indigo-100">
                                <CheckCircle2 size={18} className="text-pink-400 shrink-0" />
                                Escáner de Menú con IA
                            </li>
                            <li className="flex items-center gap-3 text-sm text-indigo-100">
                                <CheckCircle2 size={18} className="text-pink-400 shrink-0" />
                                Seguridad Antifraude (PIN)
                            </li>
                        </ul>

                        <button 
                            disabled={isProcessing}
                            onClick={handleCheckout}
                            className="w-full py-4 rounded-2xl font-black text-white bg-indigo-500 hover:bg-indigo-400 shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
                        >
                            {isProcessing ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                            ) : (
                                <>
                                    <CreditCard size={20} /> PAGAR SUSCRIPCIÓN
                                </>
                            )}
                        </button>
                        
                        <p className="text-[10px] text-center mt-4 text-indigo-300/50 uppercase tracking-widest">Pagos seguros procesados por Stripe</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
