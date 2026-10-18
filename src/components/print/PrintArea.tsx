import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import type { PaperSize } from '../../types/pos';
import type { PrintKind } from '../../lib/print';

/** Contenedor de impresión colgado de <body>; invisible en pantalla. */
export function PrintArea({ kind, paper, children }: { kind: PrintKind; paper?: PaperSize; children: ReactNode }) {
  const size = paper === 'Standard' ? 'paper-standard' : paper === '80mm' ? 'paper-80mm' : 'paper-58mm';
  return createPortal(<div className={`print-root print-root-${kind} ${size}`}>{children}</div>, document.body);
}
