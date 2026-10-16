import { Sparkles, Check } from 'lucide-react';

/** Tarjeta para funciones del plan Pro cuando la cuenta es Básico */
export function ProUpsell({ title, text, bullets = [], onUpgrade }: { title: string; text: string; bullets?: string[]; onUpgrade?: () => void }) {
  return (
    <div className="max-w-2xl rounded-3xl border border-maiz-200 bg-gradient-to-br from-maiz-50 to-white p-8">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-maiz-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-maiz-800"><Sparkles size={13} /> Plan Pro</span>
      <h3 className="mt-4 font-display text-2xl font-bold text-carbon-950">{title}</h3>
      <p className="mt-2 text-carbon-600 leading-relaxed">{text}</p>
      {bullets.length > 0 && (
        <ul className="mt-5 space-y-2">
          {bullets.map((b) => <li key={b} className="flex gap-2 text-sm text-carbon-700"><Check size={16} className="text-agave-600 mt-0.5 shrink-0" />{b}</li>)}
        </ul>
      )}
      {onUpgrade && (
        <button onClick={onUpgrade} className="mt-6 rounded-full bg-agave-600 hover:bg-agave-700 px-6 py-3 text-sm font-semibold text-white transition-colors">Cambiar a Pro · $799/mes</button>
      )}
    </div>
  );
}
