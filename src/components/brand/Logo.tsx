import clsx from 'clsx';

// Logo 3D DonPunto.com (fuente: scripts/brand/src, assets: scripts/brand/make_logo_3d.py)
const MARK_RATIO = 613 / 424;      // ícono D
const WORDMARK_RATIO = 1482 / 203; // "DonPunto.com"
const LOGO_RATIO = 2104 / 424;     // ícono + texto

/** Ícono "D" 3D. Por defecto en mosaico blanco (estilo app icon) para que se vea en cualquier fondo; bare = sin mosaico */
export function Mark({ size = 36, className, bare = false }: { size?: number; className?: string; bare?: boolean }) {
  if (bare) {
    return (
      <img
        src="/brand/mark-3d.webp"
        width={Math.round(size * MARK_RATIO)}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={clsx('shrink-0 select-none', className)}
        style={{ height: size, width: 'auto' }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={clsx('inline-flex shrink-0 items-center justify-center bg-white shadow-sm ring-1 ring-black/5', className)}
      style={{ width: size, height: size, borderRadius: size * 0.24 }}
    >
      <img
        src="/brand/mark-3d.webp"
        alt=""
        draggable={false}
        className="select-none"
        style={{ width: '84%', height: 'auto' }}
      />
    </span>
  );
}

/** Texto "DonPunto.com" 3D (para fondos claros). tone se conserva por compatibilidad */
export function Wordmark({ height = 28, className }: { tone?: 'light' | 'dark'; height?: number; className?: string }) {
  return (
    <img
      src="/brand/wordmark-3d.webp"
      width={Math.round(height * WORDMARK_RATIO)}
      height={height}
      style={{ height, width: 'auto' }}
      alt="DonPunto.com"
      draggable={false}
      className={clsx('select-none', className)}
    />
  );
}

/** Logotipo completo: ícono + DonPunto.com. tagline agrega "Tu punto de venta para restaurantes". size = alto total */
export function Logo({ size = 34, tagline = false, className }: { tone?: 'light' | 'dark'; size?: number; tagline?: boolean; className?: string }) {
  return (
    <img
      src={tagline ? '/brand/logo-3d.webp' : '/brand/logo-3d-compact.webp'}
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      style={{ height: size, width: 'auto' }}
      alt="DonPunto.com"
      draggable={false}
      className={clsx('select-none max-w-full', className)}
    />
  );
}
