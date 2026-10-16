import { CreditCard, CheckCircle2, Lock, Sparkles, LogOut, MessageCircle, Loader2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { apiPost, ApiError } from '../../lib/api';
import { supportLink, PLANS, type PlanKey } from '../../config';

interface SubscriptionGateProps {
  status: string;
  email: string | null;
  verifyingPayment: boolean;
  hasStripeCustomer: boolean;
  onLogout: () => void;
}

const FEATURES: Record<PlanKey, string[]> = {
  basico: ['1 sucursal', 'Punto de venta ilimitado', 'Calculadora Uber / DiDi / Rappi', 'Menú desde una foto con IA', 'Combos sugeridos con IA', 'Corte de caja, inventario y recetario'],
  pro: ['Todo lo del plan Básico', 'Facturas de proveedor leídas con IA', 'Soporte prioritario por WhatsApp'],
};

export function SubscriptionGate({ status, email, verifyingPayment, hasStripeCustomer, onLogout }: SubscriptionGateProps) {
  const [loadingPlan, setLoadingPlan] = useState<PlanKey | 'portal' | null>(null);
  const [error, setError] = useState('');

  const contact = supportLink(`Hola, quiero activar mi cuenta de Don Punto (${email ?? ''}).`);
  const pastDue = status === 'past_due' || status === 'incomplete';

  const checkout = async (plan: PlanKey) => {
    setError('');
    setLoadingPlan(plan);
    try {
      const { url } = await apiPost<{ url: string }>('/api/stripe-checkout', { plan });
      window.location.assign(url);
    } catch (e) {
      const err = e as ApiError;
      const fallback = supportLink(`Hola, quiero contratar el plan ${PLANS[plan].name} de Don Punto (${email ?? ''}).`);
      if (err.code === 'stripe_not_configured' && fallback) {
        window.open(fallback, '_blank');
      } else {
        setError(err.message || 'No se pudo iniciar el pago. Intenta de nuevo.');
      }
      setLoadingPlan(null);
    }
  };

  const portal = async () => {
    setError('');
    setLoadingPlan('portal');
    try {
      const { url } = await apiPost<{ url: string }>('/api/stripe-portal', {});
      window.location.assign(url);
    } catch (e) {
      setError((e as Error).message);
      setLoadingPlan(null);
    }
  };

  if (verifyingPayment) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <Loader2 className="animate-spin text-indigo-400" size={40} />
        <h1 className="text-2xl font-black text-carbon-950">Confirmando tu pago…</h1>
        <p className="text-slate-400 max-w-sm">Esto tarda unos segundos. No cierres esta ventana.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 py-16 relative overflow-x-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] bg-indigo-500/20 blur-[120px] pointer-events-none" />

      <button
        onClick={onLogout}
        className="absolute top-4 right-4 z-20 flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-carbon-950 bg-carbon-950/5 border border-carbon-950/10 px-3 py-2 rounded-lg"
      >
        <LogOut size={14} /> Cerrar sesión
      </button>

      <div className="w-full max-w-4xl z-10">
        <div className="text-center mb-10">
          <div className="inline-flex p-3 bg-pink-500/20 text-pink-500 rounded-full mb-6">
            {pastDue ? <AlertTriangle size={32} /> : <Lock size={32} />}
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-carbon-950 tracking-tight mb-4">
            {pastDue ? 'Tu pago está pendiente' : 'Activa tu restaurante'}
          </h1>
          <p className="text-slate-400 text-base md:text-lg max-w-xl mx-auto">
            {pastDue
              ? 'No pudimos cobrar tu membresía. Actualiza tu tarjeta para seguir usando Don Punto. Tus datos están a salvo.'
              : 'Elige un plan para desbloquear el punto de venta. Sin contratos: cancelas cuando quieras desde tu cuenta.'}
          </p>
          {email && <p className="text-slate-500 text-xs mt-3">Cuenta: {email}</p>}
        </div>

        {error && (
          <div className="max-w-3xl mx-auto mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-sm text-rose-300 text-center">{error}</div>
        )}

        {pastDue && hasStripeCustomer ? (
          <div className="text-center">
            <button
              onClick={portal}
              disabled={!!loadingPlan}
              className="px-8 py-4 rounded-2xl font-black text-white bg-indigo-500 hover:bg-indigo-400 inline-flex items-center gap-2"
            >
              {loadingPlan === 'portal' ? <Loader2 className="animate-spin" size={20} /> : <CreditCard size={20} />} ACTUALIZAR MÉTODO DE PAGO
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-6 md:gap-8 max-w-3xl mx-auto">
            {(['basico', 'pro'] as PlanKey[]).map((key) => {
              const pro = key === 'pro';
              return (
                <div
                  key={key}
                  className={
                    pro
                      ? 'bg-indigo-900/40 backdrop-blur-xl border border-indigo-500/50 rounded-3xl p-8 flex flex-col relative shadow-[0_0_50px_-12px_rgba(22,137,95,0.5)]'
                      : 'bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-3xl p-8 flex flex-col relative'
                  }
                >
                  {pro && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-pink-500 text-white text-xs font-black px-4 py-1.5 rounded-full flex items-center gap-1 shadow-lg whitespace-nowrap">
                      <Sparkles size={14} /> MÁS POPULAR
                    </div>
                  )}
                  <h3 className="text-xl font-bold text-carbon-950 mb-2">{PLANS[key].name}</h3>
                  <div className="flex items-baseline gap-2 mb-6">
                    <span className="text-4xl font-black text-carbon-950">${PLANS[key].price}</span>
                    <span className="text-slate-400 text-sm font-bold uppercase tracking-widest">MXN / mes</span>
                  </div>
                  <ul className="space-y-3 mb-8 flex-grow">
                    {FEATURES[key].map((f) => (
                      <li key={f} className="flex items-center gap-3 text-sm text-slate-200">
                        <CheckCircle2 size={18} className={pro ? 'text-pink-400 shrink-0' : 'text-emerald-500 shrink-0'} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    disabled={!!loadingPlan}
                    onClick={() => checkout(key)}
                    className={
                      (pro ? 'bg-indigo-500 hover:bg-indigo-400 shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 ' : 'bg-slate-800 hover:bg-slate-700 ') +
                      'w-full py-4 rounded-2xl font-black text-carbon-950 transition-all flex items-center justify-center gap-2 disabled:opacity-60'
                    }
                  >
                    {loadingPlan === key ? <Loader2 className="animate-spin" size={20} /> : <><CreditCard size={20} /> ELEGIR {PLANS[key].name.toUpperCase()}</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-center mt-8 space-y-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-widest">Pago seguro procesado por Stripe · Precios en pesos mexicanos</p>
          {contact && (
            <a href={contact} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-400 hover:text-emerald-300">
              <MessageCircle size={16} /> ¿Prefieres pagar por transferencia? Escríbenos
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
