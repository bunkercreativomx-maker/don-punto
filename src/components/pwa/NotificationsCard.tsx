import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Smartphone } from 'lucide-react';
import { disablePush, enablePush, getPushState, sendTestPush, setDailySummary, type PushState } from '../../lib/pwa';
import { InstallAppButton } from './InstallApp';

const DAILY_KEY = 'dp:dailySummary';

/** Tarjeta de Ajustes: activar notificaciones en este dispositivo */
export function NotificationsCard() {
  const [state, setState] = useState<PushState | 'loading'>('loading');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [daily, setDaily] = useState(() => localStorage.getItem(DAILY_KEY) !== '0');

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message || 'No se pudo completar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-5">
      <div>
        <h3 className="text-base font-bold text-white tracking-tight mb-1 flex items-center gap-2"><Bell size={18} className="text-maiz-400" /> Notificaciones</h3>
        <p className="text-[13px] text-slate-400">Recibe el cierre del día con tus ventas y avisos de tu membresía en este dispositivo.</p>
      </div>

      {state === 'loading' && <Loader2 className="animate-spin text-slate-500" size={18} />}

      {state === 'needs-install' && (
        <div className="rounded-2xl bg-slate-950 border border-white/5 p-4 text-sm text-slate-300 space-y-3">
          <p className="flex items-start gap-2"><Smartphone size={16} className="mt-0.5 shrink-0 text-maiz-400" /> En iPhone primero instala Don Punto en tu pantalla de inicio; después vuelve aquí para activar las notificaciones.</p>
          <InstallAppButton className="rounded-xl bg-agave-500 hover:bg-agave-400 text-white font-semibold px-4 py-2 text-sm" label="Cómo instalar" />
        </div>
      )}

      {state === 'unsupported' && <p className="text-sm text-slate-400">Este navegador no permite notificaciones. Usa Chrome, Edge o Safari actualizado.</p>}

      {state === 'denied' && (
        <p className="text-sm text-slate-300">Bloqueaste las notificaciones para Don Punto. Actívalas desde los permisos del navegador (ícono del candado junto a la dirección) y recarga la página.</p>
      )}

      {state === 'off' && (
        <button
          disabled={busy}
          onClick={() => run(async () => setState(await enablePush(daily)), 'Listo. Te mandamos una notificación de prueba.').then(() => sendTestPush().catch(() => undefined))}
          className="inline-flex items-center gap-2 rounded-2xl bg-agave-500 hover:bg-agave-400 disabled:opacity-60 text-white font-semibold px-5 py-3 text-sm transition-colors"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />} Activar en este dispositivo
        </button>
      )}

      {state === 'on' && (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-950 border border-white/5 px-4 py-3 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-white">Cierre del día</span>
              <span className="block text-xs text-slate-500">Cada noche: total vendido, número de ventas y ticket promedio.</span>
            </span>
            <input
              type="checkbox"
              className="w-5 h-5 accent-[#16895F]"
              checked={daily}
              onChange={(e) => {
                const v = e.target.checked;
                setDaily(v);
                localStorage.setItem(DAILY_KEY, v ? '1' : '0');
                run(() => setDailySummary(v));
              }}
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <button disabled={busy} onClick={() => run(() => sendTestPush(), 'Notificación enviada.')} className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold px-4 py-2 text-sm">
              Enviar prueba
            </button>
            <button disabled={busy} onClick={() => run(async () => setState(await disablePush()))} className="inline-flex items-center gap-2 rounded-xl text-slate-400 hover:text-rose-300 font-semibold px-4 py-2 text-sm">
              <BellOff size={14} /> Desactivar
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-sm text-maiz-300" role="status">{msg}</p>}
    </div>
  );
}
