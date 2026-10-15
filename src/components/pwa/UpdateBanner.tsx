import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { applyUpdate, onUpdateAvailable, updateAvailable } from '../../lib/pwa';

/** Aviso discreto cuando hay versión nueva. No recarga sola para no interrumpir una venta. */
export function UpdateBanner() {
  const [show, setShow] = useState(updateAvailable());
  useEffect(() => {
    const off = onUpdateAvailable(() => setShow(true));
    return () => { off(); };
  }, []);
  if (!show) return null;
  return (
    <div role="status" className="fixed bottom-4 left-4 z-[210] no-print flex items-center gap-3 rounded-2xl bg-carbon-900/95 border border-white/10 pl-4 pr-2 py-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.6)] text-sm text-carbon-100">
      <span>Hay una versión nueva de Don Punto</span>
      <button onClick={applyUpdate} className="inline-flex items-center gap-1.5 rounded-xl bg-agave-500 hover:bg-agave-400 text-white font-semibold px-3 py-1.5 transition-colors">
        <RefreshCw size={14} /> Actualizar
      </button>
    </div>
  );
}
