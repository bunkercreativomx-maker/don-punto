// Menú por sucursal: un solo catálogo; cada producto puede no venderse o tener otro precio en una sucursal.
import type { ProductRowData, BranchProduct } from '../types/calculator';

export function branchInfo(row: ProductRowData, branchId: string): BranchProduct {
  return row.branches?.[branchId] || {};
}

/** ¿Se vende este producto en la sucursal? (sin configurar = sí) */
export function soldIn(row: ProductRowData, branchId: string): boolean {
  return !branchInfo(row, branchId).off;
}

/** Precio en tienda que se cobra en la sucursal (propio o el normal) */
export function branchPrice(row: ProductRowData, branchId: string): number {
  const p = branchInfo(row, branchId).price;
  return typeof p === 'number' && p >= 0 ? p : row.salePrice || 0;
}

/** Productos de la sucursal con su precio ya aplicado (para POS y tienda en línea) */
export function rowsForBranch(rows: ProductRowData[], branchId: string): ProductRowData[] {
  return rows
    .filter((r) => soldIn(r, branchId))
    .map((r) => {
      const p = branchInfo(r, branchId).price;
      return typeof p === 'number' && p >= 0 ? { ...r, salePrice: p } : r;
    });
}

/** Cambia la configuración de una sucursal y limpia entradas vacías */
export function withBranch(row: ProductRowData, branchId: string, patch: BranchProduct): Record<string, BranchProduct> | undefined {
  const next: Record<string, BranchProduct> = { ...(row.branches || {}) };
  const cur = { ...(next[branchId] || {}), ...patch };
  if (!cur.off) delete cur.off;
  if (cur.price === undefined || cur.price === null || Number.isNaN(cur.price)) delete cur.price;
  if (Object.keys(cur).length) next[branchId] = cur; else delete next[branchId];
  return Object.keys(next).length ? next : undefined;
}
