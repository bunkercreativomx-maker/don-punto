import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { useCalculator } from './hooks/useCalculator';
import type { Platform, PaymentMethod } from './types/calculator';
import { CreditCard, BarChart3, ShoppingBasket, Calculator, Layers, User, LineChart, Settings, Plus, Lock, Key, Sparkles, Receipt, LogOut, FileSpreadsheet, TrendingUp, Package, Target, BookOpen, Wallet, Search, Users, Store, UserCog, LockOpen, ChevronDown, Bike } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ProfitGrid } from './components/ProfitGrid';
import { PricingGrid } from './components/PricingGrid';
import { POSDashboard } from './components/pos/POSDashboard';
import { MenuManagement } from './components/pos/MenuManagement';
import { POSReports } from './components/pos/POSReports';
import { POSTicketsHistory } from './components/pos/POSTicketsHistory';
import { MenuScannerModal } from './components/pos/MenuScannerModal';
import { MenuImportModal, type ImportPlatforms } from './components/pos/MenuImportModal';
import { usePOS } from './hooks/usePOS';
import { Building2, Phone, MapPin, PrinterIcon } from 'lucide-react';
import { Logo, Mark } from './components/brand/Logo';
import { NotificationsCard } from './components/pwa/NotificationsCard';
import { InstallAppButton } from './components/pwa/InstallApp';
import { InventoryModule } from './components/inventory/InventoryModule';
import { MenuEngineeringModule } from './components/menu-engineering/MenuEngineeringModule';
import { RecipesModule } from './components/recipes/RecipesModule';
import { FinancialModule } from './components/financial/FinancialModule';
import { storeGet, storeSet } from './lib/cloudStore';
import { money } from './lib/format';
import { PinPad } from './components/access/PinPad';
import { useSession, findOperatorByPin, ROLE_LABEL, signIn, canAccess as canAccessAs, lockSession, requiresCashierLogin, currentBranch, getBranches, isPro, TAB_LABEL, CAJA_CONFIGURABLE, getCajaTabs, setCajaTabs, type Tab } from './lib/session';
import { setActiveBranch } from './lib/cloudStore';
import { TeamModule } from './components/team/TeamModule';
import { BranchesModule } from './components/branches/BranchesModule';
import { ClientsModule } from './components/clients/ClientsModule';
import { OnlineOrdersModule, useIncomingOrders } from './components/online/OnlineOrdersModule';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export interface AppProps {
  userEmail: string | null;
  onLogout: () => void;
  onBilling: () => void;
}

/** Qué puede abrir la caja sin PIN */
function CajaAccessEditor() {
  useSession();
  const current = getCajaTabs();
  const toggle = (t: Tab) => setCajaTabs(current.includes(t) ? current.filter((x) => x !== t) : [...current, t]);
  return (
    <div className="border-t border-carbon-950/10 pt-6">
      <div className="text-sm font-bold text-carbon-900">Qué puede ver la caja sin PIN</div>
      <p className="text-[11px] text-slate-500 mt-1">Punto de Venta siempre está abierto. Reportes, Financiero, Tienda Física, Plataformas, Radar y Ajustes siempre piden PIN.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {CAJA_CONFIGURABLE.filter((t) => t !== 'clients' || isPro()).map((t) => (
          <button key={t} type="button" onClick={() => toggle(t)} className={cn('rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', current.includes(t) ? 'bg-agave-600 border-agave-600 text-white' : 'bg-white border-carbon-950/15 text-carbon-700 hover:border-agave-400')}>
            {current.includes(t) ? '✓ ' : ''}{TAB_LABEL[t]}
          </button>
        ))}
      </div>
    </div>
  );
}

