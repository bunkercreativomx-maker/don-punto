/** $1,234.56 con separador de miles (es-MX) */
export const money = (n: number | string | null | undefined): string =>
  (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
