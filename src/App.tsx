import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useCalculator } from './hooks/useCalculator';
import type { Platform, PaymentMethod } from './types/calculator';
import { BarChart3, ShoppingBasket, Calculator, Layers, User, LineChart, Settings, Plus, Lock, Key, Sparkles, Receipt, LogOut, FileSpreadsheet, TrendingUp, Package, Target, BookOpen, Wallet, Search } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { ProfitGrid } from './components/ProfitGrid';
import { PricingGrid } from './components/PricingGrid';
import { POSDashboard } from './components/pos/POSDashboard';
import { MenuManagement } from './components/pos/MenuManagement';
import { POSReports } from './components/pos/POSReports';
import { POSTicketsHistory } from './components/pos/POSTicketsHistory';
import { LandingPage } from './components/landing/LandingPage';
import { AuthPage } from './components/auth/AuthPage';
import { SubscriptionGate } from './components/auth/SubscriptionGate';
import { MenuScannerModal } from './components/pos/MenuScannerModal';
import { MenuImportModal, type ImportPlatforms } from './components/pos/MenuImportModal';
import { usePOS } from './hooks/usePOS';
import { supabase } from './lib/supabase';
import { Building2, Phone, MapPin, PrinterIcon } from 'lucide-react';
import { InventoryModule } from './components/inventory/InventoryModule';
import { MenuEngineeringModule } from './components/menu-engineering/MenuEngineeringModule';
import { RecipesModule } from './components/recipes/RecipesModule';
import { FinancialModule } from './components/financial/FinancialModule';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

