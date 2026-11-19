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
