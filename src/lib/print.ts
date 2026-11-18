/**
 * Impresión de tickets.
 * El ticket se dibuja en un contenedor colgado directo de <body> (ver PrintArea) y al imprimir
 * se oculta todo lo demás con display:none. Así no hay páginas en blanco, los tickets largos
 * siguen en la siguiente hoja, y no importa si la pantalla de origen está marcada como no-print.
 * La clase se quita en `afterprint` (en celular/tablet window.print() no espera al diálogo).
 */
import { btEnabled, btPrintArea } from './btPrinter';

export type PrintKind = 'ticket' | 'corte' | 'reporte';

let pending: (() => void) | null = null;

/** Si una impresión se queda colgada (BT sin respuesta), no debe bloquear para siempre */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('La impresora no respondió. Revisa que esté prendida y cerca.')), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

export function runPrint(kind: PrintKind, done?: () => void) {
  // Un clic nuevo nunca se ignora: cerramos la impresión anterior que se quedó a medias
  pending?.();
  const cls = `printing-${kind}`;
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (pending === finish) pending = null;
    document.body.classList.remove(cls);
    window.removeEventListener('afterprint', finish);
    done?.();
  };
  pending = finish;
  document.body.classList.add(cls);
  window.addEventListener('afterprint', finish);
  // Esperar dos cuadros para que React termine de pintar el ticket
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      // Impresora Bluetooth directa (tickets y cortes; la hoja carta sigue con el diálogo)
      if (kind !== 'reporte' && btEnabled()) {
        withTimeout(btPrintArea(kind), 20_000).then(finish).catch((e) => {
          window.alert(`No se pudo imprimir por Bluetooth: ${e?.message || e}\n\nSe abrirá la ventana de impresión normal.`);
          try { window.print(); } catch { /* nada */ }
          setTimeout(finish, 60_000);
        });
        return;
      }
      // Tablet/celular Android sin impresora conectada en Don Punto: el diálogo del sistema casi nunca
      // imprime en térmicas (y en la app instalada a veces ni abre). Avisar en vez de quedarse callado.
      const ua = navigator.userAgent;
      const tablet = /Android/i.test(ua) || (/Linux/i.test(ua) && !/CrOS/i.test(ua) && navigator.maxTouchPoints > 0);
      if (kind !== 'reporte' && tablet) window.dispatchEvent(new CustomEvent('dp:noprinter', { detail: { kind } }));
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
