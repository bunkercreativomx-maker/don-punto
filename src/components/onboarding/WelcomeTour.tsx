import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { KeyRound, ArrowRight, ArrowLeft, X, Sparkles, CheckCircle2 } from 'lucide-react';
import { storeGet, storeSet } from '../../lib/cloudStore';
import { isPro } from '../../lib/session';

// Tour de bienvenida: cuenta nueva → PIN de dueño → recorrido por cada sección del menú lateral.
// Se marca como visto por usuario (sincronizado), y se puede repetir desde Ajustes.
const DONE_KEY = 'donPuntoTourDone2'; // v2: se muestra una vez a todas las cuentas, también las que ya existían
export function shouldAutoStartTour(): boolean {
  return storeGet(DONE_KEY) !== '1';
}
export function markTourDone() { storeSet(DONE_KEY, '1'); }

type Step =
  | { kind: 'center'; id: string; title: string; body: string }
  | { kind: 'pin'; id: string }
  | { kind: 'spot'; id: string; target: string; title: string; body: string; pro?: boolean };

function buildSteps(): Step[] {
  const pro = isPro();
  const s: Step[] = [
    { kind: 'center', id: 'hola', title: '¡Bienvenido a Don Punto! 👋', body: 'Te enseño en 2 minutos cómo funciona. Primero vamos a proteger tu caja con tu PIN de dueño y luego te muestro cada sección del menú.' },
    { kind: 'pin', id: 'pin' },
    { kind: 'spot', id: 'session', target: 'session', title: 'Entrar y bloquear', body: 'Aquí entras con tu PIN (**Entrar**) para abrir las secciones protegidas, y tocas **Bloquear** cuando te alejes de la caja. También se bloquea sola a los 15 minutos sin uso.' },
    { kind: 'spot', id: 'pos', target: 'pos', title: 'Punto de Venta', body: 'Aquí cobras. Primero **Abrir turno** con tu fondo de caja (sin turno no se puede vender). Elige **TIENDA** o la app de comida a domicilio, toca los productos y **FINALIZAR**. Al terminar el día, **Cerrar turno** te da tu corte.' },
    { kind: 'spot', id: 'online', target: 'online', title: 'Pedidos en línea', body: 'Tu propia página **donpunto.com/tu-tienda** para que te pidan para recoger o a domicilio, sin comisión. Aquí la creas y aquí te llegan los pedidos con timbre.' },
    { kind: 'spot', id: 'tickets', target: 'tickets', title: 'Tickets', body: 'Todas tus ventas cobradas. Busca un ticket para **reimprimirlo** (cliente o cocina) o **REABRIR** una venta para corregirla (pide PIN).' },
    { kind: 'spot', id: 'reports', target: 'reports', title: 'Reportes', body: 'Ventas de hoy, semana, mes y año, IVA y ventas por canal. Aquí también sacas tus cortes **por turno** o **por fechas**.' + (pro ? ' Con tu plan Pro tienes horas pico, platillos estrella y descarga en hoja de cálculo o PDF.' : '') },
    { kind: 'spot', id: 'clients', target: 'clients', title: 'Clientes', pro: true, body: 'Tus clientes frecuentes: visitas, cuánto gastan, quién ya no viene, y **recompensas por visita** (ej. la 10ª con descuento).' },
    { kind: 'spot', id: 'profits', target: 'profits', title: 'Tienda Física', body: 'Tus productos con su **costo** y **precio** de mostrador. Aquí ves cuánto te queda de ganancia y margen en cada platillo. Toca **AGREGAR PRODUCTO** o **ESCANEAR MENÚ** para subir tu menú con una foto.' },
    { kind: 'spot', id: 'pricing', target: 'pricing', title: 'Plataformas', body: 'Calculadora de precios para apps de comida a domicilio: le dices cuánto quieres recibir y te dice a cuánto venderlo en la app, ya con comisión, IVA y retenciones.' },
    { kind: 'spot', id: 'menu', target: 'menu', title: 'Catálogo', body: 'Organiza tu menú: **categorías** (tacos, bebidas…) y **modificadores** (extras, salsas, sin cebolla) con su precio. Así se ven ordenados en el Punto de Venta y en tu página.' },
    { kind: 'spot', id: 'inventory', target: 'inventory', title: 'Inventario', body: 'Tus insumos (tortilla, carne, refresco…), el cierre del día y qué tienes que pedir.' + (pro ? ' Con Pro se descuentan solos al vender y puedes subir la foto de la factura del proveedor.' : '') },
    { kind: 'spot', id: 'engineering', target: 'engineering', title: 'Radar de Menú', body: 'Te dice cuáles platillos son tus **cracks** y cuáles están **rezagados**. Con IA te arma combos y te hace la imagen de promoción para impulsar lo que no se vende.' },
    { kind: 'spot', id: 'recipes', target: 'recipes', title: 'Recetario', body: 'Tus recetas con ingredientes y cuánto te cuesta cada platillo, para que sepas si tu precio deja ganancia.' },
    { kind: 'spot', id: 'financial', target: 'financial', title: 'Financiero', body: 'Solo para el dueño: tus ventas contra tus gastos (renta, luz, nómina, compras) y si en el periodo **ganaste o perdiste**.' },
    { kind: 'spot', id: 'branches', target: 'branches', title: 'Sucursales', pro: true, body: 'Si tienes más de un local: cada uno con sus ventas, corte e inventario, y un reporte de todos juntos.' },
    { kind: 'spot', id: 'team', target: 'team', title: 'Equipo', pro: true, body: 'Da de alta a tus meseros, cajeros y gerentes, cada uno con **su propio PIN**, y ve cuánto vendió cada quien.' },
    { kind: 'spot', id: 'settings', target: 'settings', title: 'Ajustes', body: 'Nombre, teléfono y dirección del negocio (salen en el ticket), tu impresora (58 mm, 80 mm o carta), tu PIN, qué puede ver la caja sin PIN y las **notificaciones** al celular.' },
    { kind: 'spot', id: 'help', target: 'help', title: 'Ayuda', body: '¿Dudas? Aquí te contesta el asistente al instante y, si hace falta, una persona del equipo de Don Punto. Puedes repetir este tour desde **Ajustes**.' },
    { kind: 'spot', id: 'plan', target: 'plan', title: 'Mi plan', body: 'Cambia de plan, actualiza tu tarjeta o revisa tus pagos.' },
    { kind: 'center', id: 'fin', title: '¡Listo! 🎉', body: 'Tu primer paso: sube tus productos en **Tienda Física** (con **ESCANEAR MENÚ** lo haces con una foto de tu menú). Luego pon el nombre de tu negocio en **Ajustes** y abre tu primer turno en el **Punto de Venta**.' },
  ];
  return s;
}

