import { useState, useRef } from 'react';
import { Camera, UploadCloud, X, Sparkles, CheckCircle2, ScanLine, AlertCircle, Check, Building2, Bike } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface MenuScannerModalProps {
    onClose: () => void;
    onScanSuccess: (products: any[]) => void;
}

export function MenuScannerModal({ onClose, onScanSuccess }: MenuScannerModalProps) {
    const [step, setStep] = useState<'upload' | 'scanning' | 'success' | 'error'>('upload');
    const [progress, setProgress] = useState(0); // For fake visual progress while waiting
    const [detectedProducts, setDetectedProducts] = useState<any[]>([]);
    const [errorMessage, setErrorMessage] = useState('');
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [platforms, setPlatforms] = useState({
        tienda: true,
        didi: false,
        uber: false,
        rappi: false
    });

    const handleCardToggle = (key: 'tienda' | 'didi' | 'uber' | 'rappi') => {
        setPlatforms(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    /** Comprime la imagen a un tamaño razonable para evitar el límite de 4.5 MB de Vercel */
    const compressImage = (file: File, maxDimension = 1200, quality = 0.8): Promise<{ base64: string; mimeType: string }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > maxDimension || height > maxDimension) {
                    const ratio = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0, width, height);
                const compressed = canvas.toDataURL('image/jpeg', quality);
                resolve({ base64: compressed, mimeType: 'image/jpeg' });
            };
            img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
            img.src = URL.createObjectURL(file);
        });
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // Comprimir antes de enviar para evitar HTTP 413 (Vercel limita a 4.5 MB)
            const { base64, mimeType } = await compressImage(file);

            setPreviewImage(base64);
            processImageWithGemini(base64, mimeType);
        } catch (err: any) {
            setErrorMessage(err.message || 'Error al procesar la imagen');
            setStep('error');
        }
    };

    const processImageWithGemini = async (base64Image: string, mimeType: string) => {
        setStep('scanning');
        
        // Start a visual progress bar (it just loops around 90% while waiting for the real API)
        let currentProgress = 0;
        const timer = setInterval(() => {
            currentProgress += 5;
            if (currentProgress < 90) {
                setProgress(currentProgress);
            }
        }, 300);

        try {
            const base64Data = base64Image.split(',')[1];

            const res = await fetch('/api/scan-menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64Data, mimeType }),
            });

            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`Error del servidor (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
            }

            const parsedArray = await res.json();

            if (!Array.isArray(parsedArray)) {
                throw new Error("El formato devuelto no es un arreglo válido.");
            }

            const products = parsedArray.map((p: any) => ({
                id: crypto.randomUUID(),
                name: p.name,
                salePrice: Number(p.salePrice) || 0,
                costPrice: 0,
                targetProfit: Number(p.salePrice) || 0 
            }));

            clearInterval(timer);
            setProgress(100);
            setDetectedProducts(products);
            setStep('success');

        } catch (error: any) {
            console.error("Error al procesar con Gemini:", error);
            clearInterval(timer);
            setErrorMessage(error.message || "No se pudieron extraer los productos. Asegúrate de que la foto sea clara.");
            setStep('error');
        }
    };

    const handleComplete = () => {
        const mappedProducts = detectedProducts.map(p => {
            const basePrice = Number(p.salePrice) || 0;
            return {
                id: p.id || crypto.randomUUID(),
                name: p.name,
                costPrice: 0,
                salePrice: platforms.tienda ? basePrice : 0,
                didiPrice: platforms.didi ? basePrice : undefined,
                uberPrice: platforms.uber ? basePrice : undefined,
                rappiPrice: platforms.rappi ? basePrice : undefined,
                targetProfit: platforms.tienda ? basePrice : 0
            };
        });
        onScanSuccess(mappedProducts);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300 no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-xl shadow-[0_0_100px_-20px_rgba(99,102,241,0.3)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10" />
                    <div className="relative flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                            <Sparkles size={20} className={step === 'scanning' ? "animate-spin-slow" : ""} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight">Escáner de Menú IA</h3>
                            <p className="text-xs text-indigo-200/60 font-medium">Análisis automático inteligente</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors relative z-10"><X size={24} /></button>
                </div>

                {/* Content */}
                <div className="p-8">
                    {step === 'upload' && (
                        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4">
                            <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                ref={fileInputRef} 
                                onChange={handleFileSelect}
                            />
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all group"
                            >
                                <div className="bg-slate-900 p-4 rounded-2xl shadow-xl group-hover:scale-110 group-hover:-translate-y-2 transition-all duration-300 mb-6 relative">
                                    <div className="absolute inset-0 bg-indigo-500/20 rounded-2xl blur-xl" />
                                    <Camera size={48} className="text-indigo-400 relative z-10" />
                                </div>
                                <h4 className="text-lg font-bold text-white mb-2">Toma una foto o sube tu menú</h4>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto">La IA de Google leerá tu menú real en segundos y extraerá todos los platillos.</p>
                                
                                <div className="mt-8 flex items-center gap-2 text-xs font-bold text-indigo-400 bg-indigo-500/10 px-4 py-2 rounded-full border border-indigo-500/20">
                                    <UploadCloud size={16} /> HAZ CLIC PARA SUBIR IMAGEN
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 'scanning' && (
                        <div className="flex flex-col items-center justify-center py-12 animate-in fade-in zoom-in-95">
                            <div className="relative w-48 h-64 bg-slate-800 rounded-2xl border border-white/10 overflow-hidden shadow-2xl mb-8 flex items-center justify-center">
                                {/* Real Image Preview */}
                                {previewImage ? (
                                    <img src={previewImage} alt="Menu preview" className="absolute inset-0 w-full h-full object-cover opacity-30" />
                                ) : (
                                    <div className="absolute inset-0 opacity-20 bg-[url('https://images.unsplash.com/photo-1555396273-367ea4eb4db5?q=80&w=400&auto=format&fit=crop')] bg-cover bg-center" />
                                )}
                                
                                {/* Scanner Line */}
                                <div 
                                    className="absolute left-0 right-0 h-1 bg-indigo-400 shadow-[0_0_20px_2px_rgba(99,102,241,1)] z-20 transition-all duration-300"
                                    style={{ top: `${progress}%` }}
                                />
                                <div 
                                    className="absolute left-0 right-0 top-0 bg-indigo-500/20 backdrop-blur-[1px] z-10 transition-all duration-300"
                                    style={{ height: `${progress}%` }}
                                />
                                <ScanLine className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500/50" size={64} />
                            </div>
                            
                            <h4 className="text-xl font-black text-white tracking-tight mb-2 animate-pulse">Procesando imagen...</h4>
                            <p className="text-sm text-slate-400 font-medium h-6">
                                Analizando la imagen y extrayendo platillos ({progress}%)
                            </p>
                        </div>
                    )}

                    {step === 'error' && (
                        <div className="flex flex-col items-center justify-center py-8 animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-20 h-20 bg-rose-500/20 text-rose-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(244,63,94,0.3)]">
                                <AlertCircle size={40} />
                            </div>
                            <h4 className="text-2xl font-black text-white tracking-tight mb-2">Hubo un problema</h4>
                            <p className="text-sm text-slate-400 text-center max-w-sm mb-8">
                                {errorMessage}
                            </p>

                            <button 
                                onClick={() => setStep('upload')}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-2xl transition-all"
                            >
                                INTENTAR DE NUEVO
                            </button>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-4 animate-in fade-in slide-in-from-bottom-4">
                            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mb-4 shadow-[0_0_40px_rgba(52,211,153,0.3)]">
                                <CheckCircle2 size={32} />
                            </div>
                            <h4 className="text-2xl font-black text-white tracking-tight mb-2">¡Menú Digitalizado!</h4>
                            <p className="text-sm text-slate-400 text-center max-w-sm mb-6">
                                La IA extrajo <strong>{detectedProducts.length} platillos</strong> con éxito.
                            </p>
                            
                            <div className="w-full max-h-40 overflow-y-auto mb-6 bg-slate-950/50 border border-white/5 rounded-xl p-2 no-scrollbar">
                                {detectedProducts.map((p, i) => (
                                    <div key={i} className="flex justify-between items-center py-2 px-3 border-b border-white/5 last:border-0">
                                        <span className="text-sm font-medium text-slate-300">{p.name}</span>
                                        <span className="text-sm font-black text-white">${p.salePrice}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Canales de Destino */}
                            <div className="w-full space-y-3 mb-6">
                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block text-left">
                                    Canales de Destino
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {/* Tienda Fisica */}
                                    <div 
                                        onClick={() => handleCardToggle('tienda')}
                                        className={cn(
                                            "border rounded-xl p-2.5 cursor-pointer transition-all duration-300 flex items-center justify-between group overflow-hidden",
                                            platforms.tienda 
                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 animate-in fade-in" 
                                                : "bg-slate-950/40 border-white/5 text-slate-500 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Building2 size={14} className={platforms.tienda ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                                            <span className="text-[11px] font-bold text-white">Tienda Física</span>
                                        </div>
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                                            platforms.tienda 
                                                ? "bg-emerald-500 border-emerald-400 text-white" 
                                                : "border-white/10 bg-slate-900 text-transparent"
                                        )}>
                                            <Check size={10} strokeWidth={3} />
                                        </div>
                                    </div>

                                    {/* DiDi */}
                                    <div 
                                        onClick={() => handleCardToggle('didi')}
                                        className={cn(
                                            "border rounded-xl p-2.5 cursor-pointer transition-all duration-300 flex items-center justify-between group overflow-hidden",
                                            platforms.didi 
                                                ? "bg-orange-500/10 border-orange-500/30 text-orange-400" 
                                                : "bg-slate-950/40 border-white/5 text-slate-500 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Bike size={14} className={platforms.didi ? "text-orange-400 animate-pulse" : "text-slate-500"} />
                                            <span className="text-[11px] font-bold text-white">DiDi Food</span>
                                        </div>
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                                            platforms.didi 
                                                ? "bg-orange-500 border-orange-400 text-white" 
                                                : "border-white/10 bg-slate-900 text-transparent"
                                        )}>
                                            <Check size={10} strokeWidth={3} />
                                        </div>
                                    </div>

                                    {/* Uber */}
                                    <div 
                                        onClick={() => handleCardToggle('uber')}
                                        className={cn(
                                            "border rounded-xl p-2.5 cursor-pointer transition-all duration-300 flex items-center justify-between group overflow-hidden",
                                            platforms.uber 
                                                ? "bg-green-500/10 border-green-500/30 text-green-400" 
                                                : "bg-slate-950/40 border-white/5 text-slate-500 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Bike size={14} className={platforms.uber ? "text-green-400 animate-pulse" : "text-slate-500"} />
                                            <span className="text-[11px] font-bold text-white">Uber Eats</span>
                                        </div>
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                                            platforms.uber 
                                                ? "bg-green-500 border-green-400 text-white" 
                                                : "border-white/10 bg-slate-900 text-transparent"
                                        )}>
                                            <Check size={10} strokeWidth={3} />
                                        </div>
                                    </div>

                                    {/* Rappi */}
                                    <div 
                                        onClick={() => handleCardToggle('rappi')}
                                        className={cn(
                                            "border rounded-xl p-2.5 cursor-pointer transition-all duration-300 flex items-center justify-between group overflow-hidden",
                                            platforms.rappi 
                                                ? "bg-pink-500/10 border-pink-500/30 text-pink-400" 
                                                : "bg-slate-950/40 border-white/5 text-slate-500 hover:border-white/10"
                                        )}
                                    >
                                        <div className="flex items-center gap-2">
                                            <Bike size={14} className={platforms.rappi ? "text-pink-400 animate-pulse" : "text-slate-500"} />
                                            <span className="text-[11px] font-bold text-white">Rappi</span>
                                        </div>
                                        <div className={cn(
                                            "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                                            platforms.rappi 
                                                ? "bg-pink-500 border-pink-400 text-white" 
                                                : "border-white/10 bg-slate-900 text-transparent"
                                        )}>
                                            <Check size={10} strokeWidth={3} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleComplete}
                                className="w-full bg-indigo-500 hover:bg-indigo-400 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                <Sparkles size={20} /> IMPORTAR AL SISTEMA
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
