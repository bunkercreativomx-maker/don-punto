import type { ReactNode } from 'react';
import type { CorteData, Line } from '../../lib/corte';
import { money } from '../../lib/format';

const $ = (n: number) => `$${money(n)}`;
const pct = (n?: number) => `${(n || 0).toFixed(2)}%`;
const fdt = (d: Date | string) => new Date(d).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const ft = (d: string) => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`cd-row${strong ? ' cd-strong' : ''}${muted ? ' cd-muted' : ''}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Box({ title, tone = 'dark', children }: { title: string; tone?: 'dark' | 'green'; children: ReactNode }) {
  return (
    <section className="cd-box">
      <h3 className={`cd-h cd-h-${tone}`}>{title}</h3>
      <div className="cd-body">{children}</div>
    </section>
  );
}

function Lines({ lines, empty = 'Sin movimientos', showCount, showPct }: { lines: Line[]; empty?: string; showCount?: boolean; showPct?: boolean }) {
  if (!lines.length) return <div className="cd-empty">{empty}</div>;
  return (
    <>
      {lines.map((l) => (
        <div key={l.label} className="cd-row">
          <span>{showCount && l.count !== undefined ? <b className="cd-qty">{l.count}</b> : null}{l.label.toUpperCase()}</span>
          <span>{$(l.amount)}{showPct ? <em> ({pct(l.pct)})</em> : null}</span>
        </div>
      ))}
    </>
  );
}

/** Corte de caja en hoja carta (pantalla y PDF/impresión) */
export function CorteCaja({ d, branchName, logoUrl }: { d: CorteData; branchName?: string; logoUrl?: string }) {
  const decl = d.declaracion;
  return (
    <div className="corte-doc">
      <header className="cd-top">
        <div className="cd-brand">
          {logoUrl ? <img src={logoUrl} alt="" /> : null}
          <div>
            <div className="cd-biz">{d.title.toUpperCase()}</div>
            <div className="cd-title">REPORTE DE CORTE DE CAJA</div>
          </div>
        </div>
        <div className="cd-meta">
          <div><b>Del:</b> {fdt(d.from)} <b>al:</b> {d.openShift ? 'turno abierto' : fdt(d.to)}</div>
          <div><b>Turno:</b> {d.shiftLabel} &nbsp; <b>Sucursal:</b> {branchName || '—'}</div>
          <div><b>Cajero:</b> {d.cajero}</div>
          <div><b>Impreso:</b> {fdt(new Date())}</div>
        </div>
      </header>

      {d.openShift && <div className="cd-warn">Turno abierto: este reporte es preliminar (corte X). El corte final sale al cerrar la caja.</div>}

      {/* Resumen */}
      <section className="cd-summary">
        <div className="cd-total">
          <span>VENTA TOTAL</span>
          <strong>{$(d.total)}</strong>
          <small>IVA incluido · sin propinas</small>
        </div>
        <div className="cd-kpis">
          <div><span>CUENTAS</span><b>{d.cuentas}</b></div>
          <div><span>CUENTA PROMEDIO</span><b>{$(d.cuentaPromedio)}</b></div>
          <div><span>PERSONAS</span><b>{d.comensales || '—'}</b></div>
          <div><span>PROM. POR PERSONA</span><b>{d.comensales ? $(d.promedioPersona) : '—'}</b></div>
          <div><span>EFECTIVO</span><b>{$(d.efectivo)}</b></div>
          <div><span>TARJETAS</span><b>{$(d.tarjeta)}</b></div>
          <div><span>TRANSFERENCIAS</span><b>{$(d.transferencia)}</b></div>
          <div><span>APPS DE DELIVERY</span><b>{$(d.apps)}</b></div>
        </div>
      </section>

      <div className="cd-cols">
        {/* Columna 1: caja */}
        <div className="cd-col">
          <Box title="CAJA">
            <Row label="+ Fondo inicial" value={$(d.fondo)} />
            <Row label="+ Efectivo" value={$(d.cajaEfectivo)} />
            <Row label="+ Tarjeta" value={$(d.cajaTarjeta)} />
            <Row label="+ Transferencia" value={$(d.cajaTransferencia)} />
            <Row label="+ Depósitos efectivo" value={$(d.depositos)} />
            <Row label="− Retiros efectivo" value={$(d.retiros)} />
            <Row label="− Propinas pagadas" value={$(d.propinasPagadas)} />
            <Row label="SALDO FINAL" value={$(d.saldoFinal)} strong />
            <Row label="EFECTIVO FINAL" value={$(d.efectivoFinal)} strong />
            <p className="cd-note">Efectivo y tarjeta incluyen propinas. Lo cobrado por apps de delivery no entra a la caja.</p>
          </Box>
          <Box title="DECLARACIÓN DE CAJERO">
            {decl ? (
              <>
                <Row label="Efectivo" value={$(decl.efectivo)} />
                <Row label="Tarjeta" value={$(decl.tarjeta)} />
                <Row label="Transferencia" value={$(decl.transferencia)} />
                <Row label="TOTAL" value={$(d.declaradoTotal)} strong />
                <Row label="Sobrante (+)" value={$(Math.max(0, d.diferencia))} />
                <Row label="Faltante (−)" value={$(Math.max(0, -d.diferencia))} />
              </>
            ) : (
              <div className="cd-empty">{d.openShift ? 'Se captura al cerrar el turno' : 'Sin declaración (no se abrió/cerró turno en este periodo)'}</div>
            )}
          </Box>
        </div>

        {/* Columna 2: venta */}
        <div className="cd-col">
          <Box title="VENTA (SIN IMPUESTO) POR CATEGORÍA">
            <Lines lines={d.porCategoria} showCount showPct />
          </Box>
          <Box title="POR TIPO DE SERVICIO">
            <Lines lines={d.porArea} showPct />
            <div className="cd-sep" />
            <Row label="Subtotal" value={$(d.subtotalSinImp)} />
            <Row label="Descuentos" value={$(d.descuentosSinImp)} />
            <Row label="Venta neta" value={$(d.ventaNeta)} strong />
            <Row label={`Impuesto total (IVA ${d.ivaPct}%)`} value={$(d.impuesto)} />
            <Row label="VENTA CON IMP." value={$(d.total)} strong />
          </Box>
        </div>

        {/* Columna 3: personas y productos */}
        <div className="cd-col">
          <Box title="TOP MESEROS / CAJEROS">
            {d.meseros.length ? d.meseros.slice(0, 5).map((m, i) => (
              <div key={m.label} className="cd-row">
                <span><b className="cd-rank">{i + 1}</b>{m.label.toUpperCase()} <em>({m.count})</em></span>
                <span>{$(m.amount)}</span>
              </div>
            )) : <div className="cd-empty">Sin ventas</div>}
          </Box>
          <Box title="PRODUCTOS MÁS VENDIDOS">
            <Lines lines={d.productos.slice(0, 10)} showCount empty="Sin productos" />
          </Box>
        </div>
      </div>

      <div className="cd-strip">
        <span><b>Folio inicial:</b> {d.folioInicial}</span>
        <span><b>Folio final:</b> {d.folioFinal}</span>
        <span><b>Turno:</b> {d.shiftLabel}</span>
      </div>

      <div className="cd-ops">
        <div>
          <Row label="Total de cuentas" value={`${d.cuentas}  ·  ${$(d.total)}`} />
          <Row label="Cuentas canceladas" value={`${d.canceladas.count}  ·  ${$(d.canceladas.amount)}  ·  ${pct(d.canceladas.pct)}`} />
          <Row label="Cortesías" value={`${d.cortesias.count}  ·  ${$(d.cortesias.amount)}`} />
          <Row label="Descuentos a cuenta" value={`${d.descuentos.count}  ·  ${$(d.descuentos.amount)}`} />
        </div>
        <div>
          <Row label="Propinas" value={$(d.propinas)} />
          <Row label="# de personas" value={String(d.comensales || '—')} />
          <Row label="Reimpresión de cuentas" value={String(d.reimpresiones)} />
          <Row label="Reapertura de cuentas" value={String(d.reaperturas)} />
        </div>
      </div>

      <div className="cd-grid4">
        <Box title="FORMAS DE PAGO · VENTAS" tone="green"><Lines lines={d.pagosVentas} /></Box>
        <Box title="FORMAS DE PAGO · PROPINAS" tone="green"><Lines lines={d.pagosPropinas} empty="Sin propinas" /></Box>
        <Box title="VENTAS POR ÁREA" tone="green"><Lines lines={d.porArea} /></Box>
        <Box title="MOVIMIENTOS DE EFECTIVO" tone="green">
          {d.movimientos.length ? d.movimientos.map((m, i) => (
            <div key={i} className="cd-row"><span>{ft(m.date)} {m.type.toUpperCase()}{m.reason ? ` · ${m.reason}` : ''}</span><span>{$(m.amount)}</span></div>
          )) : <div className="cd-empty">Sin retiros ni depósitos</div>}
        </Box>
      </div>

      {d.incidencias.length > 0 && (
        <Box title="EVENTOS DE SEGURIDAD (CANCELACIONES, REAPERTURAS Y CORTESÍAS)">
          {d.incidencias.slice(0, 30).map((e, i) => (
            <div key={i} className="cd-row">
              <span>{ft(e.date)} · <b>{e.type.toUpperCase()}</b>{e.byName ? ` · ${e.byName}` : ''}{e.detail ? ` · ${e.detail.slice(0, 70)}` : ''}</span>
              <span>{$(e.amount)}</span>
            </div>
          ))}
        </Box>
      )}

      <div className="cd-sign">
        <div><span />Firma del cajero</div>
        <div><span />Firma de quien recibe</div>
      </div>
      <footer className="cd-foot">Generado con DonPunto.com · Este reporte no es un comprobante fiscal (CFDI).</footer>
    </div>
  );
}