function rich(t: string) {
  return t.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i} className="text-carbon-950">{p.slice(2, -2)}</strong> : p));
}

interface Props {
  ownerPin: string;
  onSavePin: (pin: string) => void;
  onClose: () => void;
  onFinish: () => void;
}

export function WelcomeTour({ ownerPin, onSavePin, onClose, onFinish }: Props) {
  const steps = useMemo(buildSteps, []);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinSaved, setPinSaved] = useState((ownerPin || '1234') !== '1234');
  const [vw, setVw] = useState(window.innerWidth);
  const step = steps[i];

  const close = () => { markTourDone(); onClose(); };
  const next = () => (i < steps.length - 1 ? setI(i + 1) : (markTourDone(), onFinish()));
  const back = () => setI(Math.max(0, i - 1));

  // Ubica el botón que se está explicando
  useLayoutEffect(() => {
    if (step.kind !== 'spot') { setRect(null); return; }
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    const t = setTimeout(update, 120);
    return () => clearTimeout(t);
  }, [step]);
  useEffect(() => {
    const on = () => {
      setVw(window.innerWidth);
      if (step.kind === 'spot') {
        const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
        if (el) setRect(el.getBoundingClientRect());
      }
    };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePin = () => {
    if (!/^\d{4}$/.test(pin)) return setPinErr('Tu PIN debe tener 4 números.');
    if (pin === '1234') return setPinErr('Usa uno distinto de 1234 (es el de fábrica).');
    if (pin !== pin2) return setPinErr('Los dos PIN no coinciden.');
    onSavePin(pin);
    setPinSaved(true);
    setPinErr('');
    setTimeout(next, 700);
  };

  const progress = (
    <div className="flex items-center justify-between text-[11px] text-carbon-400 font-semibold">
      <span>{i + 1} de {steps.length}</span>
      <button onClick={close} className="hover:text-carbon-700">Saltar tour</button>
    </div>
  );
  const nav = (label = 'Siguiente') => (
    <div className="flex gap-2 pt-1">
      {i > 0 && <button onClick={back} className="px-3 py-2.5 rounded-xl text-sm font-bold text-carbon-600 hover:bg-carbon-100 inline-flex items-center gap-1"><ArrowLeft size={15} /> Atrás</button>}
      <button onClick={next} className="flex-1 rounded-xl bg-agave-600 hover:bg-agave-700 text-white text-sm font-black py-2.5 inline-flex items-center justify-center gap-1.5">{label} <ArrowRight size={15} /></button>
    </div>
  );

  // Tarjeta junto al botón resaltado (o abajo en pantallas muy angostas)
  let cardStyle: React.CSSProperties = {};
  if (step.kind === 'spot' && rect) {
    const w = Math.min(340, vw - rect.right - 24);
    if (w >= 240) {
      const top = Math.min(Math.max(12, rect.top + rect.height / 2 - 120), window.innerHeight - 300);
      cardStyle = { left: rect.right + 14, top, width: w };
    } else {
      cardStyle = { left: 12, right: 12, bottom: 12 };
    }
  }

  return (
    <div className="fixed inset-0 z-[160] no-print" aria-modal="true" role="dialog">
      {/* Fondo oscuro con hueco sobre el botón */}
      {step.kind === 'spot' && rect ? (
        <div
          className="fixed rounded-xl ring-2 ring-maiz-400 transition-all duration-300 pointer-events-none"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, boxShadow: '0 0 0 9999px rgba(13,16,14,0.62)' }}
        />
      ) : (
        <div className="fixed inset-0 bg-carbon-950/60 backdrop-blur-[2px]" />
      )}
      {/* Bloquea clics fuera de la tarjeta */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      {step.kind === 'spot' && (
        <div className="fixed bg-white rounded-2xl shadow-2xl border border-carbon-950/10 p-4 space-y-2.5" style={rect ? cardStyle : { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(360px, calc(100vw - 24px))' }}>
          {progress}
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-carbon-950">{step.title}</h3>
            {step.pro && <span className="text-[9px] font-black uppercase tracking-wider rounded-full bg-maiz-100 text-maiz-800 px-1.5 py-0.5">Plan Pro</span>}
          </div>
          <p className="text-sm text-carbon-600 leading-relaxed">{rich(step.body)}</p>
          {nav()}
        </div>
      )}

      {step.kind === 'center' && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,calc(100vw-24px))] bg-white rounded-3xl shadow-2xl p-6 space-y-3">
          {progress}
          <div className="h-12 w-12 rounded-2xl bg-agave-50 text-agave-700 flex items-center justify-center">{step.id === 'fin' ? <CheckCircle2 size={26} /> : <Sparkles size={26} />}</div>
          <h3 className="text-xl font-black text-carbon-950">{step.title}</h3>
          <p className="text-sm text-carbon-600 leading-relaxed">{rich(step.body)}</p>
          {nav(step.id === 'hola' ? 'Empezar' : step.id === 'fin' ? 'Terminar' : 'Siguiente')}
        </div>
      )}

      {step.kind === 'pin' && (
        <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,calc(100vw-24px))] bg-white rounded-3xl shadow-2xl p-6 space-y-3">
          {progress}
          <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center"><KeyRound size={26} /></div>
          <h3 className="text-xl font-black text-carbon-950">Tu PIN de dueño</h3>
          <p className="text-sm text-carbon-600 leading-relaxed">
            Con este PIN entras a todo: reportes, dinero y ajustes. Tu caja puede cobrar sin él, pero <strong className="text-carbon-950">nadie podrá ver tus números ni borrar ventas</strong> sin tu permiso. Hoy tienes el de fábrica (<strong className="text-carbon-950">1234</strong>): cámbialo.
          </p>
          {pinSaved ? (
            <div className="rounded-2xl bg-emerald-50 text-emerald-700 px-4 py-3 text-sm font-bold flex items-center gap-2"><CheckCircle2 size={18} /> PIN guardado. No se lo des a tus empleados.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" placeholder="Nuevo PIN" autoFocus className="rounded-xl border-2 border-carbon-950/10 px-3 py-3 text-center text-lg font-black tracking-[0.4em] outline-none focus:border-agave-500" />
                <input value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={(e) => e.key === 'Enter' && savePin()} inputMode="numeric" type="password" placeholder="Repítelo" className="rounded-xl border-2 border-carbon-950/10 px-3 py-3 text-center text-lg font-black tracking-[0.4em] outline-none focus:border-agave-500" />
              </div>
              {pinErr && <div className="text-xs font-semibold text-rose-600">{pinErr}</div>}
              <p className="text-[11px] text-carbon-400">4 números. Lo puedes cambiar después en Ajustes → Seguridad Antifraude.</p>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={back} className="px-3 py-2.5 rounded-xl text-sm font-bold text-carbon-600 hover:bg-carbon-100 inline-flex items-center gap-1"><ArrowLeft size={15} /> Atrás</button>
            {pinSaved ? (
              <button onClick={next} className="flex-1 rounded-xl bg-agave-600 hover:bg-agave-700 text-white text-sm font-black py-2.5 inline-flex items-center justify-center gap-1.5">Siguiente <ArrowRight size={15} /></button>
            ) : (
              <>
                <button onClick={next} className="px-3 py-2.5 rounded-xl text-xs font-bold text-carbon-500 hover:bg-carbon-100">Después</button>
                <button onClick={savePin} className="flex-1 rounded-xl bg-agave-600 hover:bg-agave-700 text-white text-sm font-black py-2.5">Guardar PIN</button>
              </>
            )}
          </div>
        </div>
      )}

      <button onClick={close} className="fixed top-3 right-3 h-9 w-9 rounded-full bg-white/90 text-carbon-700 flex items-center justify-center shadow" aria-label="Cerrar tour"><X size={18} /></button>
    </div>
  );
}
