// Pedidos en línea: tipos y utilidades compartidas entre el panel del restaurante y la página pública.
import type { ProductRowData, Category, ModifierGroup } from '../types/calculator';

export interface OMod { id: string; name: string; price: number }
export interface OGroup { id: string; name: string; type: 'single' | 'multiple'; min?: number; max?: number; options: OMod[] }
export interface OProduct { id: string; name: string; description?: string; price: number; categoryId?: string; groups?: string[]; photo?: string; hidden?: boolean; soldOut?: boolean }
export interface OMenu { categories: { id: string; name: string }[]; groups: OGroup[]; products: OProduct[]; syncedAt?: string }

/** Rutas de donpunto.com que nunca pueden ser de un restaurante (mismo listado que api/order.ts) */
export const RESERVED_SLUGS = new Set([
  'login', 'restablecer', 'blog', 'privacidad', 'terminos', 'webinar', 'api', 'assets', 'brand', 'admin', 'app',
  'pedidos', 'pedido', 'tienda', 'tiendas', 'donpunto', 'don-punto', 'soporte', 'ayuda', 'precios', 'planes',
  'registro', 'cuenta', 'mi-cuenta', 'dashboard', 'pos', 'menu', 'sw', 'manifest', 'robots', 'sitemap', 'favicon',
  'www', 'mail', 'static', 'public', 'contacto', 'legal',
]);
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;

/** ¿La URL actual es la página pública de un restaurante? (donpunto.com/<slug>) */
export function storeSlugFromPath(path = window.location.pathname): string | null {
  const m = path.match(/^\/([a-z0-9][a-z0-9-]{2,39})\/?$/);
  if (!m || RESERVED_SLUGS.has(m[1])) return null;
  return m[1];
}

export function slugify(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Copia publicada del menú: precios del Catálogo + datos propios de la página (foto, descripción, oculto, agotado). */
export function buildMenu(rows: ProductRowData[], categories: Category[], groups: ModifierGroup[], prev?: OMenu | null): OMenu {
  const old = new Map((prev?.products || []).map((p) => [p.id, p]));
  const products: OProduct[] = rows
    .filter((r) => r.name?.trim())
    .map((r) => {
      const o = old.get(r.id);
      const gids = groups.filter((g) => r.modifierGroupIds?.includes(g.id) || (r.categoryId && g.appliedToCategories?.includes(r.categoryId))).map((g) => g.id);
      return {
        id: r.id, name: r.name.trim(), price: Number(r.salePrice) || 0, categoryId: r.categoryId || '', groups: gids,
        description: o?.description ?? r.description ?? '', photo: o?.photo, hidden: o ? !!o.hidden : false, soldOut: !!o?.soldOut,
      };
    });
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    groups: groups.map((g) => ({
      id: g.id, name: g.name, type: g.selectionType, min: g.minSelect || 0, max: g.maxSelect || undefined,
      options: g.options.map((o) => ({ id: o.id, name: o.name, price: Number(o.extraPrice) || 0 })),
    })),
    products,
    syncedAt: new Date().toISOString(),
  };
}

/** Reduce una foto a webp (máx. `max` px) antes de subirla: carga rápido en celulares y ahorra espacio. */
export async function compressImage(file: File, max = 1000, quality = 0.82): Promise<File> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const blob: Blob | null = await new Promise((r) => c.toBlob(r, 'image/webp', quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
}

export const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const STATUS_LABEL: Record<string, string> = {
  new: 'Recibido', accepted: 'En preparación', ready: 'Listo', on_way: 'En camino', done: 'Entregado', rejected: 'Rechazado',
};
