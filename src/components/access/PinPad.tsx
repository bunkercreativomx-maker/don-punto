import { useState } from 'react';
import { Lock, Delete } from 'lucide-react';

/** Teclado de PIN (sirve en pantalla táctil y con teclado físico) */
export function PinPad({
  title, subtitle, onSubmit, onClose, error,
}: { title: string; subtitle?: string; onSubmit: (pin: string) => boolean | string; onClose?: () => void; error?: string }) {
  const [pin, setPin] = useState('');
  const [bad, setBad] = useState<string | false>(false);
  const submit = (p = pin) => {
    if (!p) return;
    const res = onSubmit(p);
    if (res !== true) { setBad(typeof res === 'string' ? res : error || 'PIN incorrecto'); setPin(''); }
  };
  const press = (d: string) => {
    setBad(false);
    const next = (pin + d).slice(0, 8);
    setPin(next);
  };
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-md no-print" onKeyDown={(e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
      else if (e.key === 'Escape' && onClose) onClose();
    }} tabIndex={-1} ref={(el) => el?.focus()}>
      <div className="bg-white border border-carbon-950/10 rounded-3xl w-full max-w-xs shadow-[0_24px_60px_-24px_rgba(12,16,22,0.35)] overflow-hidden">
        <div className="p-6 text-center border-b border-carbon-950/10">
          <div className="w-12 h-12 bg-agave-50 text-agave-700 rounded-full flex items-center justify-center mx-auto mb-3"><Lock size={22} /></div>
          <h3 className="font-display text-xl font-bold text-carbon-950">{title}</h3>
          {subtitle && <p className="text-carbon-500 text-xs mt-1.5 leading-relaxed">{subtitle}</p>}
        </div>
        <div className="p-5">
          <div className={`h-12 flex items-center justify-center gap-2 rounded-2xl border-2 ${bad ? 'border-rose-400 bg-rose-50' : 'border-carbon-950/10 bg-carbon-50'}`} aria-live="polite">
            {pin.length === 0 ? <span className="text-carbon-400 text-sm">Escribe tu PIN</span> : Array.from({ length: pin.length }).map((_, i) => <span key={i} className="w-2.5 h-2.5 rounded-full bg-carbon-900" />)}
          </div>
          <div className="h-5 mt-1 text-center text-xs font-bold text-rose-600">{bad || ''}</div>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <button key={d} type="button" onClick={() => press(d)} className="h-14 rounded-2xl bg-carbon-50 hover:bg-carbon-100 active:scale-95 text-xl font-bold text-carbon-900 transition">{d}</button>
            ))}
            <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Borrar" className="h-14 rounded-2xl bg-carbon-50 hover:bg-carbon-100 flex items-center justify-center text-carbon-600"><Delete size={20} /></button>
            <button type="button" onClick={() => press('0')} className="h-14 rounded-2xl bg-carbon-50 hover:bg-carbon-100 active:scale-95 text-xl font-bold text-carbon-900">0</button>
            <button type="button" onClick={() => submit()} className="h-14 rounded-2xl bg-agave-600 hover:bg-agave-700 text-white font-bold text-sm">Entrar</button>
          </div>
          {onClose && <button type="button" onClick={onClose} className="mt-3 w-full py-2.5 text-sm font-semibold text-carbon-600 hover:text-carbon-900">Cancelar</button>}
        </div>
      </div>
    </div>
  );
}
