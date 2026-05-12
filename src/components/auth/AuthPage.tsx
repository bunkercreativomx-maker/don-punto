import { useState } from 'react';
import { Mail, Lock, Building2, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export function AuthPage({ onAuthSuccess }: { onAuthSuccess: () => void }) {
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
                const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
                if (authError) throw authError;
                onAuthSuccess();
            } else {
                if (!restaurantName.trim()) {
                    throw new Error("El nombre del negocio es obligatorio para el registro.");
                }

                // Register user
                const { data, error: authError } = await supabase.auth.signUp({ email, password });
                if (authError) throw authError;
                
                // Si requiere confirmación por email, mostramos mensaje. Si no, insertamos restaurante.
                if (data.user) {
                    const { error: dbError } = await supabase.from('restaurants').insert([
                        { name: restaurantName, owner_id: data.user.id }
                    ]);
                    if (dbError) throw dbError;
                    
                    onAuthSuccess();
                } else {
                    throw new Error("No se pudo crear el usuario. Revisa las configuraciones de Supabase.");
                }
            }
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error en la autenticación.');
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
                <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    <div className="text-center mb-8">
                        <div className="inline-flex p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl mb-4 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                            <Building2 size={32} />
                        </div>
                        <h1 className="text-3xl font-black text-white tracking-tight">
                            Don Punto
                        </h1>
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
                                        className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
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
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
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
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-950/50 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-6 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white font-black py-4 rounded-xl shadow-xl shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
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
