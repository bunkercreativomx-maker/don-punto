/**
 * Inventario automático (plan Pro): al vender un platillo se descuentan los insumos de su receta.
 * Enlace receta → platillos: receta.platillos [{productoId, veces}] (o el viejo productoId, o mismo nombre). Un platillo puede llevar varias recetas. Las opciones de modificador también: receta.modificadores [{modId, veces}]. Ingrediente → insumo: ingrediente.insumoId (o mismo nombre).
 */
import { storeGet, storeSet } from './cloudStore';
import type { CartItem } from '../types/pos';

interface Ing { id: string; nombre: string; cantidad: number; unidad: string; insumoId?: string }
export interface RecipeLink { productoId: string; veces: number }
export interface ModLink { modId: string; veces: number }
interface Recipe { id: string; nombre: string; porciones: number; productoId?: string; platillos?: RecipeLink[]; modificadores?: ModLink[]; ingredientes: Ing[] }

/** Platillos ligados a una receta con cuántas veces la lleva cada uno (compatible con el viejo productoId). */
export function recipeLinks(r: { productoId?: string; platillos?: RecipeLink[] }): RecipeLink[] {
  const out: RecipeLink[] = (r.platillos || []).filter((l) => l && l.productoId).map((l) => ({ productoId: l.productoId, veces: l.veces > 0 ? l.veces : 1 }));
  if (r.productoId && !out.some((l) => l.productoId === r.productoId)) out.unshift({ productoId: r.productoId, veces: 1 });
  return out;
}

/** Recetas ligadas a una opción de modificador (ej. «20 piezas» = Boneless ×2). */
export function recipesForModifier<T extends Recipe>(recipes: T[], modId: string): { recipe: T; veces: number }[] {
  const out: { recipe: T; veces: number }[] = [];
  for (const r of recipes) {
    const l = (r.modificadores || []).find((x) => x && x.modId === modId);
    if (l) out.push({ recipe: r, veces: l.veces > 0 ? l.veces : 1 });
  }
  return out;
}

/** Recetas que lleva un platillo y cuántas veces cada una (ej. Paquete 20 = Boneless ×2 + Papas ×1). */
export function recipesForProduct<T extends Recipe>(recipes: T[], row: { id: string; name: string }): { recipe: T; veces: number }[] {
  const linked: { recipe: T; veces: number }[] = [];
  for (const r of recipes) {
    const l = recipeLinks(r).find((x) => x.productoId === row.id);
    if (l) linked.push({ recipe: r, veces: l.veces });
  }
  if (linked.length) return linked;
  const byName = recipes.find((r) => !recipeLinks(r).length && !(r.modificadores || []).length && norm(r.nombre) === norm(row.name));
  return byName ? [{ recipe: byName, veces: 1 }] : [];
}
interface Insumo { id: string; nombre: string; unidad: string; saldoActual: number; consumoMinDiario: number; consumoMaxDiario: number; tiempoReposicion: number }
export interface StockAlert { id: string; nombre: string; saldo: number; unidad: string; level: 'warning' | 'critical' }

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function unitBase(u: string): { base: string; factor: number } {
  const x = norm(u).replace(/\.$/, '');
  if (['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(x)) return { base: 'g', factor: 1000 };
  if (['g', 'gr', 'grs', 'gramo', 'gramos'].includes(x)) return { base: 'g', factor: 1 };
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(x)) return { base: 'ml', factor: 1000 };
  if (['ml', 'mililitro', 'mililitros'].includes(x)) return { base: 'ml', factor: 1 };
  if (['pz', 'pza', 'pzas', 'pieza', 'piezas', 'unidad', 'unidades', 'u'].includes(x)) return { base: 'pz', factor: 1 };
  return { base: x, factor: 1 };
}
/** Convierte una cantidad de la unidad de la receta a la del insumo (null si no son compatibles) */
export function convert(qty: number, from: string, to: string): number | null {
  const a = unitBase(from), b = unitBase(to);
  if (a.base !== b.base) return null;
  return (qty * a.factor) / b.factor;
}

export function stockLevel(i: Insumo): 'ok' | 'warning' | 'critical' {
  const avg = (i.consumoMinDiario + i.consumoMaxDiario) / 2;
  const min = i.consumoMinDiario * i.tiempoReposicion;
  const punto = avg * i.tiempoReposicion + min;
  if (punto <= 0) return 'ok';
  if (i.saldoActual <= min) return 'critical';
  if (i.saldoActual <= punto) return 'warning';
  return 'ok';
}

/** Descuenta del inventario lo vendido. Devuelve los insumos que ACABAN de entrar en alerta. */
export function applySaleToInventory(cart: CartItem[], rows: { id: string; name: string }[]): { alerts: StockAlert[]; touched: number } {
  let recipes: Recipe[] = [];
  let insumos: Insumo[] = [];
  try { recipes = JSON.parse(storeGet('donPuntoRecetario') || '[]'); } catch { /* vacío */ }
  try { insumos = JSON.parse(storeGet('donPuntoInsumos2') || '[]'); } catch { /* vacío */ }
  if (!recipes.length || !insumos.length) return { alerts: [], touched: 0 };

  const before = new Map(insumos.map((i) => [i.id, stockLevel(i)]));
  let touched = 0;
  for (const item of cart) {
    const row = rows.find((r) => r.id === item.rowId);
    if (!row) continue;
    const uses = [...recipesForProduct(recipes, row)];
    for (const g of item.selectedModifiers || []) for (const m of g.modifiers || []) if (m?.id) uses.push(...recipesForModifier(recipes, m.id));
    for (const { recipe, veces } of uses) {
      const porciones = recipe.porciones > 0 ? recipe.porciones : 1;
      for (const ing of recipe.ingredientes || []) {
        const ins = insumos.find((i) => i.id === ing.insumoId) || insumos.find((i) => norm(i.nombre) === norm(ing.nombre));
        if (!ins || !(ing.cantidad > 0)) continue;
        const qty = convert((ing.cantidad / porciones) * veces * item.quantity, ing.unidad, ins.unidad);
        if (qty === null) continue;
        ins.saldoActual = Math.max(0, Math.round((ins.saldoActual - qty) * 1000) / 1000);
        touched++;
      }
    }
  }
  if (!touched) return { alerts: [], touched: 0 };
  storeSet('donPuntoInsumos2', JSON.stringify(insumos));
  const alerts: StockAlert[] = [];
  for (const i of insumos) {
    const now = stockLevel(i);
    const prev = before.get(i.id) || 'ok';
    const rank = { ok: 0, warning: 1, critical: 2 } as const;
    if (now !== 'ok' && rank[now] > rank[prev]) alerts.push({ id: i.id, nombre: i.nombre, saldo: i.saldoActual, unidad: i.unidad, level: now });
  }
  return { alerts, touched };
}
