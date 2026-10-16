import { useState } from 'react';
import { Mail, Lock, Building2, ChevronRight, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { pb } from '../../lib/pocketbase';
import { Mark, Wordmark } from '../brand/Logo';


function friendlyError(err: any, isLogin: boolean): string {
    const data = err?.response?.data || err?.data?.data || {};
    if (data.email?.code === 'validation_not_unique' || data.email?.code === 'validation_invalid_email')
        return data.email.code === 'validation_not_unique' ? 'Ese correo ya tiene cuenta. Inicia sesión.' : 'El correo no es válido.';
    if (data.password) return 'La contraseña debe tener al menos 8 caracteres.';
    if (err?.status === 400 && isLogin) return 'Correo o contraseña incorrectos.';
    if (err?.status === 429) return 'Demasiados intentos. Espera un minuto.';
    if (!err?.status && err?.isAbort !== true && /fetch|network/i.test(err?.message || '')) return 'Sin conexión. Revisa tu internet.';
    return err?.message && !/Failed to|Something went wrong/i.test(err.message) ? err.message : 'Ocurrió un error. Intenta de nuevo.';
}

export function AuthPage({ onAuthSuccess, onBack }: { onAuthSuccess: () => void; onBack?: () => void }) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [restaurantName, setRestaurantName] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                await pb.collection('users').authWithPassword(email.trim().toLowerCase(), password);
                onAuthSuccess();
            } else {
                if (!restaurantName.trim()) {
                    throw new Error("El nombre del negocio es obligatorio para el registro.");
                }
                if (password.length < 8) {
                    throw new Error("La contraseña debe tener al menos 8 caracteres.");
                }

                // Registrar usuario en PocketBase
                const cleanEmail = email.trim().toLowerCase();
                const newUser = await pb.collection('users').create({ email: cleanEmail, password, passwordConfirm: password });
                // Iniciar sesión inmediatamente
                await pb.collection('users').authWithPassword(cleanEmail, password);
                // Crear su restaurante
                await pb.collection('restaurants').create({ name: restaurantName.trim(), owner: newUser.id });
                onAuthSuccess();
            }
        } catch (err: any) {
            setError(friendlyError(err, isLogin));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-500/20 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-pink-500/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="w-full max-w-md z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                {onBack && (
                    <button onClick={onBack} className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-carbon-950">
                        <ArrowLeft size={16} /> Volver
                    </button>
                )}
                <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-3xl p-8 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
                    <div className="text-center mb-8">
                        <div className="flex justify-center mb-5"><Mark size={56} /></div>
                        <h1 className="sr-only">Don Punto</h1>
                        <div className="flex justify-center"><Wordmark tone="light" height={30} /></div>
                        <p className="text-slate-400 mt-2 text-sm font-medium">
                            {isLogin ? 'Ingresa a tu cuenta para gestionar tu restaurante.' : 'Crea tu cuenta y comienza a vender en minutos.'}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-3">
                            <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm text-rose-300">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase">Nombre del Negocio</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Building2 size={18} className="text-slate-500" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={restaurantName}
                                        onChange={(e) => setRestaurantName(e.target.value)}
                                        className="w-full bg-slate-950/50 border border-carbon-950/10 rounded-xl pl-11 pr-4 py-3 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                        placeholder="Ej. Pizzería Don Juan"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase">Correo Electrónico</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail size={18} className="text-slate-500" />
                                </div>
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-carbon-950/10 rounded-xl pl-11 pr-4 py-3 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    placeholder="tu@correo.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-500 uppercase">Contraseña</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={18} className="text-slate-500" />
                                </div>
                                <input
                                    type="password"
                                    required
                                    minLength={isLogin ? undefined : 8}
                                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-carbon-950/10 rounded-xl pl-11 pr-4 py-3 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-6 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
                        >
                            {loading ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <>
                                    {isLogin ? 'INICIAR SESIÓN' : 'CREAR CUENTA'}
                                    <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                        {!isLogin && (
                            <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                                Al crear tu cuenta aceptas los <a href="/terminos" target="_blank" className="underline hover:text-slate-300">Términos</a> y el <a href="/privacidad" target="_blank" className="underline hover:text-slate-300">Aviso de Privacidad</a>.
                            </p>
                        )}
                    </form>

                    <div className="mt-8 text-center">
                        <p className="text-sm text-slate-400">
                            {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes una cuenta?'}
                            <button
                                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                                className="ml-2 font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                {isLogin ? 'Regístrate aquí' : 'Inicia Sesión'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
