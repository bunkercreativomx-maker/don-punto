import { useMemo, useState, type ReactNode } from 'react';
import { LockKeyhole, Store, UserCog, PackageCheck, HeartHandshake, BarChart3, FileScan,
  Check, ChevronDown, Receipt, Calculator, Wallet, Boxes, ChefHat, ScanLine, WifiOff, BellRing,
  Smartphone, MessageCircle, Mail, ArrowRight, ShieldCheck, Globe, Bike, Banknote,
} from 'lucide-react';
import { Logo, Mark, Wordmark } from '../brand/Logo';
import { InstallAppButton } from '../pwa/InstallApp';
import { whatsappLink, supportLink, SUPPORT_EMAIL } from '../../config';

interface LandingPageProps {
  onLogin: () => void;
  onSubscribe: () => void;
}

const mxn = (n: number, dec = 0) =>
  '$' + n.toLocaleString('es-MX', { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Mismas reglas que la calculadora de la app: comisión + IVA de la comisión + retenciones SAT */
function platformMath(price: number, commission: number, withRFC: boolean) {
  const ret = withRFC ? 0.08 + 0.025 : 0.16 + 0.2;
  const factor = 1 - commission * 1.16 - ret / 1.16;
  const charge = factor > 0 ? Math.ceil(price / factor) : 0;
  const keepIfSame = price * factor;
  return {
    charge,
    keepIfSame,
    commissionCut: price * commission,
    ivaCommissionCut: price * commission * 0.16,
    retentionsCut: (price / 1.16) * ret,
  };
}

/* ------------------------------------------------------------------ ticket interactivo */
function TicketCalculator({ onStart }: { onStart: () => void }) {
  const [price, setPrice] = useState(100);
  const [commission, setCommission] = useState(30);
  const [rfc, setRfc] = useState(true);
  const m = useMemo(() => platformMath(price || 0, commission / 100, rfc), [price, commission, rfc]);

  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div className="absolute -inset-6 rounded-[2.5rem] bg-agave-500/10 blur-2xl" aria-hidden="true" />
      <div className="relative rounded-t-2xl bg-white shadow-[0_30px_80px_-30px_rgba(4,33,26,0.45),0_2px_6px_rgba(4,33,26,0.06)] ring-1 ring-carbon-200/70">
        <div className="px-7 pt-7 pb-5 border-b border-dashed border-carbon-300">
          <div className="flex items-center justify-between">
            <Wordmark tone="light" height={18} />
            <span className="font-mono text-[11px] text-carbon-500">Calculadora de apps</span>
          </div>
          <label className="mt-6 block">
            <span className="text-sm text-carbon-600">Tu platillo cuesta en mostrador</span>
            <div className="mt-2 flex items-center rounded-xl bg-carbon-50 ring-1 ring-carbon-200 focus-within:ring-2 focus-within:ring-agave-500 px-4">
              <span className="font-display text-3xl font-bold text-carbon-400">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                max={99999}
                value={price || ''}
                onChange={(e) => setPrice(Math.max(0, Math.min(99999, Number(e.target.value))))}
                className="w-full bg-transparent px-2 py-3 font-display text-3xl font-bold text-carbon-950 outline-none tabular-nums"
                aria-label="Precio en mostrador"
              />
            </div>
          </label>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <label className="text-sm text-carbon-600" htmlFor="comision">Comisión de la app <b className="text-carbon-900 tabular-nums">{commission}%</b></label>
            <div role="group" aria-label="¿Tienes RFC registrado en la app?" className="inline-flex rounded-full bg-carbon-100 p-0.5 text-xs font-medium">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  onClick={() => setRfc(v)}
                  aria-pressed={rfc === v}
                  className={`rounded-full px-3 py-1 transition-colors ${rfc === v ? 'bg-white text-carbon-900 shadow-sm' : 'text-carbon-500 hover:text-carbon-800'}`}
                >
                  {v ? 'Con RFC' : 'Sin RFC'}
                </button>
              ))}
            </div>
          </div>
          <input
            id="comision"
            type="range"
            min={10}
            max={40}
            value={commission}
            onChange={(e) => setCommission(Number(e.target.value))}
            className="mt-4 h-6 w-full accent-[#16895F]"
          />
        </div>

        <div className="px-7 py-5 font-mono text-[13px] text-carbon-600 space-y-1.5">
          <p className="text-carbon-500">Si lo subes igual a la app:</p>
          <Row label="Precio en la app" value={mxn(price || 0, 2)} />
          <Row label={`Comisión ${commission}%`} value={'-' + mxn(m.commissionCut, 2)} />
          <Row label="IVA de la comisión" value={'-' + mxn(m.ivaCommissionCut, 2)} />
          <Row label="Retenciones SAT" value={'-' + mxn(m.retentionsCut, 2)} />
          <div className="border-t border-dashed border-carbon-300 pt-2 mt-2">
            <Row label="Te llega" value={mxn(m.keepIfSame, 2)} strong tone="loss" />
          </div>
        </div>

        <div className="mx-4 mb-4 rounded-xl bg-agave-950 px-5 py-4 text-white">
          <p className="text-sm text-agave-200">Para que te lleguen tus {mxn(price || 0)}, súbelo a</p>
          <p key={m.charge} className="ticket-pop font-display text-5xl font-bold tracking-tight tabular-nums mt-1">
            {mxn(m.charge)}
            <span className="text-maiz-400">.</span>
          </p>
        </div>
        <div className="px-6 pb-6">
          <button onClick={onStart} className="w-full rounded-xl py-3 font-semibold text-agave-700 ring-1 ring-agave-200 hover:bg-agave-50 transition-colors">
            Calcular todo mi menú
          </button>
        </div>
      </div>
      {/* borde de ticket rasgado */}
      <div
        aria-hidden="true"
        className="relative h-3 w-full"
        style={{
          background:
            'linear-gradient(-45deg, transparent 8px, #fff 0) 0 0 / 16px 16px repeat-x, linear-gradient(45deg, transparent 8px, #fff 0) 0 0 / 16px 16px repeat-x',
          filter: 'drop-shadow(0 6px 6px rgba(4,33,26,0.08))',
        }}
      />
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'loss' }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={strong ? 'text-carbon-900 font-semibold' : ''}>{label}</span>
      <span className={(strong ? 'font-semibold text-base ' : '') + (tone === 'loss' ? 'text-[#C2410C]' : 'text-carbon-900') + ' tabular-nums'}>{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ piezas */
function Section({ id, className = '', children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`px-5 sm:px-8 ${className}`}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Shot({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`rounded-[1.4rem] bg-carbon-900 p-1.5 ring-1 ring-black/10 shadow-[0_40px_80px_-40px_rgba(4,33,26,0.55)] ${className}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" className="block w-full rounded-[1.1rem]" />
    </div>
  );
}

const FAQS = [
  { q: '¿Cómo funciona la prueba gratis?', a: 'Tienes 15 días gratis con todo tu plan. Registras tu tarjeta al empezar, pero no se cobra nada hasta el día 16. Te avisamos al celular 3 días antes; si cancelas antes, no pagas nada.' },
  { q: '¿La tienda en línea cobra comisión?', a: 'No. Está incluida en tu plan. Tus clientes te pagan directo: efectivo al recoger o transferencia CoDi a tu cuenta. Don Punto no se queda con ningún porcentaje de tus pedidos.' },
  { q: '¿Tengo que firmar contrato?', a: 'No. Pagas mes a mes y cancelas cuando quieras desde "Mi plan" dentro de tu cuenta. No hay penalizaciones.' },
  { q: '¿Necesito comprar equipo?', a: 'No. Funciona en la computadora, tablet o celular que ya tienes. Puedes instalarla como app y abrirla desde tu pantalla de inicio.' },
  { q: '¿Qué pasa si se va el internet?', a: 'Sigues cobrando en el mismo equipo. Cuando regresa la conexión, tus ventas se respaldan solas en la nube.' },
  { q: '¿Qué impresoras sirven?', a: 'Cualquier impresora instalada en tu equipo: térmica de ticket de 58 mm o impresora normal tamaño carta.' },
  { q: '¿Emite facturas (CFDI)?', a: 'No. Don Punto te separa el IVA de cada venta y te ayuda con tus números, pero no timbra facturas.' },
  { q: '¿Cómo pago?', a: 'Con tarjeta de débito o crédito; el cobro lo procesa Stripe. Si prefieres transferencia, escríbenos.' },
];

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Wallet strokeWidth={1.6} />, title: 'Corte de caja que sí cuadra', text: 'Efectivo, tarjeta y apps por separado. Sabes cuánto efectivo debe haber en el cajón antes de contarlo.' },
  { icon: <Receipt strokeWidth={1.6} />, title: 'IVA separado en cada venta', text: 'Ves qué parte es tuya y qué parte es del SAT, en 16% o en 8% de zona fronteriza.' },
  { icon: <ChefHat strokeWidth={1.6} />, title: 'Inventario y recetas con costo real', text: 'Arma la receta de cada platillo, conoce su costo y su margen, y lleva lo que compras y lo que te queda.' },
  { icon: <LockKeyhole strokeWidth={1.6} />, title: 'Tus números bajo llave', text: 'La caja solo ve el punto de venta. Reportes, ganancias y ajustes piden el PIN del dueño.' },
  { icon: <ScanLine strokeWidth={1.6} />, title: 'Tu menú desde una foto', text: 'Tómale foto a tu menú impreso y la IA lo convierte en productos con precio.' },
  { icon: <WifiOff strokeWidth={1.6} />, title: 'Funciona sin internet', text: 'Si se cae la red sigues vendiendo. Todo se sube a la nube cuando vuelve la conexión.' },
];

/* ------------------------------------------------------------------ página */
export function LandingPage({ onLogin, onSubscribe }: LandingPageProps) {
  const whatsapp = whatsappLink('Hola, quiero información de Don Punto.');
  const contact = supportLink('Hola, quiero información de Don Punto.');
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="min-h-[100dvh] bg-[#FAFAF7] text-carbon-950 overflow-x-hidden selection:bg-maiz-200">
      {/* Encabezado */}
      <header className="sticky top-0 z-40 border-b border-carbon-200/60 bg-[#FAFAF7]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          <a href="#inicio" aria-label="Don Punto, inicio" className="shrink-0"><Logo size={32} className="sm:hidden" /><Logo size={44} className="hidden sm:block" /></a>
          <nav className="hidden md:flex items-center gap-8 text-sm text-carbon-600">
            <a href="#tienda-en-linea" className="hover:text-carbon-950">Tienda en línea</a>
            <a href="#como-funciona" className="hover:text-carbon-950">Cómo funciona</a>
            <a href="#precios" className="hover:text-carbon-950">Precios</a>
            <a href="#preguntas" className="hover:text-carbon-950">Preguntas</a>
            <a href="/blog" className="hover:text-carbon-950">Blog</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <button onClick={onLogin} className="whitespace-nowrap rounded-full px-2.5 sm:px-4 py-2 text-[13px] sm:text-sm font-medium text-carbon-700 hover:bg-carbon-100">
              Entrar
            </button>
            <button onClick={onSubscribe} className="whitespace-nowrap rounded-full bg-agave-600 hover:bg-agave-700 px-3.5 sm:px-5 py-2 text-[13px] sm:text-sm font-semibold text-white transition-colors">
              Crear cuenta
            </button>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* Hero */}
        <Section className="pt-12 pb-20 sm:pt-20 sm:pb-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="hero-in">
              <p className="inline-flex items-center gap-2 rounded-full bg-agave-50 px-3 py-1 text-sm text-agave-700 ring-1 ring-agave-100">
                <span className="h-1.5 w-1.5 rounded-full bg-maiz-400" /> Punto de venta para restaurantes en México
              </p>
              <h1 className="mt-6 font-display text-[2.35rem] leading-[1.04] sm:text-6xl lg:text-[4.4rem] font-bold tracking-[-0.035em] text-carbon-950">
                Vende en apps sin regalar tu ganancia<span className="text-maiz-500">.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg sm:text-xl leading-relaxed text-carbon-600">
                Cobra en mostrador, recibe pedidos en tu propia tienda en línea, cuadra tu caja y pon el precio correcto en cada plataforma de delivery. Todo desde el celular, la tablet o la compu que ya tienes.
              </p>
              <div className="mt-9 flex flex-col sm:flex-row gap-3">
                <button onClick={onSubscribe} className="group inline-flex items-center justify-center gap-3 rounded-full bg-agave-600 hover:bg-agave-700 pl-7 pr-2 py-2 text-base font-semibold text-white transition-colors">
                  Crear mi cuenta
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                    <ArrowRight size={18} />
                  </span>
                </button>
                <a href="#precios" className="inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-carbon-800 ring-1 ring-carbon-300 hover:bg-white">
                  Ver precios
                </a>
              </div>
              <ul className="mt-8 flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-2 text-sm text-carbon-600">
                {['15 días gratis', 'Luego desde $350 al mes', 'Sin contratos'].map((t) => (
                  <li key={t} className="flex items-center gap-2"><Check size={16} className="text-agave-500" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="hero-in hero-in-late">
              <TicketCalculator onStart={onSubscribe} />
            </div>
          </div>
        </Section>

        {/* El problema, con números */}
        <section className="bg-agave-950 text-white">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid gap-12 lg:grid-cols-[1fr_1fr] items-end">
            <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">
              Un platillo de $100 en una app de reparto te deja <span className="text-maiz-400">$56</span>.
            </h2>
            <div className="space-y-5 text-lg text-agave-100/90 leading-relaxed">
              <p>
                La comisión de 30%, el IVA de esa comisión y las retenciones del SAT se llevan casi la mitad. Si pones el mismo precio que en tu mostrador, vendes más y ganas menos.
              </p>
              <p>
                Don Punto calcula el precio exacto de cada platillo en cada app para que te llegue lo que quieres ganar, y te lo vuelve a calcular cuando cambias un costo.
              </p>
            </div>
          </div>
        </section>

        {/* Tienda en línea */}
        <Section id="tienda-en-linea" className="pt-24 sm:pt-32">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full bg-maiz-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-800">Nuevo · incluido en todos los planes</p>
              <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">
                Tu propia tienda en línea. <span className="text-agave-600">Cero comisión por pedido.</span>
              </h2>
              <p className="mt-5 text-lg text-carbon-600 leading-relaxed">
                Tus clientes de siempre te piden directo desde <b className="font-semibold text-carbon-900 whitespace-nowrap">donpunto.com/tu-negocio</b>, con tu menú, tus fotos y tus precios. El dinero llega completo a ti, no a una plataforma de reparto.
              </p>
              <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
                {[
                  { icon: <Globe strokeWidth={1.6} />, t: 'Lista en minutos', d: 'Se arma sola con el menú que ya tienes en tu caja. Agrega fotos, marca lo agotado y comparte tu enlace.' },
                  { icon: <Bike strokeWidth={1.6} />, t: 'Para recoger o a domicilio', d: 'Tú decides hasta cuántos kilómetros entregas y cuánto cobras de envío. El cliente confirma su ubicación.' },
                  { icon: <Banknote strokeWidth={1.6} />, t: 'Cobras directo', d: 'Efectivo al recoger o transferencia CoDi a tu cuenta. Sin intermediarios ni porcentajes por venta.' },
                  { icon: <BellRing strokeWidth={1.6} />, t: 'Te suena cada pedido', d: 'Aviso en el celular y en la caja. Aceptas, tu cliente ve el avance y la venta cae sola en tu corte.' },
                ].map((f) => (
                  <div key={f.t}>
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</div>
                    <h3 className="mt-4 text-lg font-semibold">{f.t}</h3>
                    <p className="mt-1.5 text-carbon-600 leading-relaxed">{f.d}</p>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col sm:flex-row gap-3">
                <button onClick={onSubscribe} className="rounded-full bg-agave-600 hover:bg-agave-700 px-7 py-3.5 font-semibold text-white transition-colors">Quiero mi tienda en línea</button>
                <a href="/donchuy" target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold text-carbon-800 ring-1 ring-carbon-300 hover:bg-white">Ver tienda de ejemplo <ArrowRight size={16} /></a>
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-[320px]">
              <div className="absolute -inset-8 rounded-[3rem] bg-maiz-300/25 blur-2xl" aria-hidden="true" />
              <div className="relative rounded-[2.6rem] bg-carbon-950 p-2.5 shadow-[0_40px_80px_-30px_rgba(4,33,26,0.6)] ring-1 ring-black/20">
                <img src="/screens/store.webp" alt="Tienda en línea de una taquería hecha con Don Punto: menú con fotos, recoger o a domicilio" loading="lazy" decoding="async" className="block w-full rounded-[2.1rem]" />
              </div>
              <div className="absolute -left-6 sm:-left-14 bottom-16 w-60 rounded-2xl bg-white p-4 shadow-[0_20px_50px_-20px_rgba(4,33,26,0.45)] ring-1 ring-carbon-200/70">
                <p className="text-xs font-semibold uppercase tracking-wider text-agave-600">Pedido nuevo</p>
                <p className="mt-1 font-semibold text-carbon-950">3 al pastor + horchata</p>
                <p className="text-sm text-carbon-500">A domicilio · $135 · comisión $0</p>
              </div>
            </div>
          </div>
        </Section>

        {/* Producto */}
        <Section id="como-funciona" className="py-24 sm:py-32">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.05]">Todo tu negocio en una sola pantalla</h2>
            <p className="mt-5 text-lg text-carbon-600 leading-relaxed">Hecho para la hora pico: botones grandes, cobro en dos toques y tickets para cliente y cocina.</p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Shot src="/screens/pos.webp" alt="Pantalla de cobro de Don Punto con el menú y la orden actual" />
            </div>
            <div className="lg:col-span-4 flex flex-col justify-between gap-6 rounded-[1.4rem] bg-white p-8 ring-1 ring-carbon-200/70">
              <div>
                <Calculator className="text-agave-600" strokeWidth={1.6} />
                <h3 className="mt-5 font-display text-2xl font-bold tracking-tight">Cobra rápido, sin errores</h3>
                <p className="mt-3 text-carbon-600 leading-relaxed">
                  Extras y modificadores (sin cebolla, extra queso), cuentas abiertas por mesa o cliente, descuentos con tu PIN y cobro mixto en efectivo y tarjeta.
                </p>
              </div>
              <ul className="space-y-2.5 text-sm text-carbon-700">
                {['Ticket de cliente y comanda de cocina', 'Mostrador y cada plataforma de delivery por separado', 'Candado con PIN para borrar o descontar'].map((t) => (
                  <li key={t} className="flex gap-2.5"><Check size={18} className="text-agave-500 shrink-0" /> {t}</li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-5 rounded-[1.4rem] bg-white p-8 ring-1 ring-carbon-200/70">
              <h3 className="font-display text-2xl font-bold tracking-tight">Precios por app, platillo por platillo</h3>
              <p className="mt-3 text-carbon-600 leading-relaxed">Pones tu costo y lo que quieres recibir; Don Punto te dice a cuánto subirlo en cada plataforma.</p>
              <Shot src="/screens/pricing.webp" alt="Tabla de precios por plataforma" className="mt-6" />
            </div>
            <div className="lg:col-span-7 rounded-[1.4rem] bg-white p-8 ring-1 ring-carbon-200/70">
              <h3 className="font-display text-2xl font-bold tracking-tight">Reportes que entiendes en 10 segundos</h3>
              <p className="mt-3 text-carbon-600 leading-relaxed">Ventas de hoy, la semana y el mes, por canal y con el IVA ya separado. Imprime tu corte Z al cerrar.</p>
              <Shot src="/screens/reports.webp" alt="Reporte de ventas por canal" className="mt-6" />
            </div>
          </div>

          <div className="mt-20 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-carbon-600 leading-relaxed">{f.text}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* App instalable + notificaciones */}
        <Section className="pb-24 sm:pb-32">
          <div className="grid overflow-hidden rounded-[2rem] bg-carbon-950 text-white lg:grid-cols-2">
            <div className="p-10 sm:p-14">
              <Smartphone className="text-maiz-400" strokeWidth={1.6} />
              <h2 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em]">Instálala como app. Recibe tu cierre del día en el celular.</h2>
              <p className="mt-5 text-lg text-carbon-300 leading-relaxed">
                Don Punto se instala en cualquier celular, tablet o computadora sin pasar por ninguna tienda de apps. Cada noche te llega una notificación con lo que vendiste, aunque no estés en el negocio.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={onSubscribe} className="rounded-full bg-maiz-400 hover:bg-maiz-300 px-6 py-3 font-semibold text-carbon-950 transition-colors">Empezar ahora</button>
                <InstallAppButton className="rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/20 hover:bg-white/5" />
              </div>
            </div>
            <div className="relative flex items-center justify-center p-10 sm:p-14 bg-[radial-gradient(120%_80%_at_70%_20%,rgba(22,137,95,0.35),transparent_60%)]">
              <div className="w-full max-w-sm space-y-3">
                <Notification time="10:02 p.m." title="Cierre de hoy: $8,940" body="63 ventas · ticket promedio $142. Toca para ver tu reporte." />
                <Notification time="Ayer" title="Cierre de hoy: $7,310" body="51 ventas · ticket promedio $143." muted />
                <Notification time="Lunes" title="Tu membresía está activa" body="Gracias por tu pago. Don Punto ya está listo para cobrar." muted />
              </div>
            </div>
          </div>
        </Section>

        {/* Plan Pro */}
        <Section className="pb-24 sm:pb-32">
          <div className="rounded-[2rem] bg-gradient-to-br from-maiz-50 via-white to-agave-50 ring-1 ring-carbon-200/70 p-8 sm:p-14">
            <span className="inline-flex rounded-full bg-maiz-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-800">Plan Pro</span>
            <h2 className="mt-5 max-w-2xl font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">Para cuando ya tienes equipo, más de un local y quieres crecer.</h2>
            <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { icon: <Store strokeWidth={1.6} />, t: 'Varias sucursales', d: 'Cada local cobra con su caja, su corte y su inventario. Tú ves todas juntas: cuál vende más y cuál va para abajo.' },
                { icon: <UserCog strokeWidth={1.6} />, t: 'Cada empleado con su PIN', d: 'Sabes quién cobró, quién hizo descuentos y quién canceló tickets. Cajeros y gerentes con permisos distintos.' },
                { icon: <PackageCheck strokeWidth={1.6} />, t: 'Inventario que se descuenta solo', d: 'Al vender un platillo se restan los insumos de su receta. Te llega un aviso al celular cuando algo se está acabando.' },
                { icon: <HeartHandshake strokeWidth={1.6} />, t: 'Clientes que regresan', d: 'Guarda a tus clientes con su WhatsApp, mira lo que compran y prémialos: "tu orden 10 va por la casa".' },
                { icon: <BarChart3 strokeWidth={1.6} />, t: 'Reportes avanzados', d: 'Esta semana contra la pasada, horas pico, mejores días y platillos estrella. Descarga en hoja de cálculo o PDF.' },
                { icon: <FileScan strokeWidth={1.6} />, t: 'Facturas leídas con IA', d: 'Tómale foto a la factura del proveedor y las compras se capturan solas en tu inventario.' },
              ].map((f) => (
                <div key={f.t}>
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-agave-700 ring-1 ring-carbon-200 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</div>
                  <h3 className="mt-5 text-lg font-semibold">{f.t}</h3>
                  <p className="mt-2 text-carbon-600 leading-relaxed">{f.d}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Cómo empiezas */}
        <Section className="pb-24 sm:pb-32">
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em]">Empiezas hoy mismo</h2>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {[
              ['Crea tu cuenta', 'Tu correo y el nombre de tu negocio. Eliges tu plan y listo.'],
              ['Sube tu menú', 'Captúralo, impórtalo desde una hoja de cálculo o tómale foto y la IA lo digitaliza.'],
              ['Cobra y cuadra', 'Vende en mostrador y apps, imprime tickets y haz tu corte con el IVA ya separado.'],
            ].map(([t, d], i) => (
              <li key={t} className="border-t-2 border-carbon-950 pt-6">
                <span className="font-display text-5xl font-bold text-agave-600 tabular-nums">{i + 1}</span>
                <h3 className="mt-4 text-xl font-semibold">{t}</h3>
                <p className="mt-2 text-carbon-600 leading-relaxed">{d}</p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Precios */}
        <section id="precios" className="bg-white border-y border-carbon-200/70">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-24 sm:py-32">
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em]">Precio claro, sin contratos</h2>
              <p className="mt-5 text-lg text-carbon-600">Pruébalo 15 días gratis. Después pagas mes a mes en pesos y cancelas desde tu cuenta cuando quieras.</p>
            </div>
            <div className="mt-14 grid gap-6 lg:grid-cols-2 max-w-4xl">
              <Plan
                name="Básico"
                price={350}
                text="Para un negocio con una sucursal que quiere orden y vender más."
                items={['1 sucursal, ventas ilimitadas', 'Tienda en línea propia, sin comisión por pedido', 'Calculadora de precios para apps de delivery', 'Tu menú desde una foto con IA', 'Combos sugeridos para mover tus platillos', 'Corte de caja con IVA, inventario y recetario', 'Reportes y ganancias protegidos con PIN', 'Respaldo en la nube y app instalable']}
                cta="Prueba 15 días gratis"
                note="Luego $350 al mes. Cancela cuando quieras."
                onClick={onSubscribe}
              />
              <Plan
                featured
                name="Pro"
                price={799}
                text="Para negocios con equipo, varias sucursales y ganas de crecer."
                items={['Todo lo del plan Básico, incluida la tienda en línea', 'Varias sucursales con reporte de todas juntas', 'Empleados con su propio PIN y reporte por cajero', 'Inventario que se descuenta solo y avisos al celular', 'Clientes frecuentes y recompensas por visita', 'Reportes avanzados con hoja de cálculo y PDF', 'Facturas de proveedor leídas con IA', 'Soporte prioritario por WhatsApp']}
                cta="Elegir Pro"
                onClick={onSubscribe}
              />
            </div>
            <p className="mt-8 flex items-center justify-center lg:justify-start max-w-4xl gap-2 text-sm text-carbon-500"><ShieldCheck size={16} className="text-agave-500" /> Pago seguro con tarjeta procesado por Stripe. <a href="/privacidad" className="underline underline-offset-4 hover:text-carbon-800">Aviso de Privacidad</a> · <a href="/terminos" className="underline underline-offset-4 hover:text-carbon-800">Términos</a></p>
          </div>
        </section>

        {/* Preguntas */}
        <Section id="preguntas" className="py-24 sm:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em]">Preguntas frecuentes</h2>
              {contact && (
                <p className="mt-5 text-carbon-600">
                  ¿Otra duda? <a href={contact} className="font-semibold text-agave-700 underline underline-offset-4">Escríbenos</a>.
                </p>
              )}
            </div>
            <div className="divide-y divide-carbon-200 border-y border-carbon-200">
              {FAQS.map((f, i) => (
                <div key={f.q}>
                  <button
                    onClick={() => setOpen(open === i ? null : i)}
                    aria-expanded={open === i}
                    className="flex w-full items-center justify-between gap-6 py-5 text-left text-lg font-semibold"
                  >
                    {f.q}
                    <ChevronDown size={20} className={`shrink-0 text-carbon-400 transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${open === i ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'}`}>
                    <p className="overflow-hidden text-carbon-600 leading-relaxed">{f.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Cierre */}
        <Section className="pb-24 sm:pb-32">
          <div className="relative overflow-hidden rounded-[2rem] bg-agave-600 px-8 py-16 sm:px-16 sm:py-20 text-white">
            <div aria-hidden="true" className="absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-maiz-400/90" />
            <div className="relative max-w-2xl">
              <Mark size={64} />
              <h2 className="mt-8 font-display text-4xl sm:text-6xl font-bold leading-[1.02] tracking-[-0.035em]">Deja de adivinar cuánto ganas.</h2>
              <p className="mt-5 text-lg text-agave-100">Crea tu cuenta en un minuto y cobra tu primera venta hoy.</p>
              <button onClick={onSubscribe} className="mt-9 rounded-full bg-white px-8 py-4 text-base font-semibold text-agave-800 hover:bg-agave-50 transition-colors">
                Crear mi cuenta
              </button>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t border-carbon-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Logo size={60} tagline />
            <p className="text-sm text-carbon-500">Punto de venta para restaurantes y negocios de comida.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-carbon-600">
            <a href="#precios" className="hover:text-carbon-950">Precios</a>
            <a href="/blog" className="hover:text-carbon-950">Blog</a>
            <a href="/privacidad" className="hover:text-carbon-950">Aviso de Privacidad</a>
            <a href="/terminos" className="hover:text-carbon-950">Términos</a>
            {SUPPORT_EMAIL && (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 hover:text-carbon-950"><Mail size={14} /> {SUPPORT_EMAIL}</a>
            )}
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-xs text-carbon-400">© {new Date().getFullYear()} Don Punto</div>
      </footer>

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escríbenos por WhatsApp"
          className="fixed bottom-5 right-5 z-50 grid h-14 w-14 place-items-center rounded-full bg-[#25D366] text-white shadow-[0_12px_30px_-8px_rgba(37,211,102,0.6)] transition-transform hover:scale-105"
        >
          <MessageCircle size={26} />
        </a>
      )}
    </div>
  );
}

function Notification({ time, title, body, muted }: { time: string; title: string; body: string; muted?: boolean }) {
  return (
    <div className={`flex gap-3 rounded-2xl p-4 ${muted ? 'bg-white/[0.07] ring-1 ring-white/5' : 'bg-white/[0.13] ring-1 ring-white/20'}`}>
      <Mark size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-semibold">{title}</p>
          <span className="shrink-0 text-xs text-carbon-300">{time}</span>
        </div>
        <p className="mt-0.5 text-sm text-carbon-200 leading-snug">{body}</p>
      </div>
      {!muted && <BellRing size={14} className="text-maiz-400 shrink-0 mt-1" />}
    </div>
  );
}

function Plan({ name, price, text, items, cta, note, onClick, featured }: { name: string; price: number; text: string; items: string[]; cta: string; note?: string; onClick: () => void; featured?: boolean }) {
  return (
    <div className={featured ? 'rounded-[1.6rem] bg-agave-950 p-1.5 shadow-[0_40px_80px_-40px_rgba(4,33,26,0.7)]' : 'rounded-[1.6rem] bg-carbon-100 p-1.5'}>
      <div className={`h-full rounded-[1.25rem] p-8 sm:p-10 flex flex-col ${featured ? 'bg-agave-900 text-white ring-1 ring-white/10' : 'bg-white ring-1 ring-carbon-200/70'}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-2xl font-bold">{name}</h3>
          {featured && <span className="rounded-full bg-maiz-400 px-3 py-1 text-xs font-semibold text-carbon-950">El más elegido</span>}
        </div>
        <p className={`mt-2 ${featured ? 'text-agave-100/80' : 'text-carbon-600'}`}>{text}</p>
        <p className="mt-8 flex items-baseline gap-2">
          <span className="font-display text-6xl font-bold tracking-tight tabular-nums">${price}</span>
          <span className={featured ? 'text-agave-100/70' : 'text-carbon-500'}>MXN al mes</span>
        </p>
        <ul className="mt-8 space-y-3 flex-1">
          {items.map((it) => (
            <li key={it} className="flex gap-3">
              <Check size={18} className={featured ? 'text-maiz-400 shrink-0 mt-0.5' : 'text-agave-500 shrink-0 mt-0.5'} />
              <span className={featured ? 'text-white/90' : 'text-carbon-700'}>{it}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={onClick}
          className={`mt-10 w-full rounded-full py-3.5 font-semibold transition-colors ${featured ? 'bg-maiz-400 hover:bg-maiz-300 text-carbon-950' : 'bg-carbon-950 hover:bg-carbon-800 text-white'}`}
        >
          {cta}
        </button>
        {note && <p className={`mt-3 text-center text-sm ${featured ? 'text-agave-100/70' : 'text-carbon-500'}`}>{note}</p>}
      </div>
    </div>
  );
}
