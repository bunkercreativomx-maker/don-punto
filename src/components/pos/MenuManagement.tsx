import { useState } from 'react';
import { Plus, Trash2, Edit2, Layers, Tag, X, Check } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}
import type { Category, ModifierGroup, Modifier, ProductRowData } from '../../types/calculator';

interface MenuManagementProps {
    categories: Category[];
    modifierGroups: ModifierGroup[];
    products: ProductRowData[];
    addCategory: (name: string) => void;
    updateCategory: (id: string, name: string) => void;
    removeCategory: (id: string) => void;
    addModifierGroup: (group: Omit<ModifierGroup, 'id'>) => void;
    updateModifierGroup: (id: string, updates: Partial<ModifierGroup>) => void;
    removeModifierGroup: (id: string) => void;
    updateProduct: (id: string, updates: Partial<ProductRowData>) => void;
}

export function MenuManagement({
    categories,
    modifierGroups,
    products,
    addCategory,
    updateCategory,
    removeCategory,
    addModifierGroup,
    updateModifierGroup,
    removeModifierGroup,
    updateProduct
}: MenuManagementProps) {
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const [isModGroupModalOpen, setIsModGroupModalOpen] = useState(false);
    const [editingModGroupId, setEditingModGroupId] = useState<string | null>(null);
    const [modGroupName, setModGroupName] = useState('');
    const [modGroupOptions, setModGroupOptions] = useState<Omit<Modifier, 'id'>[]>([]);
    const [selectionType, setSelectionType] = useState<'single' | 'multiple'>('multiple');

    // Categoría Management
    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;
        addCategory(newCategoryName);
        setNewCategoryName('');
    };

    const startEditingCategory = (cat: Category) => {
        setEditingCategoryId(cat.id);
        setEditName(cat.name);
    };

    const saveCategoryEdit = () => {
        if (editingCategoryId && editName.trim()) {
            updateCategory(editingCategoryId, editName);
            setEditingCategoryId(null);
        }
    };

    // Modifier Group Management
    const openModGroupModal = (group?: ModifierGroup) => {
        if (group) {
            setEditingModGroupId(group.id);
            setModGroupName(group.name);
            setModGroupOptions(group.options);
            setSelectionType(group.selectionType);
        } else {
            setEditingModGroupId(null);
            setModGroupName('');
            setModGroupOptions([]);
            setSelectionType('multiple');
        }
        setIsModGroupModalOpen(true);
    };

    const handleAddOption = () => {
        setModGroupOptions([...modGroupOptions, { name: '', extraPrice: 0 }]);
    };

    const updateOption = (index: number, updates: Partial<Modifier>) => {
        const newOptions = [...modGroupOptions];
        newOptions[index] = { ...newOptions[index], ...updates };
        setModGroupOptions(newOptions);
    };

    const removeOption = (index: number) => {
        setModGroupOptions(modGroupOptions.filter((_, i) => i !== index));
    };

    const saveModGroup = () => {
        if (!modGroupName.trim()) return;
        
        const optionsWithIds = modGroupOptions.map(o => ({
            ...o,
            id: (o as Modifier).id || crypto.randomUUID()
        }));

        if (editingModGroupId) {
            updateModifierGroup(editingModGroupId, {
                name: modGroupName,
                options: optionsWithIds,
                selectionType
            });
        } else {
            addModifierGroup({
                name: modGroupName,
                options: optionsWithIds,
                selectionType
            });
        }
        setIsModGroupModalOpen(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Categorías Section */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <Layers size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Categorías</h2>
                        <p className="text-xs text-slate-400">Organiza tu menú (ej. Hamburguesas, Alitas)</p>
                    </div>
                </div>

                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        placeholder="Nueva categoría..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                        className="flex-grow bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                    <button
                        onClick={handleAddCategory}
                        className="bg-indigo-500 hover:bg-indigo-400 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                <div className="space-y-2">
                    {categories.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-white/5 rounded-xl">No hay categorías. Agrega una arriba.</p>
                    ) : (
                        categories.map(cat => (
                            <div key={cat.id} className="flex items-center justify-between bg-slate-800/30 border border-white/5 p-3 rounded-xl group hover:bg-slate-800/50 transition-all">
                                {editingCategoryId === cat.id ? (
                                    <div className="flex-grow flex gap-2">
                                        <input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            autoFocus
                                            className="flex-grow bg-slate-950 border border-indigo-500/50 rounded-lg px-3 py-1 text-sm text-white outline-none"
                                        />
                                        <button onClick={saveCategoryEdit} className="text-emerald-400 p-1 hover:bg-emerald-500/10 rounded-md"><Check size={18} /></button>
                                        <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 p-1 hover:bg-slate-500/10 rounded-md"><X size={18} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-sm font-medium text-slate-200">{cat.name}</span>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => startEditingCategory(cat)} className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-all"><Edit2 size={14} /></button>
                                            <button onClick={() => removeCategory(cat.id)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"><Trash2 size={14} /></button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Modificadores Section */}
            <div className="bg-slate-900/60 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30">
                            <Tag size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Modificadores</h2>
                            <p className="text-xs text-slate-400">Extras, salsas e ingredientes adicionales</p>
                        </div>
                    </div>
                    <button
                        onClick={() => openModGroupModal()}
                        className="bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 border border-pink-500/30 px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
                    >
                        <Plus size={16} /> NUEVO GRUPO
                    </button>
                </div>

                <div className="space-y-4">
                    {modifierGroups.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-white/5 rounded-xl">Crea grupos de opciones como "Salsas" o "Extras".</p>
                    ) : (
                        modifierGroups.map(group => (
                            <div key={group.id} className="bg-slate-800/30 border border-white/5 rounded-2xl p-4 group">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-white text-sm">{group.name}</h3>
                                        <span className="text-[10px] text-slate-500 uppercase font-black">{group.selectionType === 'single' ? 'Unica Selección' : 'Selección Múltiple'}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => openModGroupModal(group)} className="p-2 text-slate-500 hover:text-indigo-400 rounded-lg transition-all"><Edit2 size={14} /></button>
                                        <button onClick={() => removeModifierGroup(group.id)} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition-all"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {group.options.map((opt, i) => (
                                        <span key={i} className="text-[10px] bg-slate-950/50 border border-white/5 text-slate-400 px-2 py-1 rounded-lg">
                                            {opt.name} {opt.extraPrice > 0 && <span className="text-emerald-500 ml-1">+${opt.extraPrice}</span>}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Product Assignment Section (Grid wide) */}
            <div className="lg:col-span-2 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <Check className="text-indigo-400" size={18} /> Asignación de Productos
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {products.map(prod => (
                        <div key={prod.id} className="bg-slate-950/40 border border-white/5 p-4 rounded-2xl flex flex-col gap-3">
                            <div className="font-bold text-slate-200 text-sm truncate">{prod.name}</div>
                            
                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-slate-500">Categoría</label>
                                <select 
                                    value={prod.categoryId || ''}
                                    onChange={(e) => updateProduct(prod.id, { categoryId: e.target.value || undefined })}
                                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                                >
                                    <option value="">Sin Categoría</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] uppercase font-black text-slate-500">Modificadores</label>
                                <div className="flex flex-wrap gap-1.5">
                                    {modifierGroups.map(group => {
                                        const isSelected = prod.modifierGroupIds?.includes(group.id);
                                        return (
                                            <button
                                                key={group.id}
                                                onClick={() => {
                                                    const current = prod.modifierGroupIds || [];
                                                    const next = isSelected 
                                                        ? current.filter(id => id !== group.id)
                                                        : [...current, group.id];
                                                    updateProduct(prod.id, { modifierGroupIds: next });
                                                }}
                                                className={cn(
                                                    "px-2 py-1 rounded-lg text-[10px] font-bold border transition-all",
                                                    isSelected 
                                                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" 
                                                        : "bg-slate-900 border-white/5 text-slate-500 hover:text-slate-300"
                                                )}
                                            >
                                                {group.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Modal for Modifier Group Add/Edit */}
            {isModGroupModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-slate-800/20 rounded-t-2xl">
                            <h3 className="text-xl font-bold text-white tracking-tight">Configurar Grupo de Modificadores</h3>
                            <button onClick={() => setIsModGroupModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X/></button>
                        </div>
                        
                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Nombre del Grupo (ej: Salsas)</label>
                                <input
                                    value={modGroupName}
                                    onChange={(e) => setModGroupName(e.target.value)}
                                    placeholder="Nombre del grupo..."
                                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Tipo de Selección</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setSelectionType('single')}
                                        className={cn("py-2 rounded-xl text-xs font-bold border transition-all", selectionType === 'single' ? "bg-indigo-500 border-indigo-400 text-white shadow-lg" : "bg-slate-950 border-white/5 text-slate-500")}
                                    >SOLO UNA (Radio)</button>
                                    <button 
                                        onClick={() => setSelectionType('multiple')}
                                        className={cn("py-2 rounded-xl text-xs font-bold border transition-all", selectionType === 'multiple' ? "bg-indigo-500 border-indigo-400 text-white shadow-lg" : "bg-slate-950 border-white/5 text-slate-500")}
                                    >VARIAS (Checkbox)</button>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Opciones de Selección</label>
                                    <button onClick={handleAddOption} className="text-indigo-400 text-[10px] font-black hover:text-indigo-300 transition-colors flex items-center gap-1 group">
                                        <Plus size={12} className="group-hover:rotate-90 transition-transform"/> AGREGAR OPCIÓN
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {modGroupOptions.map((opt, i) => (
                                        <div key={i} className="flex gap-2 items-center bg-slate-950/50 p-2 rounded-xl border border-white/5">
                                            <input
                                                value={opt.name}
                                                onChange={(e) => updateOption(i, { name: e.target.value })}
                                                placeholder="Nombre (ej: BBQ)"
                                                className="flex-grow bg-transparent text-sm text-white outline-none"
                                            />
                                            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-white/5">
                                                <span className="text-[10px] text-slate-600 font-bold">$</span>
                                                <input
                                                    type="number"
                                                    value={opt.extraPrice}
                                                    onChange={(e) => updateOption(i, { extraPrice: parseFloat(e.target.value) || 0 })}
                                                    className="w-16 bg-transparent text-sm text-emerald-400 font-bold outline-none text-right"
                                                />
                                            </div>
                                            <button onClick={() => removeOption(i)} className="text-rose-500/50 hover:text-rose-400 p-1 transition-colors"><Trash2 size={16}/></button>
                                        </div>
                                    ))}
                                    {modGroupOptions.length === 0 && <p className="text-center py-4 text-xs text-slate-600 italic">No hay opciones definidas.</p>}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-white/5 bg-slate-800/10 flex gap-3 rounded-b-2xl">
                            <button 
                                onClick={() => setIsModGroupModalOpen(false)}
                                className="flex-grow py-3 rounded-xl font-bold text-slate-400 hover:bg-white/5 transition-all"
                            >CANCELAR</button>
                            <button 
                                onClick={saveModGroup}
                                className="flex-[2] bg-indigo-500 hover:bg-indigo-400 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                            >GUARDAR GRUPO</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
