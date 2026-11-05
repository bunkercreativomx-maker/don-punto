/**
 * Impresión de tickets.
 * El ticket se dibuja en un contenedor colgado directo de <body> (ver PrintArea) y al imprimir
 * se oculta todo lo demás con display:none. Así no hay páginas en blanco, los tickets largos
 * siguen en la siguiente hoja, y no importa si la pantalla de origen está marcada como no-print.
 * La clase se quita en `afterprint` (en celular/tablet window.print() no espera al diálogo).
 */
import { btEnabled, btPrintArea } from './btPrinter';

export type PrintKind = 'ticket' | 'corte' | 'reporte';

let busy = false;

export function runPrint(kind: PrintKind, done?: () => void) {
  if (busy) return;
  busy = true;
  const cls = `printing-${kind}`;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    busy = false;
    document.body.classList.remove(cls);
    window.removeEventListener('afterprint', finish);
    done?.();
  };
  document.body.classList.add(cls);
  window.addEventListener('afterprint', finish);
  // Esperar dos cuadros para que React termine de pintar el ticket
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      // Impresora Bluetooth directa (tickets y cortes; la hoja carta sigue con el diálogo)
      if (kind !== 'reporte' && btEnabled()) {
        btPrintArea(kind).then(finish).catch((e) => {
          window.alert(`No se pudo imprimir por Bluetooth: ${e?.message || e}\n\nSe abrirá la ventana de impresión normal.`);
          try { window.print(); } catch { /* nada */ }
          setTimeout(finish, 60_000);
        });
        return;
      }
      try {
        window.print();
      } catch {
        finish();
        return;
      }
      // Respaldo por si el navegador no manda afterprint
      setTimeout(finish, 60_000);
    }),
  );
}
