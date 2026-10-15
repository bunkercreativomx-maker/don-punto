import clsx from 'clsx';

/** Ícono "D." en mosaico agave (app icon / favicon) */
export function Mark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/mark.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={clsx('shrink-0 select-none', className)}
      style={{ borderRadius: size * 0.22 }}
    />
  );
}

/** Logotipo "Don Punto." en curvas. tone="light" para fondos claros, "dark" para fondos oscuros */
export function Wordmark({ tone = 'light', height = 28, className }: { tone?: 'light' | 'dark'; height?: number; className?: string }) {
  return (
    <img
      src={tone === 'light' ? '/brand/wordmark.svg' : '/brand/wordmark-white.svg'}
      height={height}
      style={{ height }}
      alt="Don Punto"
      draggable={false}
      className={clsx('w-auto select-none', className)}
    />
  );
}

/** Ícono + logotipo */
export function Logo({ tone = 'light', size = 34, className }: { tone?: 'light' | 'dark'; size?: number; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <Mark size={size} />
      <Wordmark tone={tone} height={size * 0.62} />
    </span>
  );
}
