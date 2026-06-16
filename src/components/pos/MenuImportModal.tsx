import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileSpreadsheet, Check, AlertCircle, Building2, Bike } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface ImportPlatforms {
    tienda: boolean;
    didi: boolean;
    uber: boolean;
    rappi: boolean;
}

interface MenuImportModalProps {
    onClose: () => void;
    onImport: (platforms: ImportPlatforms, file: File) => void;
}

export function MenuImportModal({ onClose, onImport }: MenuImportModalProps) {
    const [platforms, setPlatforms] = useState<ImportPlatforms>({
        tienda: true,
        didi: true,
        uber: false,
        rappi: false
    });
    const [file, setFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCardToggle = (key: keyof ImportPlatforms) => {
        setPlatforms(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const validateAndSetFile = (selectedFile: File) => {
        setError(null);
        const ext = selectedFile.name.split('.').pop()?.toLowerCase();
        if (ext !== 'xlsx' && ext !== 'xls') {
            setError("Formato no válido. Por favor sube un archivo Excel (.xlsx o .xls)");
            setFile(null);
            return;
        }
        setFile(selectedFile);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            validateAndSetFile(selectedFile);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = () => {
        setDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) {
            validateAndSetFile(droppedFile);
        }
    };

    const handleProcessImport = () => {
        const anySelected = Object.values(platforms).some(Boolean);
        if (!anySelected) {
            setError("Debes seleccionar al menos un canal para cargar los precios.");
            return;
        }
        if (!file) {
            setError("Por favor, selecciona un archivo Excel para continuar.");
            return;
        }
        onImport(platforms, file);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300 no-print">
            <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl shadow-[0_0_100px_-20px_rgba(99,102,241,0.3)] flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
                
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/30 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 to-purple-500/10" />
                    <div className="relative flex items-center gap-3">
                        <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
                            <FileSpreadsheet size={20} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight">Importador de Menú Inteligente</h3>
                            <p className="text-xs text-indigo-200/60 font-medium">Configura canales y carga tu menú de Excel</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors relative z-10">
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)] no-scrollbar">
                    
                    {/* Step 1: Channels Select */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">
                            Paso 1: Seleccionar Canales de Destino
                        </label>
                        <p className="text-slate-400 text-xs font-medium">
                            Los precios del archivo se aplicarán únicamente a los canales que selecciones a continuación.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            {/* Tienda Fisica */}
                            <div 
                                onClick={() => handleCardToggle('tienda')}
                                className={cn(
                                    "border rounded-2xl p-4 cursor-pointer transition-all duration-300 relative flex items-center justify-between group overflow-hidden",
                                    platforms.tienda 
                                        ? "bg-emerald-500/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]" 
                                        : "bg-slate-950/40 border-white/5 hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className={cn(
                                        "p-2.5 rounded-xl border transition-colors",
                                        platforms.tienda 
                                            ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" 
                                            : "bg-slate-900 border-white/5 text-slate-500"
                                    )}>
                                        <Building2 size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-white">Tienda Física</div>
                                        <div className="text-[10px] text-slate-400 font-medium">Precios desinflados (/1.42)</div>
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                                    platforms.tienda 
                                        ? "bg-emerald-500 border-emerald-400 text-white" 
                                        : "border-white/10 bg-slate-900 text-transparent"
                                )}>
                                    <Check size={14} strokeWidth={3} />
                                </div>
                            </div>

                            {/* Didi Food */}
                            <div 
                                onClick={() => handleCardToggle('didi')}
                                className={cn(
                                    "border rounded-2xl p-4 cursor-pointer transition-all duration-300 relative flex items-center justify-between group overflow-hidden",
                                    platforms.didi 
                                        ? "bg-orange-500/10 border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.1)]" 
                                        : "bg-slate-950/40 border-white/5 hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className={cn(
                                        "p-2.5 rounded-xl border transition-colors",
                                        platforms.didi 
                                            ? "bg-orange-500/20 border-orange-500/30 text-orange-400" 
                                            : "bg-slate-900 border-white/5 text-slate-500"
                                    )}>
                                        <Bike size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-white">DiDi Food</div>
                                        <div className="text-[10px] text-slate-400 font-medium">Precio del archivo directo</div>
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                                    platforms.didi 
                                        ? "bg-orange-500 border-orange-400 text-white" 
                                        : "border-white/10 bg-slate-900 text-transparent"
                                )}>
                                    <Check size={14} strokeWidth={3} />
                                </div>
                            </div>

                            {/* Uber Eats */}
                            <div 
                                onClick={() => handleCardToggle('uber')}
                                className={cn(
                                    "border rounded-2xl p-4 cursor-pointer transition-all duration-300 relative flex items-center justify-between group overflow-hidden",
                                    platforms.uber 
                                        ? "bg-green-500/10 border-green-500/30 shadow-[0_0_20px_rgba(34,197,94,0.1)]" 
                                        : "bg-slate-950/40 border-white/5 hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className={cn(
                                        "p-2.5 rounded-xl border transition-colors",
                                        platforms.uber 
                                            ? "bg-green-500/20 border-green-500/30 text-green-400" 
                                            : "bg-slate-900 border-white/5 text-slate-500"
                                    )}>
                                        <Bike size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-white">Uber Eats</div>
                                        <div className="text-[10px] text-slate-400 font-medium">Precio del archivo directo</div>
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                                    platforms.uber 
                                        ? "bg-green-500 border-green-400 text-white" 
                                        : "border-white/10 bg-slate-900 text-transparent"
                                )}>
                                    <Check size={14} strokeWidth={3} />
                                </div>
                            </div>

                            {/* Rappi */}
                            <div 
                                onClick={() => handleCardToggle('rappi')}
                                className={cn(
                                    "border rounded-2xl p-4 cursor-pointer transition-all duration-300 relative flex items-center justify-between group overflow-hidden",
                                    platforms.rappi 
                                        ? "bg-pink-500/10 border-pink-500/30 shadow-[0_0_20px_rgba(236,72,153,0.1)]" 
                                        : "bg-slate-950/40 border-white/5 hover:border-white/10"
                                )}
                            >
                                <div className="flex items-center gap-3 relative z-10">
                                    <div className={cn(
                                        "p-2.5 rounded-xl border transition-colors",
                                        platforms.rappi 
                                            ? "bg-pink-500/20 border-pink-500/30 text-pink-400" 
                                            : "bg-slate-900 border-white/5 text-slate-500"
                                    )}>
                                        <Bike size={18} />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-sm font-bold text-white">Rappi</div>
                                        <div className="text-[10px] text-slate-400 font-medium">Precio del archivo directo</div>
                                    </div>
                                </div>
                                <div className={cn(
                                    "w-6 h-6 rounded-full border flex items-center justify-center transition-all",
                                    platforms.rappi 
                                        ? "bg-pink-500 border-pink-400 text-white" 
                                        : "border-white/10 bg-slate-900 text-transparent"
                                )}>
                                    <Check size={14} strokeWidth={3} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: File Dropzone */}
                    <div className="space-y-3">
                        <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">
                            Paso 2: Subir Archivo Excel
                        </label>
                        <input 
                            type="file" 
                            accept=".xlsx, .xls" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleFileChange}
                        />

                        <div 
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={cn(
                                "border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group",
                                dragOver 
                                    ? "border-indigo-500 bg-indigo-500/10" 
                                    : file 
                                        ? "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10"
                                        : "border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10"
                            )}
                        >
                            <div className={cn(
                                "p-4 rounded-2xl shadow-xl transition-all duration-300 mb-4 relative",
                                file 
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                                    : "bg-slate-900 border border-indigo-500/20 text-indigo-400 group-hover:scale-105"
                            )}>
                                {file ? (
                                    <FileSpreadsheet size={40} className="text-emerald-400" />
                                ) : (
                                    <UploadCloud size={40} className="text-indigo-400" />
                                )}
                            </div>

                            {file ? (
                                <div className="space-y-1">
                                    <h4 className="text-base font-bold text-white max-w-sm overflow-hidden text-ellipsis whitespace-nowrap">
                                        {file.name}
                                    </h4>
                                    <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                                        {(file.size / 1024).toFixed(1)} KB • LISTO PARA IMPORTAR
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <h4 className="text-base font-bold text-white">Arrastra aquí tu archivo Excel o haz clic</h4>
                                    <p className="text-xs text-slate-400 max-w-xs mx-auto">
                                        Sube la plantilla de catálogo en formato .xlsx o .xls
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error Alerts */}
                    {error && (
                        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-semibold animate-in slide-in-from-bottom-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-6 border-t border-white/5 bg-slate-950/20 flex gap-4">
                    <button 
                        onClick={onClose}
                        className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 text-white font-black rounded-2xl transition-all active:scale-[0.98]"
                    >
                        CANCELAR
                    </button>
                    <button 
                        onClick={handleProcessImport}
                        disabled={!file}
                        className={cn(
                            "flex-1 py-4 font-black rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl active:scale-[0.98]",
                            file 
                                ? "bg-indigo-500 hover:bg-indigo-400 text-white shadow-indigo-500/20" 
                                : "bg-slate-800 text-slate-600 cursor-not-allowed"
                        )}
                    >
                        <FileSpreadsheet size={18} />
                        COMENZAR IMPORTACIÓN
                    </button>
                </div>
            </div>
        </div>
    );
}
