import type { CorteData } from '../../lib/corte';
import { money } from '../../lib/format';

const $ = (n: number) => `$${money(n)}`;
const fdt = (d: Date | string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

function R({ l, v, b }: { l: string; v: string; b?: boolean }) {
  return <div className={`flex-row-print${b ? ' font-bold' : ''}`}><span>{l}</span><span>{v}</span></div>;
}
function H({ t }: { t: string }) {
  return <h3 className="font-bold uppercase text-xs border-b border-black mt-3 mb-1 pb-0.5">{t}</h3>;
}

/** Corte Z / X para impresora térmica (58 u 80 mm) a partir del corte completo */
export function CorteZTicket({ d }: { d: CorteData }) {
  const decl = d.declaracion;
  return (
    <div className="ticket-body font-mono text-black bg-white leading-snug">
      <div className="text-center border-b border-black pb-1 mb-1">
        <h2 className="text-base font-bold uppercase">{d.title}</h2>
        <p className="font-bold">--- {d.openShift ? 'CORTE X (PARCIAL)' : 'CORTE Z'} ---</p>
        <p>{d.shiftLabel}</p>
      </div>
      <R l="Del:" v={fdt(d.from)} />
      <R l="Al:" v={d.openShift ? 'abierto' : fdt(d.to)} />
      <R l="Cajero:" v={d.cajero} />
      <R l="Folios:" v={`${d.folioInicial}-${d.folioFinal}`} />

      <H t="Ventas" />
      <R l="Cuentas:" v={String(d.cuentas)} />
      <R l="Personas:" v={String(d.comensales || '-')} />
      <R l="Subtotal s/IVA:" v={$(d.subtotalSinImp)} />
      <R l="Descuentos:" v={$(d.descuentosSinImp)} />
      <R l="Venta neta:" v={$(d.ventaNeta)} />
      <R l={`IVA ${d.ivaPct}%:`} v={$(d.impuesto)} />
      <R l="VENTA TOTAL:" v={$(d.total)} b />

      <H t="Formas de pago" />
      {d.pagosVentas.map((l) => <R key={l.label} l={`${l.label} (${l.count || 0}):`} v={$(l.amount)} />)}
      {d.propinas > 0 && <R l="Propinas:" v={$(d.propinas)} />}

      <H t="Por area" />
      {d.porArea.map((l) => <R key={l.label} l={`${l.label} (${l.count || 0}):`} v={$(l.amount)} />)}

      <H t="Caja" />
      <R l="+Fondo:" v={$(d.fondo)} />
      <R l="+Efectivo:" v={$(d.cajaEfectivo)} />
      <R l="+Depositos:" v={$(d.depositos)} />
      <R l="-Retiros:" v={$(d.retiros)} />
      <R l="-Propinas pag.:" v={$(d.propinasPagadas)} />
      <R l="EFECTIVO FINAL:" v={$(d.efectivoFinal)} b />
      <R l="Tarjeta:" v={$(d.cajaTarjeta)} />
      {d.cajaTransferencia > 0 && <R l="Transferencia:" v={$(d.cajaTransferencia)} />}
      <R l="SALDO FINAL:" v={$(d.saldoFinal)} b />

      {decl && (
        <>
          <H t="Declaracion cajero" />
          <R l="Efectivo:" v={$(decl.efectivo)} />
          <R l="Tarjeta:" v={$(decl.tarjeta)} />
          {decl.transferencia > 0 && <R l="Transferencia:" v={$(decl.transferencia)} />}
          <R l="TOTAL:" v={$(d.declaradoTotal)} b />
          <R l={d.diferencia >= 0 ? 'SOBRANTE:' : 'FALTANTE:'} v={$(Math.abs(d.diferencia))} b />
        </>
      )}

      {d.porCategoria.length > 0 && (
        <>
          <H t="Por categoria (s/IVA)" />
          {d.porCategoria.map((l) => <R key={l.label} l={`${l.label}:`} v={$(l.amount)} />)}
        </>
      )}

      <H t="Seguridad" />
      <R l="Canceladas:" v={`${d.canceladas.count} ${$(d.canceladas.amount)}`} />
      <R l="Cortesias:" v={`${d.cortesias.count} ${$(d.cortesias.amount)}`} />
      <R l="Descuentos:" v={`${d.descuentos.count} ${$(d.descuentos.amount)}`} />
      <R l="Reimpresiones:" v={String(d.reimpresiones)} />
      <R l="Reaperturas:" v={String(d.reaperturas)} />

      <div className="text-center pt-6 mt-4 border-t border-black border-dotted">
        <p className="mb-6">______________________</p>
        <p className="font-bold text-xs uppercase">Firma del cajero</p>
        <p className="text-[10px] mt-2">Impreso {fdt(new Date())}</p>
      </div>
    </div>
  );
}
