import type { ModifierGroup, ProductRowData } from '../types/calculator';

type P = Pick<ProductRowData, 'categoryId' | 'modifierGroupIds' | 'modifierGroupOff'>;

/** El grupo le llega al producto por su categoría («Aplicar automáticamente a categorías»). */
export const groupByCategory = (p: P, g: ModifierGroup) => !!p.categoryId && !!g.appliedToCategories?.includes(p.categoryId);

/** ¿El producto lleva este grupo? = elegido en el producto, o por su categoría y no se lo quitaron. */
export const productHasGroup = (p: P, g: ModifierGroup) =>
  !!p.modifierGroupIds?.includes(g.id) || (groupByCategory(p, g) && !p.modifierGroupOff?.includes(g.id));

/** Grupos del producto en el orden del catálogo. */
export const productGroups = (p: P, groups: ModifierGroup[]) => groups.filter((g) => productHasGroup(p, g));

/** Prende/apaga un grupo en un producto y regresa los campos a guardar. */
export function toggleProductGroup(p: P, g: ModifierGroup, on: boolean): Pick<ProductRowData, 'modifierGroupIds' | 'modifierGroupOff'> {
  const own = (p.modifierGroupIds || []).filter((x) => x !== g.id);
  const off = (p.modifierGroupOff || []).filter((x) => x !== g.id);
  if (groupByCategory(p, g)) {
    if (!on) off.push(g.id);
  } else if (on) own.push(g.id);
  return { modifierGroupIds: own, modifierGroupOff: off };
}

/** Colores de tarjeta (suaves, el nombre se sigue leyendo). */
export const PRODUCT_COLORS: { id: string; name: string; bg: string; bar: string }[] = [
  { id: 'red', name: 'Rojo', bg: '#FDE4E4', bar: '#EF4444' },
  { id: 'orange', name: 'Naranja', bg: '#FFE9D6', bar: '#F97316' },
  { id: 'yellow', name: 'Amarillo', bg: '#FEF3C7', bar: '#EAB308' },
  { id: 'green', name: 'Verde', bg: '#DCF5E3', bar: '#22A35A' },
  { id: 'blue', name: 'Azul', bg: '#DCEBFE', bar: '#3B82F6' },
  { id: 'purple', name: 'Morado', bg: '#EDE4FE', bar: '#8B5CF6' },
  { id: 'pink', name: 'Rosa', bg: '#FCE4F1', bar: '#EC4899' },
  { id: 'gray', name: 'Gris', bg: '#E8EAE6', bar: '#6B7280' },
];
export const productColor = (id?: string) => PRODUCT_COLORS.find((c) => c.id === id);

/** Días de la semana (0 = domingo, como Date.getDay()) */
export const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DAY_SHORT = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
/** Lunes primero para los botones */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
/** Día de la semana de hoy en la zona horaria del negocio (o la del equipo). */
export function weekdayIn(tz?: string): number {
  try { if (tz) return WD[new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date())] ?? new Date().getDay(); } catch { /* zona inválida */ }
  return new Date().getDay();
}
/** ¿Tiene días limitados? (vacío o los 7 = todos los días) */
export const hasDayLimit = (days?: number[]) => !!days && days.length > 0 && days.length < 7;
export const soldToday = (days: number[] | undefined, today: number) => !hasDayLimit(days) || days!.includes(today);
/** «Solo martes» / «Solo lunes y jueves» */
export function daysLabel(days?: number[]): string {
  if (!hasDayLimit(days)) return '';
  const names = DAY_ORDER.filter((d) => days!.includes(d)).map((d) => DAY_NAMES[d] + (d === 0 || d === 6 ? 's' : ''));
  return 'Solo los ' + (names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1]);
}