function App({ userEmail, onLogout, onBilling }: AppProps) {
  const {
    settings,
    updateSetting,
    rows,
    addRow,
    addProducts,
    updateRow,
    removeRow,
    results,
    pricingResults,
    syncWithStorePrices,
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    modifierGroups,
    addModifierGroup,
    updateModifierGroup,
    removeModifierGroup,
    loadCloudMenu,
  } = useCalculator();

  
  const [profitsSearch, setProfitsSearch] = useState('');
  const [pricingSearch, setPricingSearch] = useState('');
  const [profitsPage, setProfitsPage] = useState(1);
  const [pricingPage, setPricingPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { setProfitsPage(1); }, [profitsSearch]);
  useEffect(() => { setPricingPage(1); }, [pricingSearch]);

  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = (storeGet('donPuntoActiveTab') || '').replace(/"/g, '');
    const valid = ['profits', 'pricing', 'pos', 'menu', 'reports', 'tickets', 'inventory', 'engineering', 'recipes', 'financial', 'clients', 'branches', 'team', 'online'];
    return (valid.includes(saved) ? saved : 'pos') as any;
  });

  // Accesos directos de la app instalada / notificaciones: /?tab=pos, /?tab=reports
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const allowed = ['profits', 'pricing', 'pos', 'menu', 'reports', 'tickets', 'inventory', 'engineering', 'recipes', 'financial', 'clients', 'branches', 'team', 'online'];
    if (tab && allowed.includes(tab)) setActiveTab(tab as typeof activeTab);
    if (params.has('tab') || params.has('source')) window.history.replaceState({}, '', '/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    storeSet('donPuntoActiveTab', activeTab);
  }, [activeTab]);


  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const handleExcelImport = (selectedPlatforms: ImportPlatforms, file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
          try {
              const data = new Uint8Array(event.target?.result as ArrayBuffer);
              const workbook = XLSX.read(data, { type: 'array' });
              
              // Find a sheet with menu columns
              let selectedSheetName = "";
              for (const name of workbook.SheetNames) {
                  const ws = workbook.Sheets[name];
                  const tempJson: any[] = XLSX.utils.sheet_to_json(ws, { header: 1 });
                  const hasRequiredColumns = tempJson.slice(0, 5).some(row => 
                      Array.isArray(row) && 
                      row.some(cell => cell && (cell.toString().trim() === "Dishes" || cell.toString().trim() === "Category"))
                  );
                  if (hasRequiredColumns) {
                      selectedSheetName = name;
                      break;
                  }
              }

              if (!selectedSheetName) {
                  // Fallback: search for "Propuesta" or "Actual" or use first sheet
                  selectedSheetName = workbook.SheetNames.find(name => name.includes("Propuesta") || name.includes("Actual")) || workbook.SheetNames[0];
              }

              const worksheet = workbook.Sheets[selectedSheetName];
              const json: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
              
              // Copy current states to perform non-destructive merge
              const currentCategories = [...categories];
              const currentProducts = [...rows];
              const currentModifierGroups = [...modifierGroups];

              const importedCategoriesMap = new Map<string, { id: string, name: string }>();
              const importedModifierGroupsMap = new Map<string, { id: string, name: string, selectionType: 'single' | 'multiple', options: { id: string, name: string, extraPrice: number }[] }>();
              const importedProductsMap = new Map<string, { id: string, name: string, costPrice: number, salePrice: number, didiPrice?: number, uberPrice?: number, rappiPrice?: number, categoryId?: string, modifierGroupIds: string[] }>();
              
              json.forEach((rowElem: any) => {
                  const normalizedRow: any = {};
                  Object.keys(rowElem).forEach(key => {
                      normalizedRow[key.trim().toLowerCase()] = rowElem[key];
                  });

                  const categoryName = (normalizedRow["category"] || normalizedRow["categoría"] || "").toString().trim();
                  const productName = (normalizedRow["dishes"] || normalizedRow["dish"] || normalizedRow["platillo"] || normalizedRow["producto"] || "").toString().trim();
                  const itemId = (normalizedRow["item_id"] || normalizedRow["id"] || "").toString().trim() || productName;
                  const basePrice = parseFloat(normalizedRow["price"] || normalizedRow["precio"] || "0") || 0;
                  
                  const optionGroupName = (normalizedRow["option group"] || normalizedRow["grupo de opciones"] || "").toString().trim();
                  const selectionMode = (normalizedRow["selection mode"] || normalizedRow["modo selección"] || "").toString().trim().toLowerCase();
                  const optionName = (normalizedRow["option name"] || normalizedRow["opción"] || "").toString().trim();
                  const optionPrice = parseFloat(normalizedRow["option price"] || normalizedRow["precio opción"] || "0") || 0;

                  if (!productName) return;

                  // 1. Process Category
                  let categoryId: string | undefined = undefined;
                  if (categoryName) {
                      // Check in existing categories first
                      const existingCat = currentCategories.find(c => c.name.trim().toLowerCase() === categoryName.toLowerCase());
                      if (existingCat) {
                          categoryId = existingCat.id;
                      } else {
                          let cat = importedCategoriesMap.get(categoryName);
                          if (!cat) {
                              cat = { id: crypto.randomUUID(), name: categoryName };
                              importedCategoriesMap.set(categoryName, cat);
                          }
                          categoryId = cat.id;
                      }
                  }

                  // 2. Process Product Base
                  const existingProduct = currentProducts.find(p => p.name.trim().toLowerCase() === productName.toLowerCase() || p.id === itemId);
                  const prodId = existingProduct ? existingProduct.id : undefined;

                  let prod = importedProductsMap.get(itemId);
                  if (!prod) {
                      prod = {
                          id: prodId || crypto.randomUUID(),
                          name: productName,
                          costPrice: existingProduct ? existingProduct.costPrice : 0,
                          salePrice: existingProduct 
                              ? (selectedPlatforms.tienda ? Math.round(basePrice / 1.42) : existingProduct.salePrice)
                              : Math.round(basePrice / 1.42),
                          
                          didiPrice: existingProduct 
                              ? (selectedPlatforms.didi ? basePrice : existingProduct.didiPrice)
                              : (selectedPlatforms.didi ? basePrice : undefined),
                          
                          uberPrice: existingProduct 
                              ? (selectedPlatforms.uber ? basePrice : existingProduct.uberPrice)
                              : (selectedPlatforms.uber ? basePrice : undefined),
                              
                          rappiPrice: existingProduct 
                              ? (selectedPlatforms.rappi ? basePrice : existingProduct.rappiPrice)
                              : (selectedPlatforms.rappi ? basePrice : undefined),

                          categoryId: categoryId || (existingProduct ? existingProduct.categoryId : undefined),
                          modifierGroupIds: existingProduct && existingProduct.modifierGroupIds ? [...existingProduct.modifierGroupIds] : []
                      };
                      importedProductsMap.set(itemId, prod);
                  } else {
                      if (selectedPlatforms.didi) prod.didiPrice = basePrice;
                      if (selectedPlatforms.uber) prod.uberPrice = basePrice;
                      if (selectedPlatforms.rappi) prod.rappiPrice = basePrice;
                      if (selectedPlatforms.tienda) prod.salePrice = Math.round(basePrice / 1.42);
                  }

                  // 3. Process Option Group & Options
                  if (optionGroupName && optionName) {
                      const groupKey = `${itemId}_${optionGroupName}`;
                      
                      const existingGroup = currentModifierGroups.find(g => g.name.trim().toLowerCase() === optionGroupName.toLowerCase() && (existingProduct && existingProduct.modifierGroupIds?.includes(g.id)));
                      let group = importedModifierGroupsMap.get(groupKey);
                      
                      if (!group) {
                          group = {
                              id: existingGroup ? existingGroup.id : crypto.randomUUID(),
                              name: optionGroupName,
                              selectionType: (selectionMode === 'required' || selectionMode.includes('single') || selectionMode.includes('unica')) ? 'single' : 'multiple',
                              options: existingGroup ? [...existingGroup.options] : []
                          };
                          importedModifierGroupsMap.set(groupKey, group);
                      }

                      const existingOpt = group.options.find(o => o.name.trim().toLowerCase() === optionName.trim().toLowerCase());
                      if (!existingOpt) {
                          group.options.push({
                              id: crypto.randomUUID(),
                              name: optionName,
                              extraPrice: optionPrice
                          });
                      }

                      if (!prod.modifierGroupIds.includes(group.id)) {
                          prod.modifierGroupIds.push(group.id);
                      }
                  }
              });

              // Merge categories
              const newCatsFromImport = Array.from(importedCategoriesMap.values());
              const mergedCategories = [...currentCategories];
              newCatsFromImport.forEach(nc => {
                  if (!mergedCategories.some(c => c.name.trim().toLowerCase() === nc.name.trim().toLowerCase())) {
                      mergedCategories.push(nc);
                  }
              });

              // Merge modifier groups
              const newGroupsFromImport = Array.from(importedModifierGroupsMap.values());
              const mergedModifierGroups = [...currentModifierGroups];
              newGroupsFromImport.forEach(ng => {
                  const idx = mergedModifierGroups.findIndex(g => g.id === ng.id);
                  if (idx !== -1) {
                      const existingGroup = mergedModifierGroups[idx];
                      const mergedOptions = [...existingGroup.options];
                      ng.options.forEach(no => {
                          if (!mergedOptions.some(o => o.name.trim().toLowerCase() === no.name.trim().toLowerCase())) {
                              mergedOptions.push(no);
                          }
                      });
                      mergedModifierGroups[idx] = {
                          ...existingGroup,
                          options: mergedOptions,
                          selectionType: ng.selectionType
                      };
                  } else {
                      mergedModifierGroups.push({
                          id: ng.id,
                          name: ng.name,
                          selectionType: ng.selectionType,
                          options: ng.options
                      });
                  }
              });

              // Merge products
              const newProductsFromImport = Array.from(importedProductsMap.values());
              const mergedProducts = [...currentProducts];
              newProductsFromImport.forEach(np => {
                  const idx = mergedProducts.findIndex(p => p.id === np.id || p.name.trim().toLowerCase() === np.name.trim().toLowerCase());
                  if (idx !== -1) {
                      const existingProd = mergedProducts[idx];
                      const mergedGroupIds = existingProd.modifierGroupIds ? [...existingProd.modifierGroupIds] : [];
                      np.modifierGroupIds.forEach(gid => {
                          if (!mergedGroupIds.includes(gid)) {
                              mergedGroupIds.push(gid);
                          }
                      });

                      mergedProducts[idx] = {
                          ...existingProd,
                          didiPrice: np.didiPrice !== undefined ? np.didiPrice : existingProd.didiPrice,
                          uberPrice: np.uberPrice !== undefined ? np.uberPrice : existingProd.uberPrice,
                          rappiPrice: np.rappiPrice !== undefined ? np.rappiPrice : existingProd.rappiPrice,
                          salePrice: np.salePrice !== undefined ? np.salePrice : existingProd.salePrice,
                          modifierGroupIds: mergedGroupIds,
                          categoryId: np.categoryId || existingProd.categoryId
                      };
                  } else {
                      mergedProducts.push({
                          id: np.id,
                          name: np.name,
                          costPrice: np.costPrice,
                          salePrice: np.salePrice,
                          didiPrice: np.didiPrice,
                          uberPrice: np.uberPrice,
                          rappiPrice: np.rappiPrice,
                          categoryId: np.categoryId,
                          modifierGroupIds: np.modifierGroupIds
                      });
                  }
              });

              if (newProductsFromImport.length > 0) {
                  loadCloudMenu(mergedProducts, mergedCategories, mergedModifierGroups);
                  
                  const activeChannels: string[] = [];
                  if (selectedPlatforms.tienda) activeChannels.push("Tienda Física");
                  if (selectedPlatforms.didi) activeChannels.push("DiDi Food");
                  if (selectedPlatforms.uber) activeChannels.push("Uber Eats");
                  if (selectedPlatforms.rappi) activeChannels.push("Rappi");

                  alert(`¡Menú importado con éxito sin borrar tus productos existentes!\n\nCanales actualizados:\n• ${activeChannels.join(", ")}\n\nSe procesaron:\n• ${newCatsFromImport.length} Categorías nuevas\n• ${newProductsFromImport.length} Productos importados/actualizados\n• Modificadores vinculados en el POS.`);
                  setIsImportModalOpen(false);
              } else {
                  alert("No se encontraron productos válidos en el archivo.");
              }
          } catch (err) {
              console.error("Error parsing Excel:", err);
              alert("Ocurrió un error al procesar el archivo. Asegúrate de subir un archivo de menú válido.");
          }
      };
      reader.readAsArrayBuffer(file);
  };

  const handleScannerSuccess = (scannedProducts: any[]) => {
      const currentProducts = [...rows];
      const mergedProducts = [...currentProducts];

      scannedProducts.forEach(sp => {
          const idx = mergedProducts.findIndex(p => p.name.trim().toLowerCase() === sp.name.trim().toLowerCase());
          if (idx !== -1) {
              const existing = mergedProducts[idx];
              mergedProducts[idx] = {
                  ...existing,
                  salePrice: sp.salePrice !== 0 ? sp.salePrice : existing.salePrice,
                  didiPrice: sp.didiPrice !== undefined ? sp.didiPrice : existing.didiPrice,
                  uberPrice: sp.uberPrice !== undefined ? sp.uberPrice : existing.uberPrice,
                  rappiPrice: sp.rappiPrice !== undefined ? sp.rappiPrice : existing.rappiPrice,
              };
          } else {
              mergedProducts.push(sp);
          }
      });

      loadCloudMenu(mergedProducts, categories, modifierGroups);
      alert(`¡Se digitalizaron e importaron ${scannedProducts.length} productos con éxito de forma no destructiva!`);
  };



  const { settings: posSettings, updateSettings: updatePosSettings } = usePOS();

  // ---- Acceso: quién usa este equipo y qué puede ver
  const { operator, canAccess } = useSession();
  const [pinFor, setPinFor] = useState<Tab | 'switch' | null>(null);
  const [branchMenu, setBranchMenu] = useState(false);
  const branch = currentBranch();
  const branches = getBranches();
  const needCashier = requiresCashierLogin() && !operator;

  const incoming = useIncomingOrders();
  const goTo = (tab: Tab) => {
    if (canAccess(tab)) setActiveTab(tab);
    else setPinFor(tab);
  };
  const handleSettingsClick = () => goTo('settings');

  // Si alguien bloquea o cambia de cajero, salir de pantallas que ya no puede ver
  useEffect(() => {
    if (!canAccess(activeTab)) setActiveTab('pos');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operator, activeTab]);
  // Nunca pintar una pantalla sin permiso, ni por un instante
  const shownTab: Tab = canAccess(activeTab) ? activeTab : 'pos';

  const NAV: { tab: Tab; label: string; Icon: typeof BarChart3; pro?: boolean; sep?: boolean }[] = [
    { tab: 'pos', label: 'Punto de Venta', Icon: ShoppingBasket },
    { tab: 'online', label: 'Pedidos en línea', Icon: Bike },
    { tab: 'tickets', label: 'Tickets', Icon: Receipt },
    { tab: 'reports', label: 'Reportes', Icon: LineChart },
    { tab: 'clients', label: 'Clientes', Icon: Users, pro: true },
    { tab: 'profits', label: 'Tienda Física', Icon: BarChart3, sep: true },
    { tab: 'pricing', label: 'Plataformas', Icon: Calculator },
    { tab: 'menu', label: 'Catálogo', Icon: Layers },
    { tab: 'inventory', label: 'Inventario', Icon: Package, sep: true },
    { tab: 'engineering', label: 'Radar de Menú', Icon: Target },
    { tab: 'recipes', label: 'Recetario', Icon: BookOpen },
    { tab: 'financial', label: 'Financiero', Icon: Wallet },
    { tab: 'branches', label: 'Sucursales', Icon: Store, pro: true, sep: true },
    { tab: 'team', label: 'Equipo', Icon: UserCog, pro: true },
  ];

  return (
    <>
      <div className="min-h-screen w-full bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 flex overflow-hidden">
      
      {/* --- AI MENU SCANNER MODAL --- */}
      {isScannerOpen && (
          <MenuScannerModal 
              onClose={() => setIsScannerOpen(false)} 
              onScanSuccess={handleScannerSuccess}
          />
      )}

      {/* --- SELECTIVE MENU IMPORT MODAL --- */}
      {isImportModalOpen && (
          <MenuImportModal
              onClose={() => setIsImportModalOpen(false)}
              onImport={handleExcelImport}
          />
      )}

      {/* --- Aviso de pedido en línea nuevo (en cualquier pantalla) --- */}
      {incoming.latest && shownTab !== 'online' && (
        <div className="fixed bottom-5 left-1/2 z-[150] -translate-x-1/2 no-print">
          <div className="flex items-center gap-3 rounded-2xl bg-carbon-950 px-4 py-3 text-white shadow-2xl">
            <Bike size={20} className="text-maiz-400" />
            <span className="text-sm font-semibold">Pedido en línea #{incoming.latest.number} · {incoming.latest.name}</span>
            <button onClick={() => { incoming.dismiss(); goTo('online'); }} className="rounded-xl bg-maiz-400 px-3 py-1.5 text-xs font-black text-carbon-950">Ver</button>
            <button onClick={incoming.dismiss} className="text-carbon-400 text-xs">✕</button>
          </div>
        </div>
      )}

      {/* --- PIN: desbloquear pantallas / cambiar de cajero --- */}
      {(pinFor || needCashier) && (
          <PinPad
              title={needCashier || pinFor === 'switch' ? '¿Quién eres?' : `Desbloquear ${TAB_LABEL[pinFor as Tab]}`}
              subtitle={needCashier || pinFor === 'switch' ? 'Escribe tu PIN para empezar.' : 'Esta sección está protegida. Escribe el PIN del dueño o de un gerente.'}
              onClose={needCashier ? undefined : () => setPinFor(null)}
              onSubmit={(pin) => {
                  const op = findOperatorByPin(pin, posSettings.adminPin);
                  if (!op) return false;
                  const target = pinFor;
                  // Un PIN válido no basta: tiene que tener permiso para esa pantalla
                  if (target && target !== 'switch' && !needCashier && !canAccessAs(target as Tab, op)) {
                      return `${op.name}: sin permiso para ${TAB_LABEL[target as Tab]}`;
                  }
                  signIn(op);
                  setPinFor(null);
                  if (target && target !== 'switch' && canAccessAs(target as Tab, op)) {
                      // eslint-disable-next-line @typescript-eslint/no-use-before-define
                      setTimeout(() => setActiveTab((prev) => (target as Tab) || prev), 0);
                  }
                  return true;
              }}
          />
      )}

      {/* --- PREMIUM SIDEBAR --- */}
      <nav className="w-16 lg:w-56 bg-white border-r border-carbon-950/10 flex flex-col items-center lg:items-stretch py-4 gap-3 relative z-30 backdrop-blur-xl shrink-0 no-print overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-center lg:justify-start gap-2.5 px-2 lg:px-4 pt-1 pb-2">
          <Mark size={34} className="lg:hidden" />
          <Logo size={38} className="hidden lg:block" />
        </div>

        {/* User Avatar */}
        <div className="flex items-center gap-3 px-2 lg:px-4 py-1 mb-1 group cursor-default">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-carbon-950/10 flex items-center justify-center text-slate-400 shrink-0 hover:border-carbon-950/20 transition-all">
            <User size={20} />
          </div>
          {userEmail && (
            <span className="hidden lg:block text-[11px] font-bold text-slate-400 truncate leading-tight">{userEmail}</span>
          )}
        </div>

        <div className="w-full px-2 lg:px-3">
          <div className="h-px bg-carbon-950/5 w-full" />
        </div>

        {/* Sucursal y quién está usando el equipo */}
        <div className="w-full px-2 lg:px-3 space-y-1.5">
          {isPro() && branches.length > 1 && (
            <div className="relative">
              <button onClick={() => (canAccess('branches') ? setBranchMenu((v) => !v) : setPinFor('branches'))} className="w-full flex items-center gap-2 rounded-xl border border-carbon-950/10 bg-carbon-50 px-2 lg:px-3 py-2 text-left hover:bg-carbon-100" title="Sucursal de este equipo">
                <Store size={16} className="text-agave-700 shrink-0" />
                <span className="hidden lg:block text-xs font-semibold text-carbon-800 truncate flex-1">{branch.name}</span>
                <ChevronDown size={14} className="hidden lg:block text-carbon-500" />
              </button>
              {branchMenu && (
                <div className="absolute left-0 right-0 lg:right-auto lg:w-56 top-full mt-1 z-50 rounded-xl border border-carbon-950/10 bg-white shadow-[0_12px_32px_-12px_rgba(13,16,14,0.3)] p-1">
                  <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-carbon-500">Este equipo cobra en</div>
                  {branches.map((b) => (
                    <button key={b.id} onClick={() => { setBranchMenu(false); if (b.id !== branch.id) setActiveBranch(b.id); }} className={cn('w-full text-left rounded-lg px-3 py-2 text-sm', b.id === branch.id ? 'bg-agave-50 text-agave-800 font-semibold' : 'text-carbon-700 hover:bg-carbon-50')}>{b.name}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-xl px-2 lg:px-3 py-1.5">
            {/* En pantalla chica el candado es el botón: bloquear / entrar con PIN */}
            <button type="button" onClick={() => (operator ? (lockSession(), setActiveTab('pos')) : setPinFor('switch'))} title={operator ? 'Bloquear / cambiar de persona' : 'Entrar con PIN'} className="shrink-0">
              {operator ? <LockOpen size={16} className="text-agave-600" /> : <Lock size={16} className="text-carbon-400" />}
            </button>
            <div className="hidden lg:block flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-carbon-800 truncate">{operator ? operator.name : 'Modo caja'}</div>
              <div className="text-[10px] text-carbon-500 truncate">{operator ? ROLE_LABEL[operator.role] : 'Secciones protegidas'}</div>
            </div>
            {operator ? (
              <button onClick={() => { lockSession(); setActiveTab('pos'); }} className="hidden lg:block text-[11px] font-bold text-carbon-600 hover:text-carbon-900 rounded-lg px-2 py-1 hover:bg-carbon-100" title="Bloquear">Bloquear</button>
            ) : (
              <button onClick={() => setPinFor('switch')} className="hidden lg:block text-[11px] font-bold text-agave-700 hover:text-agave-800 rounded-lg px-2 py-1 hover:bg-agave-50">Entrar</button>
            )}
          </div>
        </div>

        <div className="w-full px-2 lg:px-3">
          <div className="h-px bg-carbon-950/5 w-full" />
        </div>

        <div className="flex flex-col gap-1 flex-grow w-full px-2 lg:px-3">
          {NAV.map(({ tab, label, Icon, pro, sep }) => {
            const locked = !canAccess(tab);
            return (
              <div key={tab} className="contents">
                {sep && <div className="w-full my-1"><div className="h-px bg-carbon-950/5 w-full" /></div>}
                <button onClick={() => goTo(tab)} title={label} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === tab ? "bg-agave-50 text-agave-700 border border-agave-100 font-semibold" : "text-slate-500 hover:text-slate-300 hover:bg-carbon-950/5 border border-transparent")}>
                  <Icon size={20} className="shrink-0" />
                  <span className="hidden lg:block text-xs font-bold whitespace-nowrap flex-1 text-left">{label}</span>
                  {tab === 'online' && incoming.pending > 0 && <span className="absolute -right-1 -top-1 lg:static grid h-5 min-w-5 place-items-center rounded-full bg-maiz-400 px-1 text-[10px] font-black text-carbon-950 animate-pulse">{incoming.pending}</span>}
                  {pro && !isPro() && <span className="hidden lg:block text-[9px] font-black uppercase tracking-wider rounded-full bg-maiz-100 text-maiz-800 px-1.5 py-0.5">Pro</span>}
                  {locked && <Lock size={12} className="absolute right-1.5 top-1.5 lg:static text-carbon-400" />}
                  {activeTab === tab && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-agave-500 rounded-r-full" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="w-full px-2 lg:px-3">
          <div className="h-px bg-carbon-950/5 w-full" />
        </div>

        <div className="flex flex-col gap-1 shrink-0 w-full px-2 lg:px-3">
          <button onClick={handleSettingsClick} className={cn("p-3 lg:px-3 rounded-xl transition-all flex items-center gap-3", activeTab === 'settings' ? "bg-agave-50 text-agave-700 border border-agave-100 font-semibold" : "text-slate-600 hover:text-slate-400 hover:bg-carbon-950/5 border border-transparent")}>
            <Settings size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap flex-1 text-left">Ajustes</span>
            {!canAccess('settings') && <Lock size={12} className="hidden lg:block text-carbon-400" />}
          </button>
          <InstallAppButton compact label="Instalar app" className="p-3 lg:px-3 rounded-xl transition-all text-maiz-400 hover:bg-maiz-500/10 gap-3 border border-transparent" />
          <button
            onClick={onBilling}
            className="p-3 lg:px-3 rounded-xl transition-all text-slate-500 hover:text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-3 border border-transparent"
            title="Mi plan y facturación"
          >
            <CreditCard size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Mi plan</span>
          </button>
          <button
            onClick={onLogout}
            className="p-3 lg:px-3 rounded-xl transition-all text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 flex items-center gap-3 border border-transparent"
            title="Cerrar Sesión"
          >
            <LogOut size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Cerrar Sesión</span>
          </button>
        </div>
      </nav>

      <div className="flex-grow relative flex overflow-hidden">
        <div className={cn(
            "absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] opacity-[0.06] blur-[120px] pointer-events-none transition-colors duration-1000 no-print",
            settings.platform === 'Uber' && "bg-green-600",
            settings.platform === 'Didi' && "bg-orange-600",
            settings.platform === 'Rappi' && "bg-pink-600"
        )} />

        <div className="flex-grow px-6 py-6 overflow-auto relative z-10 no-scrollbar">
          <div className="w-full">
            <header className="mb-6 flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4 no-print">
              <div>
                <h1 className="font-display text-3xl font-bold text-carbon-950 tracking-[-0.02em]">
                  {shownTab === 'profits' && 'Análisis de Ganancias de Tienda Física'}
                  {shownTab === 'pricing' && 'Estrategia de Precios'}
                  {shownTab === 'pos' && 'Punto de venta'}
                  {shownTab === 'reports' && 'Reportes Financieros'}
                  {shownTab === 'tickets' && 'Historial de Tickets'}
                  {shownTab === 'menu' && 'Catálogo de Productos'}
                  {shownTab === 'settings' && 'Ajustes del Sistema'}
                  {shownTab === 'inventory' && 'Inventario de Insumos'}
                  {shownTab === 'engineering' && 'Radar de Menú'}
                  {shownTab === 'recipes' && 'Recetario Estándar'}
                  {shownTab === 'financial' && 'Estado Financiero Semanal'}
                  {shownTab === 'clients' && 'Clientes frecuentes'}
                  {shownTab === 'branches' && 'Sucursales'}
                  {shownTab === 'team' && 'Equipo y permisos'}
                  {shownTab === 'online' && 'Pedidos en línea'}
                </h1>
                <p className="text-slate-500 mt-2 font-medium tracking-wide">
                  {shownTab === 'profits' && ''}
                  {shownTab === 'pricing' && 'Calcula precios sugeridos para no perder ni un peso en plataformas.'}
                  {shownTab === 'pos' && 'Registra tus ventas y personaliza pedidos en tiempo real.'}
                  {shownTab === 'reports' && 'Analiza tu IVA y revisa los desgloses generales de ganancias.'}
                  {shownTab === 'tickets' && 'Busca folios pasados, reimprime recibos de cliente o comandas de cocina.'}
                  {shownTab === 'menu' && 'Administra tus categorías, modificadores y catálogo.'}
                  {shownTab === 'settings' && 'Personaliza tu plataforma, régimen y métodos de pago.'}
                  {shownTab === 'inventory' && 'Controla stock de insumos, detecta alertas y genera pedidos automáticos.'}
                  {shownTab === 'engineering' && 'Top ventas del mes conectado al POS · CRACK, DIAMANTE, CORREDOR y REZAGADO · Combos con IA.'}
                  {shownTab === 'recipes' && 'Gestiona recetas estándar con análisis de costo e ingredientes.'}
                  {shownTab === 'financial' && 'Registra ventas diarias por canal y controla compras y egresos semanales.'}
                  {shownTab === 'clients' && 'Tus clientes, lo que compran y sus recompensas por visita.'}
                  {shownTab === 'branches' && 'Todas tus sucursales en un solo lugar: quién vende más y cuál necesita atención.'}
                  {shownTab === 'online' && 'Tu página para que te pidan a domicilio o para recoger. Los pedidos llegan aquí.'}
                  {shownTab === 'team' && 'Cada empleado con su PIN: las ventas, descuentos y cancelaciones quedan a su nombre.'}
                </p>
              </div>
              
              {shownTab === 'pos' && operator && requiresCashierLogin() && (
                <div className="flex items-center gap-2 rounded-full border border-carbon-950/10 bg-white pl-3 pr-1 py-1">
                  <span className="text-xs text-carbon-600">Cobrando: <b className="text-carbon-900">{operator.name}</b></span>
                  <button onClick={() => lockSession()} className="rounded-full bg-carbon-100 hover:bg-carbon-200 px-3 py-1 text-xs font-semibold text-carbon-800">Cambiar</button>
                </div>
              )}
              {(shownTab === 'profits' || shownTab === 'pricing' || shownTab === 'menu') && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-slate-900 border border-emerald-500/30 hover:bg-slate-800 text-emerald-400 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-emerald-500/10 active:scale-95 flex items-center gap-2"
                    >
                        <FileSpreadsheet size={18} />
                        IMPORTAR MENÚ
                    </button>
                    <button
                        onClick={() => setIsScannerOpen(true)}
                        className="bg-slate-900 border border-indigo-500/30 hover:bg-slate-800 text-indigo-400 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/10 active:scale-95 flex items-center gap-2"
                    >
                        <Sparkles size={18} /> ESCANEAR MENÚ
                    </button>
                    {(shownTab === 'profits' || shownTab === 'pricing') && (
                        <button
                          onClick={addRow}
                          className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
                        >
                          <Plus size={18} strokeWidth={3} /> AGREGAR PRODUCTO
                        </button>
                    )}
                </div>
              )}
            </header>

            <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {shownTab === 'profits' && (() => {
                const filteredProfits = rows.filter(r => r.name.toLowerCase().includes(profitsSearch.toLowerCase()));
                const totalProfitsPages = Math.max(1, Math.ceil(filteredProfits.length / PAGE_SIZE));
                const safeProfitsPage = Math.min(profitsPage, totalProfitsPages);
                const pagedProfits = filteredProfits.slice((safeProfitsPage - 1) * PAGE_SIZE, safeProfitsPage * PAGE_SIZE);
                return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-9">
                        <div className="relative mb-4">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                            <input
                                type="text"
                                value={profitsSearch}
                                onChange={(e) => setProfitsSearch(e.target.value)}
                                placeholder="Buscar platillo..."
                                className="w-full bg-slate-900 border border-carbon-950/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all"
                            />
                        </div>
                        <ProfitGrid
                            rows={pagedProfits}
                            results={results}
                            updateRow={updateRow}
                            removeRow={removeRow}
                            addRow={addRow}
                        />
                        {totalProfitsPages > 1 && (
                            <div className="flex items-center justify-center gap-3 mt-4">
                                <button onClick={() => setProfitsPage(p => Math.max(1, p - 1))} disabled={safeProfitsPage === 1} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-carbon-950/10 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Anterior</button>
                                <span className="text-xs text-slate-400 font-medium">Página {safeProfitsPage} de {totalProfitsPages} <span className="text-slate-600">({filteredProfits.length} platillos)</span></span>
                                <button onClick={() => setProfitsPage(p => Math.min(totalProfitsPages, p + 1))} disabled={safeProfitsPage === totalProfitsPages} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-carbon-950/10 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Siguiente →</button>
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-3">
                         <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 shadow-[0_1px_2px_rgba(13,16,14,0.04),0_12px_32px_-18px_rgba(13,16,14,0.18)] relative overflow-hidden">
                            <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
                                <TrendingUp size={110} className="text-emerald-400" />
                            </div>
                            <p className="text-[10px] font-black text-emerald-400/70 uppercase tracking-[0.2em] mb-3">ROI Neto Estimado</p>
                            <div className="text-4xl font-black text-emerald-400 tracking-tighter">
                                ${money(results.reduce((acc, r) => acc + r.netProfit, 0))}
                            </div>
                            <p className="text-[10px] text-emerald-500/50 font-bold mt-3 uppercase tracking-wide">Ganancia total de todos los productos</p>
                        </div>
                    </div>
                </div>
              ); })()}
              {shownTab === 'pricing' && (() => {
                const filteredPricing = rows.filter(r => r.name.toLowerCase().includes(pricingSearch.toLowerCase()));
                const totalPricingPages = Math.max(1, Math.ceil(filteredPricing.length / PAGE_SIZE));
                const safePricingPage = Math.min(pricingPage, totalPricingPages);
                const pagedPricing = filteredPricing.slice((safePricingPage - 1) * PAGE_SIZE, safePricingPage * PAGE_SIZE);
                return (
                <div>
                    <div className="relative mb-4">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                        <input
                            type="text"
                            value={pricingSearch}
                            onChange={(e) => setPricingSearch(e.target.value)}
                            placeholder="Buscar platillo..."
                            className="w-full bg-slate-900 border border-carbon-950/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-all"
                        />
                    </div>
                    <PricingGrid
                        rows={pagedPricing}
                        pricingResults={pricingResults}
                        updateRow={updateRow}
                        removeRow={removeRow}
                        addRow={addRow}
                        syncWithStorePrices={syncWithStorePrices}
                    />
                    {totalPricingPages > 1 && (
                        <div className="flex items-center justify-center gap-3 mt-4">
                            <button onClick={() => setPricingPage(p => Math.max(1, p - 1))} disabled={safePricingPage === 1} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-carbon-950/10 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Anterior</button>
                            <span className="text-xs text-slate-400 font-medium">Página {safePricingPage} de {totalPricingPages} <span className="text-slate-600">({filteredPricing.length} platillos)</span></span>
                            <button onClick={() => setPricingPage(p => Math.min(totalPricingPages, p + 1))} disabled={safePricingPage === totalPricingPages} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-carbon-950/10 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Siguiente →</button>
                        </div>
                    )}
                </div>
              ); })()}
              {shownTab === 'pos' && <POSDashboard />}
              {shownTab === 'online' && <OnlineOrdersModule rows={rows} categories={categories} modifierGroups={modifierGroups} onNeedPin={() => setPinFor('online')} />}
              {shownTab === 'reports' && <POSReports onUpgrade={onBilling} />}
              {shownTab === 'tickets' && <POSTicketsHistory />}
              {shownTab === 'inventory' && <InventoryModule />}
              {shownTab === 'engineering' && <MenuEngineeringModule />}
              {shownTab === 'recipes' && <RecipesModule />}
              {shownTab === 'financial' && <FinancialModule />}
              {shownTab === 'clients' && <ClientsModule onUpgrade={onBilling} />}
              {shownTab === 'branches' && <BranchesModule onUpgrade={onBilling} />}
              {shownTab === 'team' && <TeamModule onUpgrade={onBilling} adminPin={posSettings.adminPin} />}
              {shownTab === 'menu' && (
                <MenuManagement 
                    categories={categories}
                    modifierGroups={modifierGroups}
                    products={rows}
                    addCategory={addCategory}
                    updateCategory={updateCategory}
                    removeCategory={removeCategory}
                    addModifierGroup={addModifierGroup}
                    updateModifierGroup={updateModifierGroup}
                    removeModifierGroup={removeModifierGroup}
                    updateProduct={updateRow}
                />
              )}
              {shownTab === 'settings' && (
                  <div className="max-w-2xl space-y-6">

                      <NotificationsCard />

                      {/* Business Info */}
                      <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-carbon-950 tracking-tight mb-1">Información del Negocio</h3>
                              <p className="text-[11px] text-slate-500">Aparece en el encabezado de todos tus tickets impresos.</p>
                          </div>
                          <div className="space-y-4">
                              <div className="flex items-center gap-3 bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3">
                                  <Building2 size={16} className="text-indigo-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Nombre del Negocio</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessName || ''}
                                          onChange={(e) => updatePosSettings({ businessName: e.target.value })}
                                          placeholder="Ej: Mi Negocio"
                                          className="w-full bg-transparent text-carbon-950 text-sm font-bold outline-none placeholder:text-slate-500"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3">
                                  <Phone size={16} className="text-emerald-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Teléfono</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessPhone || ''}
                                          onChange={(e) => updatePosSettings({ businessPhone: e.target.value })}
                                          placeholder="Ej: 656-123-4567"
                                          className="w-full bg-transparent text-carbon-950 text-sm font-bold outline-none placeholder:text-slate-500"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3">
                                  <MapPin size={16} className="text-rose-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Dirección</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessAddress || ''}
                                          onChange={(e) => updatePosSettings({ businessAddress: e.target.value })}
                                          placeholder="Ej: Av. Juárez 123, Col. Centro"
                                          className="w-full bg-transparent text-carbon-950 text-sm font-bold outline-none placeholder:text-slate-500"
                                      />
                                  </div>
                              </div>
                          </div>
                          {/* Print Settings */}
                          <div className="border-t border-carbon-950/10 pt-6 space-y-4">
                              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <PrinterIcon size={14} /> Configuración de Impresión
                              </h4>
                              <div className="grid grid-cols-3 gap-3">
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: '58mm' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          (posSettings.paperSize || '58mm') === '58mm' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-carbon-950"
                                      )}
                                  >🖨️ Térmica 58mm</button>
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: '80mm' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          posSettings.paperSize === '80mm' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-carbon-950"
                                      )}
                                  >🖨️ Térmica 80mm</button>
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: 'Standard' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          posSettings.paperSize === 'Standard' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-carbon-950"
                                      )}
                                  >🖨️ Normal (A4/Carta)</button>
                              </div>
                          </div>
                      </div>

                      {/* Security Settings */}
                      <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-rose-500 tracking-tight mb-1 flex items-center gap-2"><Lock size={18}/> Seguridad Antifraude</h3>
                              <p className="text-[11px] text-slate-500">Con este PIN entras a todo: reportes, dinero, ajustes. También se pide para borrar tickets y productos. Se bloquea solo tras 15 minutos sin uso.</p>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-950 border border-carbon-950/10 rounded-2xl px-4 py-3">
                              <Key size={16} className="text-rose-400 shrink-0" />
                              <div className="flex-1">
                                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">PIN de Administrador</div>
                                  <input
                                      type="password"
                                      maxLength={4}
                                      value={posSettings.adminPin || '1234'}
                                      onChange={(e) => updatePosSettings({ adminPin: e.target.value })}
                                      placeholder="1234"
                                      className="w-full bg-transparent text-carbon-950 text-sm font-bold outline-none placeholder:text-slate-500 tracking-[0.5em]"
                                  />
                                  {(posSettings.adminPin || '1234') === '1234' && (
                                      <p className="text-[11px] font-bold text-amber-400 mt-2">⚠ Estás usando el PIN de fábrica. Cámbialo para proteger tu caja.</p>
                                  )}
                              </div>
                          </div>
                          <CajaAccessEditor />
                      </div>

                      {/* Calculator Settings */}
                      <div className="bg-slate-900 border border-carbon-950/10 rounded-3xl p-8 space-y-8">
                          <h3 className="text-base font-black text-carbon-950 tracking-tight">Configuración de la Calculadora</h3>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Plataforma Principal</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Uber', 'Didi', 'Rappi'] as Platform[]).map((p) => (
                                <button key={p} onClick={() => updateSetting('platform', p)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.platform === p ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-slate-300")}>{p.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Método de Cobro Predeterminado</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Efectivo', 'Transferencia', 'Tarjeta'] as PaymentMethod[]).map((method) => (
                                <button key={method} onClick={() => updateSetting('paymentMethod', method)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.paymentMethod === method ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-slate-300")}>{method.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between p-6 bg-slate-950 rounded-2xl border border-carbon-950/10">
                            <div>
                                <div className="text-carbon-950 font-bold">RFC Válido</div>
                                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-tight">ISR RETENTION IMPACT</div>
                            </div>
                            <label className="relative flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only" checked={settings.hasValidRFC} onChange={(e) => updateSetting('hasValidRFC', e.target.checked)} />
                                <div className={cn("w-12 h-6 bg-slate-800 rounded-full transition-colors", settings.hasValidRFC && "bg-indigo-500")}>
                                    <div className={cn("absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform", settings.hasValidRFC && "translate-x-6")} />
                                </div>
                            </label>
                          </div>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Tasa de IVA (desglose en precio)</label>
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={() => updateSetting('ivaRate', 0.16)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", (settings.ivaRate ?? 0.16) === 0.16 ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-slate-300")}>16% — Resto de la República</button>
                                <button onClick={() => updateSetting('ivaRate', 0.08)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", (settings.ivaRate ?? 0.16) === 0.08 ? "bg-indigo-500 border-indigo-400 text-white shadow-[0_8px_20px_-12px_rgba(13,16,14,0.25)] shadow-indigo-500/20" : "bg-slate-950 border-carbon-950/10 text-slate-500 hover:text-slate-300")}>8% — Zona Fronteriza</button>
                            </div>
                          </div>
                      </div>
                  </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

export default App;
