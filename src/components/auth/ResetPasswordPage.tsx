import { useState } from 'react';
import { Lock, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { pb } from '../../lib/pocketbase';
import { Mark, Wordmark } from '../brand/Logo';

/** Pantalla del enlace que llega por correo: /restablecer?token=... */
export function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(token ? '' : 'El enlace está incompleto. Pide uno nuevo desde "¿Olvidaste tu contraseña?".');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (pw.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (pw !== pw2) return setError('Las contraseñas no coinciden.');
    setLoading(true);
    try {
      await pb.collection('users').confirmPasswordReset(token, pw, pw);
      setDone(true);
    } catch (err: any) {
      setError(err?.status === 400
        ? 'El enlace ya venció o ya se usó. Pide uno nuevo desde "¿Olvidaste tu contraseña?".'
        : 'No se pudo cambiar la contraseña. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const input = 'w-full bg-slate-950/50 border border-carbon-950/10 rounded-xl pl-11 pr-4 py-3 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all';
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-carbon-950/10 rounded-3xl p-8 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5"><Mark size={56} /></div>
          <div className="flex justify-center"><Wordmark tone="light" height={30} /></div>
          <p className="text-slate-400 mt-2 text-sm font-medium">{done ? 'Listo.' : 'Crea tu contraseña nueva.'}</p>
        </div>
        {done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 size={44} className="mx-auto text-agave-600" />
            <p className="text-carbon-900 font-semibold">Tu contraseña se cambió</p>
            <a href="/login" className="block w-full bg-agave-600 hover:bg-agave-700 text-white font-bold py-3 rounded-xl transition-colors">Iniciar sesión</a>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-rose-300">{error}</p>
              </div>
            )}
            {[['Contraseña nueva', pw, setPw], ['Repítela', pw2, setPw2]].map(([label, val, set], i) => (
              <div key={i} className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase">{label as string}</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"><Lock size={18} className="text-slate-500" /></div>
                  <input type="password" required minLength={8} autoComplete="new-password" value={val as string}
                    onChange={(e) => (set as (v: string) => void)(e.target.value)} className={input} placeholder="Mínimo 8 caracteres" disabled={!token} />
                </div>
              </div>
            ))}
            <button type="submit" disabled={loading || !token} className="w-full mt-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-all flex items-center justify-center gap-2">
              {loading ? <Loader2 size={20} className="animate-spin" /> : 'GUARDAR CONTRASEÑA'}
            </button>
            <a href="/login" className="block text-center text-sm font-bold text-indigo-400 hover:text-indigo-300">Volver a iniciar sesión</a>
          </form>
        )}
      </div>
    </div>
  );
}
