import { useEffect, useState } from 'react';
import { Bluetooth, BluetoothOff, Download, Loader2, Search } from 'lucide-react';
import { btChannel, btConnect, btConnectBle, btForget, btLog, btNativeList, btNativeSelect, btNextChannel, btState, btSubscribe, btTestPrint } from '../../lib/btPrinter';
import { ANDROID_APP_URL, isAndroidBrowser, type NativePrinter } from '../../lib/nativeBridge';

/** Aviso para Android en navegador: Chrome no entrega bien los datos a las térmicas → app Don Punto. */
export function AndroidAppBanner({ compact }: { compact?: boolean }) {
  if (!isAndroidBrowser()) return null;
  return (
    <a href={ANDROID_APP_URL} target="_blank" rel="noopener" data-tour="android-app"
      className={`flex items-center gap-3 rounded-2xl bg-agave-600 text-white ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <Download size={compact ? 16 : 20} className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className={`font-black ${compact ? 'text-xs' : 'text-sm'}`}>Instala la app Don Punto para Android</div>
        <div className={`${compact ? 'text-[10px]' : 'text-[11px]'} opacity-90 leading-snug`}>Imprime directo en tu impresora Bluetooth, sin ventana ni apps extra. Mismo usuario, mismos datos.</div>
      </div>
      <span className={`shrink-0 rounded-xl bg-white/15 font-black ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}`}>Descargar</span>
    </a>
  );
}

/** Ajustes → Impresora Bluetooth (se guarda por equipo, no por cuenta). */
export function BluetoothPrinterCard({ paper80 }: { paper80: boolean }) {
  const [st, setSt] = useState(btState());
  const [msg, setMsg] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [list, setList] = useState<NativePrinter[] | null>(null);
  useEffect(() => btSubscribe(() => setSt(btState())), []);

  if (!st.supported) {
    return (
      <div className="bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3 text-[11px] text-slate-500">
        <div className="flex items-center gap-2 font-black text-slate-400 uppercase tracking-widest text-[10px] mb-1"><BluetoothOff size={14} /> Impresora Bluetooth</div>
        Este navegador no puede conectarse a impresoras Bluetooth. Usa <b>Chrome en Android o en computadora</b> (actualizado). En iPhone/iPad usa la ventana de impresión normal.
      </div>
    );
  }

  const on = st.status !== 'off';
  const busy = st.status === 'connecting' || st.status === 'printing';
  const run = async (fn: () => Promise<void>, ok: string) => {
    setMsg('');
    try { await fn(); if (ok) setMsg(ok); } catch (e) { setMsg((e as Error).message); }
  };
  const okMsg = 'Impresora conectada. Los tickets saldrán directo, sin ventana. Toca «Imprimir prueba».';

  // Dentro de la app Android: lista de impresoras emparejadas (puente nativo, como las apps de POS)
  const search = st.native
    ? () => run(async () => { setList(await btNativeList()); }, '')
    : () => run(btConnect, okMsg);

  return (
    <div className="bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-4 space-y-3" data-tour="bt-printer">
      <div className="flex items-center gap-3">
        <Bluetooth size={18} className={st.status === 'connected' ? 'text-emerald-500' : 'text-slate-500'} />
        <div className="flex-1 min-w-0">
          <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Impresora Bluetooth (directo, sin ventana){st.native ? ' · app Android' : ''}</div>
          <div className="text-sm font-bold text-carbon-950 truncate">
            {!on ? 'Sin conectar' : `${st.name} · ${st.status === 'connected' ? 'conectada' : st.status === 'printing' ? 'imprimiendo…' : st.status === 'connecting' ? 'conectando…' : 'desconectada'}`}
          </div>
        </div>
        {busy && <Loader2 size={16} className="animate-spin text-slate-500" />}
      </div>
      <AndroidAppBanner compact />
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={search}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black bg-indigo-500 text-white disabled:opacity-50">
          <Search size={14} /> {on ? 'Buscar otra impresora' : 'Buscar impresoras'}
        </button>
        {on && (
          <>
            <button disabled={busy} onClick={() => run(() => btTestPrint(paper80), 'Prueba enviada.')}
              className="px-4 py-2 rounded-xl text-xs font-black border border-carbon-950/10 text-carbon-950 disabled:opacity-50">Imprimir prueba</button>
            {st.via === 'ble' && btChannel() && (
              <button disabled={busy} onClick={() => run(async () => { const c = await btNextChannel(); await btTestPrint(paper80); setMsg(`Prueba enviada por el canal ${c}. Si no salió, toca otra vez.`); }, '')}
                className="px-4 py-2 rounded-xl text-xs font-black border border-amber-400/60 text-amber-600 disabled:opacity-50">Probar siguiente canal ({btChannel()})</button>
            )}
            <button disabled={busy} onClick={() => { btForget(); setList(null); setMsg('Listo: se usará la ventana de impresión normal.'); }}
              className="px-4 py-2 rounded-xl text-xs font-black border border-carbon-950/10 text-rose-500 disabled:opacity-50">Quitar</button>
          </>
        )}
      </div>
      {list && (
        <div className="rounded-xl border border-carbon-950/10 divide-y divide-carbon-950/5 overflow-hidden">
          <div className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-carbon-950/[0.03]">Elige tu impresora</div>
          {list.map((d) => (
            <button key={d.address} type="button" onClick={() => { btNativeSelect(d); setList(null); setMsg(okMsg); }}
              className="w-full text-left px-3 py-2.5 text-sm font-bold text-carbon-950 hover:bg-carbon-950/5 flex items-center justify-between gap-2">
              <span className="truncate">{d.name}</span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">{d.address}</span>
            </button>
          ))}
        </div>
      )}
      {msg && <p className="text-[11px] font-bold text-slate-400">{msg}</p>}
      {on && st.lastSent && (
        <p className="text-[10px] text-slate-500">Último envío: {st.lastSent.bytes} bytes a las {new Date(st.lastSent.at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}. Si no salió papel: apaga y prende la impresora, toca «Buscar otra impresora» y elige la misma.</p>
      )}
      <ol className="text-[10px] text-slate-500 leading-snug list-decimal pl-4 space-y-0.5">
        {st.native || st.serial ? (
          <>
            <li>Prende la impresora y <b>emparéjala</b> en Ajustes → Bluetooth de tu {st.native ? 'tablet o celular' : 'celular o compu'} (si pide clave: 0000 o 1234). Solo la primera vez.</li>
            <li>Toca <b>Buscar impresoras</b>, elige la tuya{st.native ? '' : ' y Conectar'}. Si pide permiso de «Dispositivos cercanos», acéptalo.</li>
          </>
        ) : (
          <li>Prende la impresora, toca <b>Buscar impresoras</b> y elígela en la lista.</li>
        )}
      </ol>
      {!st.native && st.serial && st.ble && (
        <button disabled={busy} onClick={() => run(btConnectBle, okMsg)}
          className="text-[10px] font-bold text-slate-400 underline disabled:opacity-50">
          ¿No sale en la lista? Buscar impresoras Bluetooth LE
        </button>
      )}
      <button type="button" onClick={() => setShowLog((v) => !v)} className="block text-[10px] font-bold text-slate-400 underline">{showLog ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}</button>
      {showLog && (
        <div>
          <pre className="text-[9px] leading-tight text-slate-500 bg-carbon-950/5 rounded-lg p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto select-all">{btLog()}</pre>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(btLog()).then(() => setMsg('Detalle copiado. Pégalo en el chat de Ayuda.')); }} className="mt-1 text-[10px] font-bold text-slate-400 underline">Copiar detalle</button>
        </div>
      )}
      <p className="text-[10px] text-slate-500 leading-snug">Se guarda solo en este equipo. Ancho según el papel elegido arriba (58 u 80 mm).</p>
    </div>
  );
}