function App() {
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

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("donPuntoGeminiApiKey") || "");
  const [showAuthFlow, setShowAuthFlow] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'active' | 'inactive' | 'checking'>('checking');
  const [isCloudMenuLoaded, setIsCloudMenuLoaded] = useState(false);

  const loadCloudMenuRef = useRef(loadCloudMenu);
  useEffect(() => {
    loadCloudMenuRef.current = loadCloudMenu;
  }, [loadCloudMenu]);
  
  const [profitsSearch, setProfitsSearch] = useState('');
  const [pricingSearch, setPricingSearch] = useState('');
  const [profitsPage, setProfitsPage] = useState(1);
  const [pricingPage, setPricingPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => { setProfitsPage(1); }, [profitsSearch]);
  useEffect(() => { setPricingPage(1); }, [pricingSearch]);

  const [activeTab, setActiveTab] = useState<'profits' | 'pricing' | 'pos' | 'menu' | 'reports' | 'tickets' | 'settings' | 'inventory' | 'engineering' | 'recipes' | 'financial'>(() => {
    const saved = localStorage.getItem('donPuntoActiveTab');
    return (saved as any) || 'profits';
  });

  useEffect(() => {
    localStorage.setItem('donPuntoActiveTab', activeTab);
  }, [activeTab]);

  // Combined robust Auth & Subscription Listener with Cloud Menu Recovery
  useEffect(() => {
    let isMounted = true;

    const checkSessionAndSubscription = async (session: any) => {
        if (!session) {
            if (isMounted) {
                setIsAuthenticated(false);
                setUserEmail(null);
                setSubscriptionStatus('inactive');
                setIsAuthChecking(false);
                setIsCloudMenuLoaded(false);
            }
            return;
        }

        if (isMounted) {
            setIsAuthenticated(true);
            setUserEmail(session.user.email);
        }

        try {
            const isTestUser = session.user.email === 'pakovipteam@gmail.com' || session.user.email === 'tgudino@me.com';

            // Buscar el restaurante del dueño
            let { data: restaurant, error } = await supabase
                .from('restaurants')
                .select('subscription_status, stripe_customer_id')
                .eq('owner_id', session.user.id)
                .single();
            
            if (error && error.code === 'PGRST116') {
                // No existe el restaurante (cuenta nueva), lo creamos
                const defaultStatus = isTestUser ? 'active' : 'inactive';
                const { data: newRest } = await supabase.from('restaurants').insert([
                    { name: 'Mi Restaurante', owner_id: session.user.id, subscription_status: defaultStatus }
                ]).select().single();
                restaurant = newRest;
                if (isMounted) {
                    setSubscriptionStatus(defaultStatus);
                }
            } else if (isTestUser && restaurant && restaurant.subscription_status !== 'active') {
                // Si es usuario de prueba y no tiene status active, lo actualizamos de inmediato en Supabase
                await supabase.from('restaurants').update({ subscription_status: 'active' }).eq('owner_id', session.user.id);
                if (isMounted) {
                    setSubscriptionStatus('active');
                }
            } else if (restaurant && restaurant.subscription_status === 'active') {
                if (isMounted) {
                    setSubscriptionStatus('active');
                }
            } else {
                if (isMounted) {
                    setSubscriptionStatus('inactive');
                }
            }

            // Recuperar el menú respaldado en la nube
            if (restaurant && restaurant.stripe_customer_id) {
                try {
                    const parsed = JSON.parse(restaurant.stripe_customer_id);
                    if (parsed && parsed.menu) {
                        const { rows: cloudRows, categories: cloudCategories, modifierGroups: cloudModifierGroups } = parsed.menu;
                        if (isMounted && loadCloudMenuRef.current) {
                            loadCloudMenuRef.current(cloudRows, cloudCategories, cloudModifierGroups);
                        }
                    }
                } catch (e) {
                    console.error("Error al procesar respaldo de menú:", e);
                }
            }
        } catch (err) {
            console.error("Error al validar sesión de restaurante:", err);
            if (isMounted) {
                setSubscriptionStatus('inactive');
            }
        } finally {
            if (isMounted) {
                setIsCloudMenuLoaded(true);
                setIsAuthChecking(false);
            }
        }
    };

    // 1. Verificar sesión inicial de inmediato
    supabase.auth.getSession().then(({ data: { session } }) => {
        checkSessionAndSubscription(session);
    }).catch(() => {
        if (isMounted) {
            setIsAuthChecking(false);
            setIsCloudMenuLoaded(true);
        }
    });

    // 2. Suscribirse a los cambios de estado de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
            if (isMounted) {
                setIsAuthenticated(false);
                setUserEmail(null);
                setSubscriptionStatus('inactive');
                setIsAuthChecking(false);
                setIsCloudMenuLoaded(false);
            }
        } else if (session) {
            checkSessionAndSubscription(session);
        }
    });

    // Timeout de seguridad (4 segundos)
    const timeout = setTimeout(() => {
        if (isMounted && isAuthChecking) {
            setIsAuthChecking(false);
            setIsCloudMenuLoaded(true);
        }
    }, 4000);

    return () => {
        isMounted = false;
        subscription.unsubscribe();
        clearTimeout(timeout);
    };
  }, []);

  // Automatic Cloud Menu Backup & Sync
  useEffect(() => {
    if (!isAuthenticated || !isCloudMenuLoaded) return;

    const syncMenuToCloud = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const menuPayload = {
        menu: {
          rows,
          categories,
          modifierGroups
        }
      };

      try {
        await supabase
          .from('restaurants')
          .update({ stripe_customer_id: JSON.stringify(menuPayload) })
          .eq('owner_id', session.user.id);
      } catch (e) {
        console.error("Error backing up menu to cloud:", e);
      }
    };

    // Debounce cloud sync to avoid spamming writes on every keystroke
    const timer = setTimeout(() => {
       syncMenuToCloud();
    }, 2000);

    return () => clearTimeout(timer);
  }, [rows, categories, modifierGroups, isAuthenticated, isCloudMenuLoaded]);

  const handleSimulatePayment = async () => {
      // Para efectos del prototipo, esto simula que Stripe aprobó el pago
      // y actualizamos el status en la base de datos de Supabase real
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          await supabase
              .from('restaurants')
              .update({ subscription_status: 'active' })
              .eq('owner_id', user.id);
      }
      setSubscriptionStatus('active');
  };

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
                      let existingCat = currentCategories.find(c => c.name.trim().toLowerCase() === categoryName.toLowerCase());
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
                  let existingProduct = currentProducts.find(p => p.name.trim().toLowerCase() === productName.toLowerCase() || p.id === itemId);
                  let prodId = existingProduct ? existingProduct.id : undefined;

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
                      
                      let existingGroup = currentModifierGroups.find(g => g.name.trim().toLowerCase() === optionGroupName.toLowerCase() && (existingProduct && existingProduct.modifierGroupIds?.includes(g.id)));
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

                      let existingOpt = group.options.find(o => o.name.trim().toLowerCase() === optionName.trim().toLowerCase());
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

  // Settings PIN State
  const [isSettingsPinModalOpen, setIsSettingsPinModalOpen] = useState(false);
  const [settingsPinInput, setSettingsPinInput] = useState('');
  const [settingsPinError, setSettingsPinError] = useState(false);

  const handleSettingsClick = () => {
      setSettingsPinInput('');
      setSettingsPinError(false);
      setIsSettingsPinModalOpen(true);
  };

  const handleSettingsPinSubmit = () => {
      const validPin = posSettings.adminPin || '1234';
      if (settingsPinInput === validPin) {
          setIsSettingsPinModalOpen(false);
          setActiveTab('settings');
      } else {
          setSettingsPinError(true);
          setSettingsPinInput('');
      }
  };

  if (isAuthChecking) {
      return (
          <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-white font-black text-2xl animate-pulse shadow-[0_0_30px_rgba(99,102,241,0.4)]">
                D
              </div>
              <div className="text-slate-500 text-[10px] font-black tracking-widest uppercase animate-pulse">Cargando Don Punto...</div>
          </div>
      );
  }

  if (!isAuthenticated) {
    if (showAuthFlow) {
        return <AuthPage onAuthSuccess={() => setIsAuthenticated(true)} />;
    }
    return <LandingPage onLogin={() => setShowAuthFlow(true)} onSubscribe={() => setShowAuthFlow(true)} />;
  }

  return (
    <SubscriptionGate 
        status={subscriptionStatus} 
        onSimulatePayment={handleSimulatePayment}
    >
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

      {/* --- SETTINGS PIN MODAL --- */}
      {isSettingsPinModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-md no-print">
              <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 bg-slate-800/30 border-b border-white/10 text-center">
                      <div className="w-12 h-12 bg-pink-500/20 text-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Lock size={24} />
                      </div>
                      <h3 className="text-xl font-bold text-white">Configuración del Sistema</h3>
                      <p className="text-slate-400 text-xs mt-2">Ingresa el PIN de administrador para acceder a los ajustes.</p>
                  </div>
                  <div className="p-6">
                      <input 
                          type="password"
                          autoFocus
                          value={settingsPinInput}
                          onChange={(e) => setSettingsPinInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSettingsPinSubmit()}
                          placeholder="••••"
                          className={cn(
                              "w-full bg-slate-950 border-2 rounded-2xl text-center text-4xl tracking-[0.5em] font-black text-white py-4 outline-none transition-all",
                              settingsPinError ? "border-rose-500 text-rose-500" : "border-white/10 focus:border-indigo-500"
                          )}
                      />
                      {settingsPinError && <div className="text-rose-500 text-xs font-bold text-center mt-3 animate-pulse">PIN INCORRECTO</div>}
                      
                      <div className="grid grid-cols-2 gap-3 mt-6">
                          <button onClick={() => setIsSettingsPinModalOpen(false)} className="py-3 rounded-xl font-bold text-slate-500 hover:text-white transition-all bg-slate-800/50">CANCELAR</button>
                          <button onClick={handleSettingsPinSubmit} className="py-3 rounded-xl font-black text-white bg-pink-500 hover:bg-pink-400 transition-all shadow-lg shadow-pink-500/20 active:scale-95">ACCEDER</button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- PREMIUM SIDEBAR --- */}
      <nav className="w-16 lg:w-52 bg-slate-900/40 border-r border-white/5 flex flex-col items-center lg:items-stretch py-4 gap-3 relative z-30 backdrop-blur-xl shrink-0 no-print overflow-y-auto no-scrollbar">
        {/* User Avatar */}
        <div className="flex items-center gap-3 px-2 lg:px-4 py-1 mb-1 group cursor-default">
          <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 shrink-0 hover:border-white/20 transition-all">
            <User size={20} />
          </div>
          {userEmail && (
            <span className="hidden lg:block text-[11px] font-bold text-slate-400 truncate leading-tight">{userEmail}</span>
          )}
        </div>

        <div className="w-full px-2 lg:px-3">
          <div className="h-px bg-white/5 w-full" />
        </div>

        <div className="flex flex-col gap-1 flex-grow w-full px-2 lg:px-3">
          <button onClick={() => setActiveTab('profits')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'profits' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <BarChart3 size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Tienda Física</span>
            {activeTab === 'profits' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('pricing')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'pricing' ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Calculator size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Plataformas</span>
            {activeTab === 'pricing' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-indigo-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('pos')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'pos' ? "bg-pink-500/10 text-pink-400 border border-pink-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <ShoppingBasket size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Punto de Venta</span>
            {activeTab === 'pos' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-pink-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('tickets')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'tickets' ? "bg-violet-500/10 text-violet-400 border border-violet-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Receipt size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Tickets</span>
            {activeTab === 'tickets' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-violet-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('reports')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'reports' ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <LineChart size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Reportes</span>
            {activeTab === 'reports' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-cyan-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('menu')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'menu' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Layers size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Catálogo</span>
            {activeTab === 'menu' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-amber-500 rounded-r-full" />}
          </button>

          <div className="w-full my-1">
            <div className="h-px bg-white/5 w-full" />
          </div>

          <button onClick={() => setActiveTab('inventory')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'inventory' ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Package size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Inventario</span>
            {activeTab === 'inventory' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-teal-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('engineering')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'engineering' ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Target size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Radar de Menú</span>
            {activeTab === 'engineering' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-rose-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('recipes')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'recipes' ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <BookOpen size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Recetario</span>
            {activeTab === 'recipes' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-orange-500 rounded-r-full" />}
          </button>

          <button onClick={() => setActiveTab('financial')} className={cn("p-3 lg:px-3 rounded-xl transition-all duration-200 relative flex items-center gap-3", activeTab === 'financial' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border border-transparent")}>
            <Wallet size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Financiero</span>
            {activeTab === 'financial' && <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-500 rounded-r-full" />}
          </button>
        </div>

        <div className="w-full px-2 lg:px-3">
          <div className="h-px bg-white/5 w-full" />
        </div>

        <div className="flex flex-col gap-1 shrink-0 w-full px-2 lg:px-3">
          <button onClick={handleSettingsClick} className={cn("p-3 lg:px-3 rounded-xl transition-all flex items-center gap-3", activeTab === 'settings' ? "bg-white/10 text-white border border-white/10" : "text-slate-600 hover:text-slate-400 hover:bg-white/5 border border-transparent")}>
            <Settings size={20} className="shrink-0" />
            <span className="hidden lg:block text-xs font-bold whitespace-nowrap">Ajustes</span>
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
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
            "absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] opacity-20 blur-[120px] pointer-events-none transition-colors duration-1000 no-print",
            settings.platform === 'Uber' && "bg-green-600",
            settings.platform === 'Didi' && "bg-orange-600",
            settings.platform === 'Rappi' && "bg-pink-600"
        )} />

        <div className="flex-grow px-6 py-6 overflow-auto relative z-10 no-scrollbar">
          <div className="w-full">
            <header className="mb-6 flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4 no-print">
              <div>
                <h1 className="text-3xl font-black text-white tracking-tighter">
                  {activeTab === 'profits' && 'Análisis de Ganancias de Tienda Física'}
                  {activeTab === 'pricing' && 'Estrategia de Precios'}
                  {activeTab === 'pos' && 'Punto de Venta POS'}
                  {activeTab === 'reports' && 'Reportes Financieros'}
                  {activeTab === 'tickets' && 'Historial de Tickets'}
                  {activeTab === 'menu' && 'Catálogo de Productos'}
                  {activeTab === 'settings' && 'Ajustes del Sistema'}
                  {activeTab === 'inventory' && 'Inventario de Insumos'}
                  {activeTab === 'engineering' && 'Radar de Menú'}
                  {activeTab === 'recipes' && 'Recetario Estándar'}
                  {activeTab === 'financial' && 'Estado Financiero Semanal'}
                </h1>
                <p className="text-slate-500 mt-2 font-medium tracking-wide">
                  {activeTab === 'profits' && ''}
                  {activeTab === 'pricing' && 'Calcula precios sugeridos para no perder ni un peso en plataformas.'}
                  {activeTab === 'pos' && 'Registra tus ventas y personaliza pedidos en tiempo real.'}
                  {activeTab === 'reports' && 'Analiza tu IVA y revisa los desgloses generales de ganancias.'}
                  {activeTab === 'tickets' && 'Busca folios pasados, reimprime recibos de cliente o comandas de cocina.'}
                  {activeTab === 'menu' && 'Administra tus categorías, modificadores y catálogo.'}
                  {activeTab === 'settings' && 'Personaliza tu plataforma, régimen y métodos de pago.'}
                  {activeTab === 'inventory' && 'Controla stock de insumos, detecta alertas y genera pedidos automáticos.'}
                  {activeTab === 'engineering' && 'Top ventas del mes conectado al POS · CRACK, DIAMANTE, CORREDOR y REZAGADO · Combos con IA.'}
                  {activeTab === 'recipes' && 'Gestiona recetas estándar con análisis de costo e ingredientes.'}
                  {activeTab === 'financial' && 'Registra ventas diarias por canal y controla compras y egresos semanales.'}
                </p>
              </div>
              
              {(activeTab === 'profits' || activeTab === 'pricing' || activeTab === 'menu') && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="bg-slate-900 border border-emerald-500/30 hover:bg-slate-800 text-emerald-400 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-500/10 active:scale-95 flex items-center gap-2"
                    >
                        <FileSpreadsheet size={18} />
                        IMPORTAR MENÚ
                    </button>
                    <button
                        onClick={() => setIsScannerOpen(true)}
                        className="bg-slate-900 border border-indigo-500/30 hover:bg-slate-800 text-indigo-400 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-500/10 active:scale-95 flex items-center gap-2"
                    >
                        <Sparkles size={18} /> ESCANEAR MENÚ
                    </button>
                    {(activeTab === 'profits' || activeTab === 'pricing') && (
                        <button
                          onClick={addRow}
                          className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-xl shadow-indigo-500/20 active:scale-95 flex items-center gap-2"
                        >
                          <Plus size={18} strokeWidth={3} /> AGREGAR PRODUCTO
                        </button>
                    )}
                </div>
              )}
            </header>

            <main className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {activeTab === 'profits' && (() => {
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
                                className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/30 transition-all"
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
                                <button onClick={() => setProfitsPage(p => Math.max(1, p - 1))} disabled={safeProfitsPage === 1} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-white/5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Anterior</button>
                                <span className="text-xs text-slate-400 font-medium">Página {safeProfitsPage} de {totalProfitsPages} <span className="text-slate-600">({filteredProfits.length} platillos)</span></span>
                                <button onClick={() => setProfitsPage(p => Math.min(totalProfitsPages, p + 1))} disabled={safeProfitsPage === totalProfitsPages} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-white/5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Siguiente →</button>
                            </div>
                        )}
                    </div>
                    <div className="lg:col-span-3">
                         <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                            <div className="absolute -right-6 -bottom-6 opacity-10 pointer-events-none">
                                <TrendingUp size={110} className="text-emerald-400" />
                            </div>
                            <p className="text-[10px] font-black text-emerald-400/70 uppercase tracking-[0.2em] mb-3">ROI Neto Estimado</p>
                            <div className="text-4xl font-black text-emerald-400 tracking-tighter">
                                ${results.reduce((acc, r) => acc + r.netProfit, 0).toFixed(2)}
                            </div>
                            <p className="text-[10px] text-emerald-500/50 font-bold mt-3 uppercase tracking-wide">Ganancia total de todos los productos</p>
                        </div>
                    </div>
                </div>
              ); })()}
              {activeTab === 'pricing' && (() => {
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
                            className="w-full bg-slate-900 border border-white/5 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/30 transition-all"
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
                            <button onClick={() => setPricingPage(p => Math.max(1, p - 1))} disabled={safePricingPage === 1} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-white/5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">← Anterior</button>
                            <span className="text-xs text-slate-400 font-medium">Página {safePricingPage} de {totalPricingPages} <span className="text-slate-600">({filteredPricing.length} platillos)</span></span>
                            <button onClick={() => setPricingPage(p => Math.min(totalPricingPages, p + 1))} disabled={safePricingPage === totalPricingPages} className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 border border-white/5 text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all">Siguiente →</button>
                        </div>
                    )}
                </div>
              ); })()}
              {activeTab === 'pos' && <POSDashboard />}
              {activeTab === 'reports' && <POSReports />}
              {activeTab === 'tickets' && <POSTicketsHistory />}
              {activeTab === 'inventory' && <InventoryModule />}
              {activeTab === 'engineering' && <MenuEngineeringModule />}
              {activeTab === 'recipes' && <RecipesModule />}
              {activeTab === 'financial' && <FinancialModule />}
              {activeTab === 'menu' && (
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
              {activeTab === 'settings' && (
                  <div className="max-w-2xl space-y-6">

                      {/* Business Info */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-white tracking-tight mb-1">Información del Negocio</h3>
                              <p className="text-[11px] text-slate-500">Aparece en el encabezado de todos tus tickets impresos.</p>
                          </div>
                          <div className="space-y-4">
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <Building2 size={16} className="text-indigo-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Nombre del Negocio</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessName || ''}
                                          onChange={(e) => updatePosSettings({ businessName: e.target.value })}
                                          placeholder="Ej: Las Alitas de Siempre"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <Phone size={16} className="text-emerald-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Teléfono</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessPhone || ''}
                                          onChange={(e) => updatePosSettings({ businessPhone: e.target.value })}
                                          placeholder="Ej: 656-123-4567"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                              <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                                  <MapPin size={16} className="text-rose-400 shrink-0" />
                                  <div className="flex-1">
                                      <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Dirección</div>
                                      <input
                                          type="text"
                                          value={posSettings.businessAddress || ''}
                                          onChange={(e) => updatePosSettings({ businessAddress: e.target.value })}
                                          placeholder="Ej: Av. Juárez 123, Col. Centro"
                                          className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700"
                                      />
                                  </div>
                              </div>
                          </div>
                          {/* Print Settings */}
                          <div className="border-t border-white/5 pt-6 space-y-4">
                              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                  <PrinterIcon size={14} /> Configuración de Impresión
                              </h4>
                              <div className="grid grid-cols-2 gap-3">
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: '58mm' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          (posSettings.paperSize || '58mm') === '58mm' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-white/5 text-slate-500 hover:text-white"
                                      )}
                                  >🖨️ Térmica 58mm</button>
                                  <button
                                      onClick={() => updatePosSettings({ paperSize: 'Standard' })}
                                      className={cn("py-3 rounded-2xl text-xs font-black transition-all border",
                                          posSettings.paperSize === 'Standard' ? "bg-indigo-500 border-indigo-400 text-white" : "bg-slate-950 border-white/5 text-slate-500 hover:text-white"
                                      )}
                                  >🖨️ Normal (A4/Carta)</button>
                              </div>
                          </div>
                      </div>

                      {/* Security Settings */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-6">
                          <div>
                              <h3 className="text-base font-black text-rose-500 tracking-tight mb-1 flex items-center gap-2"><Lock size={18}/> Seguridad Antifraude</h3>
                              <p className="text-[11px] text-slate-500">Este PIN se solicitará para borrar tickets, eliminar productos y entrar a esta configuración.</p>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-950 border border-white/5 rounded-2xl px-4 py-3">
                              <Key size={16} className="text-rose-400 shrink-0" />
                              <div className="flex-1">
                                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">PIN de Administrador</div>
                                  <input
                                      type="password"
                                      maxLength={4}
                                      value={posSettings.adminPin || '1234'}
                                      onChange={(e) => updatePosSettings({ adminPin: e.target.value })}
                                      placeholder="1234"
                                      className="w-full bg-transparent text-white text-sm font-bold outline-none placeholder:text-slate-700 tracking-[0.5em]"
                                  />
                              </div>
                          </div>
                      </div>

                      {/* Calculator Settings */}
                      <div className="bg-slate-900 border border-white/5 rounded-3xl p-8 space-y-8">
                          <h3 className="text-base font-black text-white tracking-tight">Configuración de la Calculadora</h3>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Plataforma Principal</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Uber', 'Didi', 'Rappi'] as Platform[]).map((p) => (
                                <button key={p} onClick={() => updateSetting('platform', p)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.platform === p ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>{p.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="space-y-4">
                            <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Método de Cobro Predeterminado</label>
                            <div className="grid grid-cols-3 gap-4">
                                {(['Efectivo', 'Transferencia', 'Tarjeta'] as PaymentMethod[]).map((method) => (
                                <button key={method} onClick={() => updateSetting('paymentMethod', method)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", settings.paymentMethod === method ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>{method.toUpperCase()}</button>
                                ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-between p-6 bg-slate-950 rounded-2xl border border-white/5">
                            <div>
                                <div className="text-white font-bold">RFC Válido</div>
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
                                <button onClick={() => updateSetting('ivaRate', 0.16)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", (settings.ivaRate ?? 0.16) === 0.16 ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>16% — Resto de la República</button>
                                <button onClick={() => updateSetting('ivaRate', 0.08)} className={cn("py-4 rounded-2xl text-xs font-black transition-all border", (settings.ivaRate ?? 0.16) === 0.08 ? "bg-indigo-500 border-indigo-400 text-white shadow-xl shadow-indigo-500/20" : "bg-slate-950 border-white/5 text-slate-500 hover:text-slate-300")}>8% — Zona Fronteriza</button>
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
    </SubscriptionGate>
  );
}

export default App;
