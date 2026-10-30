import { useEffect, useRef, useState } from 'react';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import { subscribeSupport, getSupport, openSupport, closeSupport, sendSupport, savedName, startSupportPolling, checkSupportEnabled } from '../../lib/support';

/** **negritas** del asistente → <strong> (sin HTML crudo) */
function rich(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
}

/** Chat de soporte de Don Punto. Burbuja flotante (si `bubble`) + panel. Pako contesta desde Telegram. */
export function SupportChat({ email }: { email: string | null }) {
  const [s, setS] = useState(getSupport());
  const [text, setText] = useState('');
  const [name, setName] = useState(savedName());
  const [mail, setMail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeSupport(setS), []);
  useEffect(() => { checkSupportEnabled().then(() => { if (getSupport().enabled) startSupportPolling(); }); }, []);
  useEffect(() => {
    // Push de respuesta: donpunto.com/?soporte=1 abre el chat
    const p = new URLSearchParams(location.search);
    if (p.get('soporte') === '1') {
      p.delete('soporte');
      history.replaceState({}, '', location.pathname + (p.toString() ? `?${p}` : ''));
      checkSupportEnabled().then(() => { if (getSupport().enabled) openSupport(); });
    }
  }, []);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [s.messages.length, s.open]);

  const first = s.messages.length === 0;
  const needsContact = first && !email;

  const submit = async (e: React.FormEvent | null, human = false) => {
    e?.preventDefault();
    const t = human ? (text.trim() || 'Quiero hablar con una persona.') : text;
    if (!t.trim() || sending) return;
    if (needsContact && !name.trim()) { setError('Escribe tu nombre.'); return; }
    setSending(true);
    setError('');
    setText('');
    try {
      await sendSupport(t, needsContact ? { name: name.trim(), email: mail.trim() } : undefined, human);
    } catch (err: any) {
      setText(t);
      setError(err?.message || 'No se pudo enviar. Revisa tu internet.');
    } finally {
      setSending(false);
    }
  };

  if (!s.enabled) return null;
  if (!s.open) {
    if (!s.bubble) return null;
    return (
      <button
        onClick={openSupport}
        className="no-print fixed bottom-4 right-4 z-[150] h-14 w-14 rounded-full bg-agave-600 text-white shadow-xl shadow-agave-900/20 flex items-center justify-center hover:bg-agave-700 active:scale-95 transition"
        aria-label="Abrir chat de soporte"
      >
        <MessageCircle size={26} />
        {s.unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-maiz-400 text-carbon-950 text-[11px] font-black flex items-center justify-center">{s.unread}</span>
        )}
      </button>
    );
  }

  const time = (at: number) => new Date(at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="no-print fixed z-[150] inset-x-0 bottom-0 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[370px] h-[min(560px,85dvh)] bg-white sm:rounded-2xl rounded-t-2xl shadow-2xl border border-carbon-950/10 flex flex-col overflow-hidden">
      <div className="bg-agave-600 text-white px-4 py-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-white/15 flex items-center justify-center"><MessageCircle size={18} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight">Soporte Don Punto</div>
          <div className="text-[11px] text-white/80">Asistente al instante · o habla con una persona</div>
        </div>
        <button onClick={closeSupport} className="p-1.5 rounded-lg hover:bg-white/15" aria-label="Cerrar chat"><X size={18} /></button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-[#F6F5F1]">
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white border border-carbon-950/5 px-3 py-2 text-sm text-carbon-800">
          ¡Hola! 👋 Soy el asistente de Don Punto. Pregúntame cómo usar la app o lo que necesites. Si hace falta, te paso con una persona del equipo.
        </div>
        {s.messages.map((m) => (
          <div key={m.id} className={m.from === 'user' ? 'flex justify-end' : 'flex'}>
            <div className={
              m.from === 'user'
                ? 'max-w-[85%] rounded-2xl rounded-tr-md bg-agave-600 text-white px-3 py-2 text-sm whitespace-pre-wrap break-words'
                : 'max-w-[85%] rounded-2xl rounded-tl-md bg-white border border-carbon-950/5 px-3 py-2 text-sm text-carbon-800 whitespace-pre-wrap break-words'
            }>
              {m.from === 'agent' && <div className="text-[10px] font-bold text-agave-700 mb-0.5">{m.bot ? 'Asistente' : 'Equipo Don Punto'}</div>}
              {rich(m.text)}
              <div className={m.from === 'user' ? 'text-[10px] text-white/70 text-right mt-0.5' : 'text-[10px] text-carbon-400 mt-0.5'}>
                {m.pending ? 'Enviando…' : time(m.at)}
              </div>
            </div>
          </div>
        ))}
        {s.typing && (
          <div className="flex"><div className="rounded-2xl rounded-tl-md bg-white border border-carbon-950/5 px-3 py-2 text-sm text-carbon-400">Escribiendo…</div></div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-carbon-950/10 p-2 space-y-2 bg-white">
        {needsContact && (
          <div className="grid grid-cols-2 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" maxLength={80} className="rounded-xl border border-carbon-950/10 px-3 py-2 text-sm outline-none focus:border-agave-500" />
            <input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Correo (opcional)" type="email" maxLength={120} className="rounded-xl border border-carbon-950/10 px-3 py-2 text-sm outline-none focus:border-agave-500" />
          </div>
        )}
        {!needsContact && !s.typing && (
          <button type="button" onClick={() => submit(null, true)} disabled={sending} className="text-[11px] font-semibold text-agave-700 underline underline-offset-2 px-1">Hablar con una persona</button>
        )}
        {error && <div className="text-xs text-rose-600 px-1">{error}</div>}
        <div className="flex gap-2 items-end">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement).requestSubmit(); } }}
            placeholder="Escribe tu mensaje…"
            rows={1}
            maxLength={1500}
            className="flex-1 resize-none max-h-28 rounded-xl border border-carbon-950/10 px-3 py-2 text-sm outline-none focus:border-agave-500"
          />
          <button type="submit" disabled={sending || !text.trim()} className="h-10 w-10 shrink-0 rounded-xl bg-agave-600 text-white flex items-center justify-center disabled:opacity-40" aria-label="Enviar">
            {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
