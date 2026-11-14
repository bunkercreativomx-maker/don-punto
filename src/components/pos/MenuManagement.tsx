import { useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Copy, Layers, Tag, X, Check, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}
import type { Category, ModifierGroup, Modifier, ProductRowData } from '../../types/calculator';
import { isPro, getBranches, useSession } from '../../lib/session';
import { branchInfo, withBranch } from '../../lib/branchMenu';

interface MenuManagementProps {
    categories: Category[];
    modifierGroups: ModifierGroup[];
    products: ProductRowData[];
    addCategory: (name: string) => void;
    updateCategory: (id: string, name: string) => void;
    removeCategory: (id: string) => void;
    moveCategory: (from: number, to: number) => void;
    addModifierGroup: (group: Omit<ModifierGroup, 'id'>) => void;
    updateModifierGroup: (id: string, updates: Partial<ModifierGroup>) => void;
    removeModifierGroup: (id: string) => void;
    moveModifierGroup?: (from: number, to: number) => void;
    updateProduct: (id: string, updates: Partial<ProductRowData>) => void;
}

export function MenuManagement({
    categories,
    modifierGroups,
    products,
    addCategory,
    updateCategory,
    removeCategory,
    moveCategory,
    addModifierGroup,
    updateModifierGroup,
    removeModifierGroup,
    moveModifierGroup,
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
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    // Reordenar categorías: arrastrar desde la agarradera (mouse y dedo, pointer events) o flechas.
    const listRef = useRef<HTMLDivElement>(null);
    const [dragId, setDragId] = useState<string | null>(null);
    const dragIdx = useRef(-1);
    // Los listeners van en window: al reordenar, React mueve el nodo en el DOM y se perdía el
    // pointer capture, así que la fila "se regresaba" o caía en otro lugar.
    const moveRef = useRef(moveCategory);
    moveRef.current = moveCategory;
    const onGripDown = (e: React.PointerEvent, cat: Category, i: number) => {
        e.preventDefault();
        dragIdx.current = i;
        setDragId(cat.id);
        const onMove = (ev: PointerEvent) => {
            if (!listRef.current) return;
            const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('[data-cat-row]'));
            // Posición destino = cuántas OTRAS filas tienen su mitad arriba del dedo/cursor
            let to = 0;
            rows.forEach((r) => {
                if (r.dataset.catRow === cat.id) return;
                const b = r.getBoundingClientRect();
                if (ev.clientY > b.top + b.height / 2) to++;
            });
            if (to !== dragIdx.current) { moveRef.current(dragIdx.current, to); dragIdx.current = to; }
            if (ev.clientY > window.innerHeight - 60) window.scrollBy(0, 12);
            else if (ev.clientY < 80) window.scrollBy(0, -12);
        };
        const onUp = () => {
            setDragId(null); dragIdx.current = -1;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    };

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
            setSelectedCategories(group.appliedToCategories || []);
        } else {
            setEditingModGroupId(null);
            setModGroupName('');
            setModGroupOptions([]);
            setSelectionType('multiple');
            setSelectedCategories([]);
        }
        setIsModGroupModalOpen(true);
    };

    // Duplicar: abre la ventana como grupo NUEVO con las mismas opciones; solo cambias el nombre y guardas
    const duplicateModGroup = (group: ModifierGroup) => {
        setEditingModGroupId(null);
        setModGroupName(`${group.name} (copia)`);
        setModGroupOptions(group.options.map(({ name, extraPrice }) => ({ name, extraPrice })));
        setSelectionType(group.selectionType);
        setSelectedCategories(group.appliedToCategories || []);
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
                selectionType,
                appliedToCategories: selectedCategories
            });
        } else {
            addModifierGroup({
                name: modGroupName,
                options: optionsWithIds,
                selectionType,
                appliedToCategories: selectedCategories
            });
        }
        setIsModGroupModalOpen(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Categorías Section */}
            <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                        <Layers size={20} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-carbon-950 tracking-tight">Categorías</h2>
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
                        className="flex-grow bg-slate-950/50 border border-carbon-950/10 rounded-xl px-4 py-2 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-sm"
                    />
                    <button
                        onClick={handleAddCategory}
                        className="bg-indigo-500 hover:bg-indigo-400 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Plus size={20} />
                    </button>
                </div>

                {categories.length > 1 && <p className="text-[11px] text-slate-500 mb-2">Arrastra <GripVertical size={12} className="inline -mt-0.5" /> para cambiar el orden. Así salen en el punto de venta y en tu tienda en línea.</p>}
                <div ref={listRef} className="space-y-2">
                    {categories.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-carbon-950/10 rounded-xl">No hay categorías. Agrega una arriba.</p>
                    ) : (
                        categories.map((cat, i) => (
                            <div key={cat.id} data-cat-row={cat.id} className={cn("flex items-center justify-between gap-2 bg-slate-800/30 border border-carbon-950/10 p-3 rounded-xl group hover:bg-slate-800/50 transition-colors select-none", dragId === cat.id && "ring-2 ring-agave-500 shadow-lg bg-white relative z-10")}>
                                <button
                                    type="button"
                                    aria-label={`Mover ${cat.name}`}
                                    title="Arrastra para mover"
                                    onPointerDown={(e) => onGripDown(e, cat, i)}
                                    className="-ml-1 p-1.5 text-slate-400 hover:text-slate-200 rounded-md cursor-grab active:cursor-grabbing touch-none shrink-0"
                                ><GripVertical size={18} /></button>
                                {editingCategoryId === cat.id ? (
                                    <div className="flex-grow flex gap-2">
                                        <input
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            autoFocus
                                            className="flex-grow bg-slate-950 border border-indigo-500/50 rounded-lg px-3 py-1 text-sm text-carbon-950 outline-none"
                                        />
                                        <button onClick={saveCategoryEdit} className="text-emerald-400 p-1 hover:bg-emerald-500/10 rounded-md"><Check size={18} /></button>
                                        <button onClick={() => setEditingCategoryId(null)} className="text-slate-400 p-1 hover:bg-slate-500/10 rounded-md"><X size={18} /></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="flex-grow min-w-0 truncate text-sm font-medium text-slate-200">{cat.name}</span>
                                        <div className="flex items-center gap-0.5 shrink-0">
                                            <button onClick={() => moveCategory(i, i - 1)} disabled={i === 0} aria-label="Subir" className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg disabled:opacity-25"><ChevronUp size={16} /></button>
                                            <button onClick={() => moveCategory(i, i + 1)} disabled={i === categories.length - 1} aria-label="Bajar" className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg disabled:opacity-25"><ChevronDown size={16} /></button>
                                        </div>
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
            <div className="bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)]">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-pink-500/20 text-pink-400 border border-pink-500/30">
                            <Tag size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-carbon-950 tracking-tight">Modificadores</h2>
                            <p className="text-xs text-slate-400">Extras, salsas e ingredientes adicionales. Con las flechas ↑↓ eliges en qué orden salen al cobrar.</p>
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
                        <p className="text-center py-8 text-slate-500 text-sm border-2 border-dashed border-carbon-950/10 rounded-xl">Crea grupos de opciones como "Salsas" o "Extras".</p>
                    ) : (
                        modifierGroups.map((group, gi) => (
                            <div key={group.id} className="bg-slate-800/30 border border-carbon-950/10 rounded-2xl p-4 group">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <h3 className="font-bold text-carbon-950 text-sm">{group.name}</h3>
                                        <span className="text-[10px] text-slate-500 uppercase font-black">{group.selectionType === 'single' ? 'Unica Selección' : 'Selección Múltiple'}</span>
                                    </div>
                                    <div className="flex gap-1">
                                        {moveModifierGroup && modifierGroups.length > 1 && (<>
                                            <button onClick={() => moveModifierGroup(gi, gi - 1)} disabled={gi === 0} title="Subir (sale antes al cobrar)" aria-label="Subir grupo" className="p-2 text-slate-500 hover:text-carbon-950 rounded-lg disabled:opacity-25"><ChevronUp size={16} /></button>
                                            <button onClick={() => moveModifierGroup(gi, gi + 1)} disabled={gi === modifierGroups.length - 1} title="Bajar" aria-label="Bajar grupo" className="p-2 text-slate-500 hover:text-carbon-950 rounded-lg disabled:opacity-25"><ChevronDown size={16} /></button>
                                        </>)}
                                        <button onClick={() => duplicateModGroup(group)} title="Duplicar grupo" aria-label="Duplicar grupo" className="p-2 text-slate-500 hover:text-emerald-500 rounded-lg transition-all"><Copy size={14} /></button>
                                        <button onClick={() => openModGroupModal(group)} title="Editar" aria-label="Editar grupo" className="p-2 text-slate-500 hover:text-indigo-400 rounded-lg transition-all"><Edit2 size={14} /></button>
                                        <button onClick={() => removeModifierGroup(group.id)} className="p-2 text-slate-500 hover:text-rose-400 rounded-lg transition-all"><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {group.options.map((opt, i) => (
                                        <span key={i} className="text-[10px] bg-slate-950/50 border border-carbon-950/10 text-slate-400 px-2 py-1 rounded-lg">
                                            {opt.name} {opt.extraPrice > 0 && <span className="text-emerald-500 ml-1">+${opt.extraPrice}</span>}
                                        </span>
                                    ))}
                                </div>
                                {!(group.appliedToCategories && group.appliedToCategories.some(id => categories.some(c => c.id === id))) && (
                                    <button onClick={() => openModGroupModal(group)} className="mt-3 pt-2 border-t border-carbon-950/10 w-full text-left text-[10px] font-bold text-amber-600 hover:text-amber-700">
                                        Sin categoría: toca aquí y elige en qué categoría sale (ej. Sodas)
                                    </button>
                                )}
                                {group.appliedToCategories && group.appliedToCategories.length > 0 && (
                                    <div className="mt-3 pt-2 border-t border-carbon-950/10 flex flex-wrap gap-1 items-center">
                                        <span className="text-[9px] text-slate-500 uppercase font-black mr-1">Se aplica a:</span>
                                        {group.appliedToCategories.map(catId => {
                                            const cat = categories.find(c => c.id === catId);
                                            return cat ? (
                                                <span key={catId} className="text-[9px] bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded font-bold">
                                                    {cat.name}
                                                </span>
                                            ) : null;
                                        })}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Categoría de productos: solo pendientes + buscador (antes era una lista larga con todo) */}
            <ProductCategoryBox products={products} categories={categories} updateProduct={updateProduct} />
            <BranchMenuBox products={products} categories={categories} updateProduct={updateProduct} />

            {/* Modal for Modifier Group Add/Edit */}
            {isModGroupModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-carbon-950/35 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-carbon-950/10 rounded-2xl w-full max-w-lg shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-carbon-950/10 flex justify-between items-center bg-slate-800/20 rounded-t-2xl">
                            <h3 className="text-xl font-bold text-carbon-950 tracking-tight">Configurar Grupo de Modificadores</h3>
                            <button onClick={() => setIsModGroupModalOpen(false)} className="text-slate-400 hover:text-carbon-950 transition-colors"><X/></button>
                        </div>
                        
                        <div className="p-6 space-y-6 overflow-y-auto">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Nombre del Grupo (ej: Salsas)</label>
                                <input
                                    value={modGroupName}
                                    onChange={(e) => setModGroupName(e.target.value)}
                                    placeholder="Nombre del grupo..."
                                    className="w-full bg-slate-950 border border-carbon-950/10 rounded-xl px-4 py-2.5 text-carbon-950 outline-none focus:ring-2 focus:ring-indigo-500/50"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Tipo de Selección</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => setSelectionType('single')}
                                        className={cn("py-2 rounded-xl text-xs font-bold border transition-all", selectionType === 'single' ? "bg-indigo-500 border-indigo-400 text-white shadow-lg" : "bg-slate-950 border-carbon-950/10 text-slate-500")}
                                    >SOLO UNA (Radio)</button>
                                    <button 
                                        onClick={() => setSelectionType('multiple')}
                                        className={cn("py-2 rounded-xl text-xs font-bold border transition-all", selectionType === 'multiple' ? "bg-indigo-500 border-indigo-400 text-white shadow-lg" : "bg-slate-950 border-carbon-950/10 text-slate-500")}
                                    >VARIAS (Checkbox)</button>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase block mb-2">¿En qué categorías sale? (todos sus productos lo muestran al cobrar)</label>
                                <div className="flex flex-wrap gap-2 bg-slate-950/50 p-3 rounded-xl border border-carbon-950/10">
                                    {categories.map(cat => {
                                        const isChecked = selectedCategories.includes(cat.id);
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => {
                                                    if (isChecked) {
                                                        setSelectedCategories(selectedCategories.filter(id => id !== cat.id));
                                                    } else {
                                                        setSelectedCategories([...selectedCategories, cat.id]);
                                                    }
                                                }}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5",
                                                    isChecked 
                                                        ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300" 
                                                        : "bg-slate-900 border-carbon-950/10 text-slate-500 hover:text-slate-400"
                                                )}
                                            >
                                                {isChecked && <Check size={12} />}
                                                {cat.name}
                                            </button>
                                        );
                                    })}
                                    {categories.length === 0 && (
                                        <p className="text-[11px] text-slate-600 italic">No hay categorías creadas. Agrégalas primero.</p>
                                    )}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1.5">Los productos en las categorías seleccionadas tendrán este modificador de forma automática.</p>
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
                                        <div key={i} className="flex gap-2 items-center bg-slate-950/50 p-2 rounded-xl border border-carbon-950/10">
                                            <input
                                                value={opt.name}
                                                onChange={(e) => updateOption(i, { name: e.target.value })}
                                                placeholder="Nombre (ej: BBQ)"
                                                className="flex-grow bg-transparent text-sm text-carbon-950 outline-none"
                                            />
                                            <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-carbon-950/10">
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

                        <div className="p-6 border-t border-carbon-950/10 bg-slate-800/10 flex gap-3 rounded-b-2xl">
                            <button 
                                onClick={() => setIsModGroupModalOpen(false)}
                                className="flex-grow py-3 rounded-xl font-bold text-slate-400 hover:bg-carbon-950/5 transition-all"
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


function ProductCategoryBox({ products, categories, updateProduct }: {
    products: ProductRowData[];
    categories: Category[];
    updateProduct: (id: string, updates: Partial<ProductRowData>) => void;
}) {
    const [q, setQ] = useState('');
    const validCat = (p: ProductRowData) => !!p.categoryId && categories.some(c => c.id === p.categoryId);
    const pending = products.filter(p => !validCat(p));
    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const found = q.trim().length >= 2 ? products.filter(p => validCat(p) && norm(p.name).includes(norm(q.trim()))).slice(0, 8) : [];
    if (products.length === 0) return null;
    const Row = ({ p }: { p: ProductRowData }) => (
        <div className="flex items-center gap-3 bg-slate-950/40 border border-carbon-950/10 rounded-xl px-3 py-2">
            <span className="flex-1 min-w-0 break-words text-sm font-bold text-slate-200">{p.name}</span>
            <select
                value={validCat(p) ? p.categoryId : ''}
                onChange={(e) => updateProduct(p.id, { categoryId: e.target.value || undefined })}
                className="shrink-0 w-36 sm:w-52 bg-slate-900 border border-carbon-950/10 rounded-lg px-2 py-1.5 text-xs text-carbon-950 outline-none"
            >
                <option value="">Elige categoría…</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
        </div>
    );
    return (
        <div className="lg:col-span-2 bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl p-6 space-y-4">
            {pending.length > 0 && (
                <div className="space-y-3">
                    <div>
                        <h3 className="text-lg font-bold text-carbon-950">Productos sin categoría ({pending.length})</h3>
                        <p className="text-xs text-slate-400">Elige su categoría para que les salgan sus modificadores al cobrar. Al elegirla desaparecen de esta lista.</p>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                        {pending.map(p => <Row key={p.id} p={p} />)}
                    </div>
                </div>
            )}
            <div className="space-y-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Cambiar categoría de un producto</label>
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Escribe el nombre del producto…"
                    className="w-full bg-slate-900 border border-carbon-950/10 rounded-xl px-4 py-2.5 text-sm text-carbon-950 outline-none focus:border-agave-500"
                />
                {found.length > 0 && <div className="space-y-2">{found.map(p => <Row key={p.id} p={p} />)}</div>}
                {q.trim().length >= 2 && found.length === 0 && <p className="text-xs text-slate-500">No encontré productos con ese nombre.</p>}
            </div>
        </div>
    );
}

// Menú por sucursal (plan Pro, 2+ sucursales): qué se vende en cada una y su precio propio
function BranchMenuBox({ products, categories, updateProduct }: {
    products: ProductRowData[];
    categories: Category[];
    updateProduct: (id: string, updates: Partial<ProductRowData>) => void;
}) {
    useSession(); // re-render si cambian sucursales/plan
    const branches = getBranches();
    const [open, setOpen] = useState(false);
    const [bid, setBid] = useState(branches[0]?.id || 'main');
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('');
    const [onlyChanged, setOnlyChanged] = useState(false);
    if (!isPro() || branches.length < 2 || products.length === 0) return null;
    const branch = branches.find(b => b.id === bid) || branches[0];
    const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const summary = (id: string) => {
        let off = 0, own = 0;
        products.forEach(p => { const b = branchInfo(p, id); if (b.off) off++; else if (typeof b.price === 'number') own++; });
        return { off, own };
    };
    const list = products.filter(p => {
        if (cat && p.categoryId !== cat) return false;
        if (q.trim() && !norm(p.name).includes(norm(q.trim()))) return false;
        if (onlyChanged) { const b = branchInfo(p, branch.id); return !!b.off || typeof b.price === 'number'; }
        return true;
    });
    const commitPrice = (p: ProductRowData, raw: string) => {
        const t = raw.trim().replace(',', '.');
        const v = t === '' ? undefined : Math.round(parseFloat(t) * 100) / 100;
        if (v !== undefined && (Number.isNaN(v) || v < 0)) return;
        const price = v !== undefined && v === (p.salePrice || 0) ? undefined : v;
        if (price === branchInfo(p, branch.id).price) return;
        updateProduct(p.id, { branches: withBranch(p, branch.id, { price }) });
    };
    return (
        <div className="lg:col-span-2 bg-slate-900 backdrop-blur-xl border border-carbon-950/10 rounded-2xl p-6 space-y-4">
            <button type="button" onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 text-left">
                <div>
                    <h3 className="text-lg font-bold text-carbon-950">Menú por sucursal</h3>
                    <p className="text-xs text-slate-400">Elige qué productos se venden en cada sucursal y, si cambia, su precio en tienda. Sin cambios = se vende con el precio normal.</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {branches.map(b => { const s = summary(b.id); return (
                            <span key={b.id} className="text-[10px] font-bold rounded-md bg-slate-800/40 border border-carbon-950/10 px-2 py-0.5 text-slate-500">
                                {b.name}: {s.off ? `${s.off} no se venden` : 'todo'}{s.own ? ` · ${s.own} con precio propio` : ''}
                            </span>
                        ); })}
                    </div>
                </div>
                <span className="shrink-0 text-slate-500">{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
            </button>
            {open && (
                <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {branches.map(b => (
                            <button key={b.id} type="button" onClick={() => setBid(b.id)}
                                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold border", b.id === branch.id ? "bg-agave-600 border-agave-600 text-white" : "bg-white border-carbon-950/10 text-carbon-700")}>
                                {b.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" className="flex-1 bg-slate-900 border border-carbon-950/10 rounded-xl px-4 py-2.5 text-sm text-carbon-950 outline-none focus:border-agave-500" />
                        <select value={cat} onChange={(e) => setCat(e.target.value)} className="sm:w-56 bg-slate-900 border border-carbon-950/10 rounded-xl px-3 py-2.5 text-sm text-carbon-950 outline-none">
                            <option value="">Todas las categorías</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <label className="flex items-center gap-2 text-xs font-bold text-slate-500 px-2">
                            <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Solo cambios
                        </label>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 content-start max-h-[60vh] overflow-y-auto custom-scrollbar pr-1 rounded-xl">
                        {list.map(p => {
                            const b = branchInfo(p, branch.id);
                            const sold = !b.off;
                            return (
                                <div key={p.id} className={cn("flex items-center gap-3 border rounded-xl px-3 py-2", sold ? "bg-slate-950/40 border-carbon-950/10" : "bg-rose-50/60 border-rose-200")}>
                                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                        <input type="checkbox" checked={sold} onChange={(e) => updateProduct(p.id, { branches: withBranch(p, branch.id, { off: !e.target.checked }) })} className="w-4 h-4 accent-emerald-600 shrink-0" />
                                        <span className={cn("min-w-0 break-words text-sm font-bold", sold ? "text-slate-200" : "text-slate-500 line-through")}>{p.name}</span>
                                    </label>
                                    {sold ? (
                                        <div className="shrink-0 flex items-center gap-1">
                                            <span className="text-[10px] text-slate-500">$</span>
                                            <input
                                                key={`${p.id}:${branch.id}:${b.price ?? ''}:${p.salePrice}`}
                                                defaultValue={typeof b.price === 'number' ? String(b.price) : ''}
                                                placeholder={String(p.salePrice || 0)}
                                                inputMode="decimal"
                                                onBlur={(e) => commitPrice(p, e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                                title="Vacío = precio normal"
                                                className={cn("w-20 rounded-lg border px-2 py-1.5 text-xs text-right outline-none", typeof b.price === 'number' ? "border-amber-400 bg-amber-50 font-bold text-carbon-950" : "border-carbon-950/10 bg-slate-900 text-carbon-950")}
                                            />
                                        </div>
                                    ) : <span className="shrink-0 text-[10px] font-black text-rose-500 uppercase">No se vende</span>}
                                </div>
                            );
                        })}
                        {list.length === 0 && <p className="text-xs text-slate-500">No hay productos con ese filtro.</p>}
                    </div>
                    <p className="text-[11px] text-slate-500">El precio en gris es el normal; escribe otro solo si en <b>{branch.name}</b> cuesta distinto (se marca en amarillo). Bórralo para regresar al normal. Cada sucursal puede tener su propia tienda en línea (Pedidos en línea, desde la caja de esa sucursal) con este menú.</p>
                </div>
            )}
        </div>
    );
}
