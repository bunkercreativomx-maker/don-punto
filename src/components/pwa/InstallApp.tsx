import { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X } from 'lucide-react';
import clsx from 'clsx';
import { canPromptInstall, isIOS, isStandalone, onInstallChange, promptInstall } from '../../lib/pwa';

/** Botón "Instalar app": usa el aviso nativo (Android/Chrome/Edge) o muestra pasos para iPhone/iPad. */
export function InstallAppButton({ className, label = 'Instalar app', compact = false }: { className?: string; label?: string; compact?: boolean }) {
  const [, force] = useState(0);
  const [iosHelp, setIosHelp] = useState(false);
  useEffect(() => {
    const off = onInstallChange(() => force((n) => n + 1));
    return () => { off(); };
  }, []);

  if (isStandalone()) return null;
  const ios = isIOS();
  if (!ios && !canPromptInstall()) return null;

  return (
    <>
      <button
        onClick={() => (ios ? setIosHelp(true) : promptInstall())}
        className={clsx('inline-flex items-center gap-2', className)}
        title="Instalar Don Punto en este dispositivo"
      >
        <Download size={compact ? 20 : 16} className="shrink-0" />
        <span className={compact ? 'hidden lg:block text-xs font-bold whitespace-nowrap' : ''}>{label}</span>
      </button>
      {iosHelp && <IOSInstallSheet onClose={() => setIosHelp(false)} />}
    </>
  );
}

function IOSInstallSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-3xl bg-white text-carbon-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h3 className="font-display text-xl font-bold">Instala Don Punto en tu iPhone</h3>
          <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded-full hover:bg-carbon-100"><X size={18} /></button>
        </div>
        <ol className="space-y-3 text-[15px] text-carbon-700">
          <li className="flex gap-3"><span className="font-semibold text-agave-600">1.</span><span>Abre esta página en <b>Safari</b>.</span></li>
          <li className="flex gap-3"><span className="font-semibold text-agave-600">2.</span><span>Toca <Share size={16} className="inline -mt-1" /> <b>Compartir</b> en la barra de abajo.</span></li>
          <li className="flex gap-3"><span className="font-semibold text-agave-600">3.</span><span>Elige <PlusSquare size={16} className="inline -mt-1" /> <b>Agregar a inicio</b>.</span></li>
        </ol>
        <p className="mt-4 text-sm text-carbon-500">Las notificaciones en iPhone solo funcionan con la app instalada (iOS 16.4 o más reciente).</p>
      </div>
    </div>
  );
}
