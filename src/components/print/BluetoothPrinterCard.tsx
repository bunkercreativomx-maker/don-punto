import { useEffect, useState } from 'react';
import { Bluetooth, BluetoothOff, Loader2 } from 'lucide-react';
import { btConnect, btForget, btState, btSubscribe, btTestPrint } from '../../lib/btPrinter';

/** Ajustes → Impresora Bluetooth (se guarda por equipo, no por cuenta). */
export function BluetoothPrinterCard({ paper80 }: { paper80: boolean }) {
  const [st, setSt] = useState(btState());
  const [msg, setMsg] = useState('');
  useEffect(() => btSubscribe(() => setSt(btState())), []);

  if (!st.supported) {
    return (
      <div className="bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-2 font-black text-slate-400 uppercase tracking-widest text-[10px] mb-1"><BluetoothOff size={14} /> Impresora Bluetooth</div>
        Este navegador no puede conectarse a impresoras Bluetooth. Usa <b>Chrome en Android o en computadora</b>. En iPhone/iPad usa la ventana de impresión normal.
      </div>
    );
  }

  const on = st.status !== 'off';
  const busy = st.status === 'connecting' || st.status === 'printing';
  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg('');
    try { await fn(); setMsg(ok); } catch (e) { setMsg((e as Error).message); }
  };

  return (
    <div className="bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-4 space-y-3">
      <div className="flex items-center gap-3">
        <Bluetooth size={18} className={st.status === 'connected' ? 'text-emerald-500' : 'text-slate-500'} />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Impresora Bluetooth (directo, sin ventana)</div>
          <div className="text-sm font-bold text-carbon-950 truncate">
            {!on ? 'Sin conectar' : `${st.name} · ${st.status === 'connected' ? 'conectada' : st.status === 'printing' ? 'imprimiendo…' : st.status === 'connecting' ? 'conectando…' : 'desconectada'}`}
          </div>
        </div>
        {busy && <Loader2 size={16} className="animate-spin text-slate-500" />}
      </div>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => run(btConnect, 'Impresora conectada. Los tickets saldrán directo por Bluetooth.')}
          className="px-4 py-2 rounded-xl text-xs font-black bg-indigo-500 text-white disabled:opacity-50">
          {on ? 'Cambiar / reconectar' : 'Conectar impresora'}
        </button>
        {on && (
          <>
            <button disabled={busy} onClick={() => run(() => btTestPrint(paper80), 'Prueba enviada.')}
              className="px-4 py-2 rounded-xl text-xs font-black border border-carbon-950/10 text-carbon-950 disabled:opacity-50">Imprimir prueba</button>
            <button disabled={busy} onClick={() => { btForget(); setMsg('Listo: se usará la ventana de impresión normal.'); }}
              className="px-4 py-2 rounded-xl text-xs font-black border border-carbon-950/10 text-rose-500 disabled:opacity-50">Quitar</button>
          </>
        )}
      </div>
      {msg && <p className="text-[11px] font-bold text-slate-400">{msg}</p>}
      <p className="text-[10px] text-slate-500 leading-snug">
        Prende la impresora y dale <b>Conectar</b>; elígela en la lista. Si no aparece, tu impresora es Bluetooth clásico: usa la ventana de impresión con la app RawBT.
        Funciona en Chrome (Android y computadora). Se guarda solo en este equipo. Ancho según el papel elegido arriba (58 u 80 mm).
      </p>
    </div>
  );
}
