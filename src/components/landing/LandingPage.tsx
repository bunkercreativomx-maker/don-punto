import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LockKeyhole, Store, UserCog, PackageCheck, HeartHandshake, BarChart3, FileScan,
  Check, ChevronDown, Receipt, Calculator, Wallet, Boxes, ChefHat, ScanLine, WifiOff, BellRing,
  Smartphone, MessageCircle, Mail, ArrowRight, ShieldCheck, Globe, Bike, Banknote,
  EyeOff, Ban, TrendingDown, Coffee, Croissant, IceCream, Truck, ShoppingBag, Volume2, VolumeX,
  Download, Camera, Phone, Plus,
} from 'lucide-react';
import { Logo, Mark, Wordmark } from '../brand/Logo';
import { InstallAppButton } from '../pwa/InstallApp';
import { ANDROID_APP_URL } from '../../lib/nativeBridge';
import { whatsappLink, supportLink, SUPPORT_EMAIL, PLANS, FOUNDER } from '../../config';
import { useFounders, priceFor } from '../../lib/founders';
import { AD_HERO, getAd, fillAd } from '../../lib/adVariant';
import { track, trackCustom } from '../../lib/pixel';

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
            Probar 15 días gratis
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
  { q: '¿Cómo funciona la prueba gratis?', a: 'Creas tu cuenta y usas Don Punto completo 15 días, sin tarjeta. Antes de que termine te avisamos. Si te gusta, eliges tu plan y sigues cobrando; si no, no pasa nada: no se te cobra y tus datos se quedan guardados.' },
  { q: '¿Qué es el precio de fundador?', a: `Los primeros ${FOUNDER.limit} negocios que se suscriban pagan $${FOUNDER.prices.basico} al mes en Básico (en lugar de $${PLANS.basico.price}) o $${FOUNDER.prices.pro} en Pro (en lugar de $${PLANS.pro.price}), y ese precio se les queda de por vida mientras sigan suscritos. Además les cargamos su menú desde una foto y les damos una videollamada de 15 minutos para dejarlos listos.` },
  { q: '¿La tienda en línea cobra comisión?', a: 'No. Está incluida en tu plan. Tus clientes te pagan directo: efectivo al recoger o transferencia CoDi a tu cuenta. Don Punto no se queda con ningún porcentaje de tus pedidos.' },
  { q: '¿Tengo que firmar contrato?', a: 'No. Pagas mes a mes y cancelas cuando quieras desde "Mi plan" dentro de tu cuenta. No hay penalizaciones.' },
  { q: '¿Necesito comprar equipo?', a: 'No. Funciona en la computadora, tablet o celular que ya tienes. Puedes instalarla como app y abrirla desde tu pantalla de inicio.' },
  { q: '¿Qué pasa si se va el internet?', a: 'Sigues cobrando en el mismo equipo. Cuando regresa la conexión, tus ventas se respaldan solas en la nube.' },
  { q: '¿Qué impresoras sirven?', a: 'Cualquier impresora instalada en tu equipo: térmica de ticket de 58 mm o impresora normal tamaño carta.' },
  { q: '¿Emite facturas (CFDI)?', a: 'No. Don Punto te separa el IVA de cada venta y te ayuda con tus números, pero no timbra facturas.' },
  { q: '¿Cómo pago?', a: 'Con tarjeta de débito o crédito; el cobro lo procesa Stripe. Si prefieres transferencia, escríbenos.' },
];

const PAINS: { icon: ReactNode; pain: string; hurt: string; fix: string }[] = [
  { icon: <Wallet strokeWidth={1.6} />, pain: 'Cierras y la caja no cuadra', hurt: 'Cuentas billetes, falta dinero y nunca sabes en qué momento se fue.', fix: 'Don Punto te dice cuánto efectivo debe haber en el cajón antes de contarlo.' },
  { icon: <EyeOff strokeWidth={1.6} />, pain: 'Si no estás, no sabes cuánto vendiste', hurt: 'Te enteras hasta el otro día, o cuando alguien te lo cuenta.', fix: 'Cada noche te llega el cierre del día al celular, estés donde estés.' },
  { icon: <ChefHat strokeWidth={1.6} />, pain: 'La orden se pierde en la cocina', hurt: 'Platillo equivocado, cliente esperando y comida que se tira.', fix: 'Cada orden sale con ticket para el cliente y comanda para cocina.' },
  { icon: <Ban strokeWidth={1.6} />, pain: 'Descuentos y cancelaciones que nadie autorizó', hurt: 'Un ticket borrado por aquí, un descuento por allá. Al mes es mucho dinero.', fix: 'Borrar o descontar pide tu PIN. Tu cajero entra con el suyo, y en el plan Pro cada empleado tiene el propio.' },
  { icon: <PackageCheck strokeWidth={1.6} />, pain: 'Se te acaba un insumo en hora pico', hurt: 'Le dices al cliente "ya no hay" y se va con la competencia.', fix: 'En el plan Pro el inventario se descuenta solo y te avisa antes de que se acabe.' },
  { icon: <TrendingDown strokeWidth={1.6} />, pain: 'Vendes mucho, pero no sabes qué te deja dinero', hurt: 'Trabajas más horas y al final del mes no ves la ganancia.', fix: 'Ves el costo y el margen de cada producto, y cuál se vende y cuál no.' },
];

const BUSINESSES: { icon: ReactNode; t: string }[] = [
  { icon: <ChefHat strokeWidth={1.6} />, t: 'Restaurantes' },
  { icon: <Coffee strokeWidth={1.6} />, t: 'Cafeterías' },
  { icon: <Croissant strokeWidth={1.6} />, t: 'Panaderías' },
  { icon: <IceCream strokeWidth={1.6} />, t: 'Neverías' },
  { icon: <Truck strokeWidth={1.6} />, t: 'Food trucks' },
  { icon: <ShoppingBag strokeWidth={1.6} />, t: 'Tiendas' },
];

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  { icon: <Wallet strokeWidth={1.6} />, title: 'Corte de caja que sí cuadra', text: 'Efectivo, tarjeta y apps por separado. Sabes cuánto efectivo debe haber en el cajón antes de contarlo.' },
  { icon: <Receipt strokeWidth={1.6} />, title: 'IVA separado en cada venta', text: 'Ves qué parte es tuya y qué parte es del SAT, en 16% o en 8% de zona fronteriza.' },
  { icon: <ChefHat strokeWidth={1.6} />, title: 'Inventario y recetas con costo real', text: 'Arma la receta de cada platillo, conoce su costo y su margen, y lleva lo que compras y lo que te queda.' },
  { icon: <LockKeyhole strokeWidth={1.6} />, title: 'Tus números bajo llave', text: 'La caja solo ve el punto de venta. Reportes, ganancias y ajustes piden el PIN del dueño.' },
  { icon: <ScanLine strokeWidth={1.6} />, title: 'Tu menú desde una foto', text: 'Tómale foto a tu menú impreso y la IA lo convierte en productos con precio.' },
  { icon: <WifiOff strokeWidth={1.6} />, title: 'Funciona sin internet', text: 'Si se cae la red sigues vendiendo. Todo se sube a la nube cuando vuelve la conexión.' },
];

const MORE_IDS = ['tienda-en-linea', 'apps', 'app', 'pro'];

/* ------------------------------------------------------------------ página */
/** Video del landing: autoplay en silencio cuando entra en pantalla (los navegadores solo permiten autoplay sin sonido). */
function AutoplayVideo({ src, poster, label, className }: { src: string; poster: string; label: string; className: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => undefined);
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    const next = !muted;
    v.muted = next;
    if (!next) { v.currentTime = 0; v.play().catch(() => undefined); }
    setMuted(next);
  };
  return (
    <div className="relative">
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        className={`block w-full bg-carbon-950 object-cover ${className}`}
      />
      <button
        type="button"
        onClick={toggleSound}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-black/80"
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        {muted ? 'Activar sonido' : 'Silenciar'}
      </button>
    </div>
  );
}

/** Tutorial de la tienda en línea. */
function StoreTutorialVideo() {
  return (
    <AutoplayVideo
      src="/videos/tutorial-tienda.mp4"
      poster="/videos/tutorial-tienda.webp"
      label="Tutorial: así funciona la tienda en línea de Don Punto"
      className="aspect-[9/16] rounded-[2.1rem]"
    />
  );
}

/** Video de introducción: vertical en celular, horizontal desde md. El oculto (display:none) nunca entra en pantalla, así que no se reproduce. */
function IntroVideo() {
  const label = 'Video: conoce Don Punto en 40 segundos';
  return (
    <>
      <div className="md:hidden mx-auto max-w-sm">
        <AutoplayVideo src="/videos/intro-vertical.mp4" poster="/videos/intro-vertical.webp" label={label} className="aspect-[9/16] rounded-[2rem]" />
      </div>
      <div className="hidden md:block">
        <AutoplayVideo src="/videos/intro-horizontal.mp4" poster="/videos/intro-horizontal.webp" label={label} className="aspect-video rounded-[1.6rem]" />
      </div>
    </>
  );
}

export function LandingPage({ onLogin, onSubscribe }: LandingPageProps) {
  const whatsapp = whatsappLink('Hola, quiero información de Don Punto.');
  const contact = supportLink('Hola, quiero información de Don Punto.');
  const [open, setOpen] = useState<number | null>(0);
  const founders = useFounders();
  const founderOpen = !founders || founders.left > 0;
  const basico = priceFor('basico', founders);
  const pro = priceFor('pro', founders);
  const perDay = Math.ceil(basico.price / 30);
  const [sticky, setSticky] = useState(false);
  const [story, setStory] = useState(false); // «Leer la historia completa» en celular

  // Anuncio que trajo el clic (?a=05): el inicio repite su promesa
  const ad = useMemo(() => getAd(), []);
  const adHero = ad && AD_HERO[ad] && (founderOpen || !AD_HERO[ad].founderOnly) ? AD_HERO[ad] : null;
  const adVars = { fundador: FOUNDER.prices.basico, normal: PLANS.basico.price, lugares: FOUNDER.limit, dia: perDay };
  const heroTitle = adHero ? fillAd(adHero.title, adVars) : 'Tu punto de venta para restaurantes';

  // Medición: clic en cada botón (con su lugar) y qué tanto bajan
  const go = (place: string) => { trackCustom('CTAClick', { place, ad: ad || 'sin-anuncio' }); onSubscribe(); };
  const depth = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      // La barra fija se esconde mientras el formulario «Déjanos tu número» está en pantalla (no debe tapar su botón)
      const lead = document.getElementById('te-marcamos')?.getBoundingClientRect();
      const onLead = !!lead && lead.top < window.innerHeight - 120 && lead.bottom > 120;
      setSticky(window.scrollY > 640 && !onLead);
      const pct = ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100;
      for (const mark of [25, 50, 75, 100]) {
        if (pct >= mark - 0.5 && depth.current < mark && window.scrollY > 0) { depth.current = mark; trackCustom('ScrollDepth', { depth: mark, ad: ad || 'sin-anuncio' }); }
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ad]);

  // «Además incluye»: secciones plegadas; los enlaces #tienda-en-linea etc. las abren
  const [more, setMore] = useState<string | null>(ad === 'a14' ? 'tienda-en-linea' : null);
  useEffect(() => {
    const openFromHash = () => {
      const h = window.location.hash.slice(1);
      if (MORE_IDS.includes(h)) { setMore(h); setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }), 60); }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const heroExtras = (
    <>
      {founderOpen && (
        <p className="lg:mt-6 flex max-w-xl gap-3 rounded-2xl bg-maiz-50 px-4 py-3.5 text-[15px] leading-snug text-carbon-800 ring-1 ring-maiz-300">
          <Camera size={20} className="mt-0.5 shrink-0 text-maiz-700" />
          <span><b className="font-semibold text-carbon-950">¿No tienes tiempo de capturar tu menú?</b> Con el precio de fundador nosotros te lo cargamos desde una foto y te dejamos listo en una videollamada de 15 minutos.</span>
        </p>
      )}
      <a href="#te-marcamos" className="mt-4 inline-flex items-center gap-2 text-[15px] font-semibold text-agave-700 underline underline-offset-4"><Phone size={16} /> ¿Prefieres que te ayudemos a empezar? Déjanos tu número</a>
    </>
  );

  return (
    <div className="min-h-[100dvh] bg-[#FAFAF7] text-carbon-950 overflow-x-hidden selection:bg-maiz-200">
      {/* Encabezado */}
      <header className="sticky top-0 z-40 border-b border-carbon-200/60 bg-[#FAFAF7]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-8">
          <a href="#inicio" aria-label="Don Punto, inicio" className="shrink-0"><Logo size={32} className="sm:hidden" /><Logo size={44} className="hidden sm:block" /></a>
          <nav className="hidden md:flex items-center gap-8 text-sm text-carbon-600">
            <a href="#como-funciona" className="hover:text-carbon-950">Cómo funciona</a>
            <a href="#tienda-en-linea" className="hover:text-carbon-950">Tienda en línea</a>
            <a href="#precios" className="hover:text-carbon-950">Precios</a>
            <a href="#preguntas" className="hover:text-carbon-950">Preguntas</a>
            <a href="/blog" className="hover:text-carbon-950">Blog</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <button onClick={onLogin} className="whitespace-nowrap rounded-full px-2.5 sm:px-4 py-2 text-[13px] sm:text-sm font-medium text-carbon-700 hover:bg-carbon-100">
              Entrar
            </button>
            <button onClick={() => go('encabezado')} className="whitespace-nowrap rounded-full bg-agave-600 hover:bg-agave-700 px-3.5 sm:px-5 py-2 text-[13px] sm:text-sm font-semibold text-white transition-colors">
              Probar gratis
            </button>
          </div>
        </div>
      </header>

      <main id="inicio">
        {/* Hero */}
        <Section className="pt-8 pb-14 sm:pt-20 sm:pb-28">
          <div className="hero-in">
            <p className="inline-flex items-center gap-2 rounded-full bg-agave-50 px-3 py-1 text-sm text-agave-700 ring-1 ring-agave-100">
              <span className="h-1.5 w-1.5 rounded-full bg-maiz-400" /> {adHero ? 'Don Punto · Tu punto de venta para restaurantes' : 'Restaurantes, cafeterías y negocios de mostrador'}
            </p>
            <h1 className={`mt-5 sm:mt-6 max-w-5xl font-display font-bold tracking-[-0.04em] text-carbon-950 leading-[1] sm:leading-[0.98] sm:text-7xl ${adHero ? 'text-[2.45rem] lg:text-[5.4rem]' : 'text-[2.7rem] lg:text-[6.4rem]'}`}>
              {heroTitle}<span className="text-maiz-500">.</span>
            </h1>
          </div>
          <div className="mt-6 sm:mt-10 grid items-center gap-9 sm:gap-14 lg:grid-cols-[1fr_1fr]">
            <div className="hero-in">
              {adHero ? (
                <p className="max-w-xl text-lg sm:text-xl leading-relaxed text-carbon-600">{fillAd(adHero.sub, adVars)}</p>
              ) : (
                <>
                  <p className="max-w-xl text-lg sm:text-xl leading-relaxed text-carbon-600">
                    Cobra en segundos, manda la comanda a cocina y cuadra tu caja<span className="hidden sm:inline">. Don Punto te dice cuánto ganaste hoy</span>, desde el celular, la tablet o la compu que ya tienes.
                  </p>
                  <p className="hidden sm:block mt-4 max-w-xl text-base leading-relaxed text-carbon-600">
                    <b className="font-semibold text-carbon-900">¿No tienes restaurante?</b> También es para negocios pequeños y medianos que quieren llevar el control de sus ventas.
                  </p>
                </>
              )}
              <div className="mt-7 sm:mt-9 flex flex-col sm:flex-row gap-3">
                <button onClick={() => go('inicio')} className="group inline-flex items-center justify-center gap-3 rounded-full bg-agave-600 hover:bg-agave-700 pl-8 pr-2.5 py-2.5 text-lg font-bold text-white shadow-[0_18px_40px_-14px_rgba(4,33,26,0.55)] transition-colors">
                  Probar 15 días gratis
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
                    <ArrowRight size={20} />
                  </span>
                </button>
                <a href="#precios" className="hidden sm:inline-flex items-center justify-center rounded-full px-7 py-3.5 text-base font-semibold text-carbon-800 ring-1 ring-carbon-300 hover:bg-white">
                  Ver precios
                </a>
              </div>
              <p className="mt-3 text-center sm:text-left text-sm text-carbon-600">
                Sin tarjeta · Sin contratos · {founderOpen ? `Luego desde $${FOUNDER.prices.basico} al mes` : `Luego desde $${PLANS.basico.price} al mes`}
              </p>
              <div className="hidden lg:block">{heroExtras}</div>
            </div>
            <div className="hero-in hero-in-late relative">
              {/* Celular: captura del cobro en teléfono */}
              <div className="sm:hidden mx-auto w-full max-w-[250px] rounded-[2.3rem] bg-carbon-950 p-2 shadow-[0_40px_80px_-30px_rgba(4,33,26,0.6)] ring-1 ring-black/20">
                <img src="/screens/pos-movil.webp" alt="Don Punto cobrando desde un celular" width={780} height={1560} decoding="async" className="block w-full rounded-[1.8rem]" />
              </div>
              {/* Tablet y compu */}
              <div className="hidden sm:block">
                <div className="absolute -inset-6 rounded-[2.5rem] bg-agave-500/10 blur-2xl" aria-hidden="true" />
                <div className="relative rounded-[1.4rem] bg-carbon-900 p-1.5 ring-1 ring-black/10 shadow-[0_40px_80px_-40px_rgba(4,33,26,0.55)]">
                  <img src="/screens/pos.webp" alt="Pantalla de cobro de Don Punto con el menú y la orden actual" decoding="async" loading="lazy" className="block w-full rounded-[1.1rem]" />
                </div>
              </div>
            </div>
            <div className="lg:hidden">{heroExtras}</div>
          </div>
        </Section>

        {/* Video de introducción */}
        <Section id="video" className="pb-12 sm:pb-28">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-agave-600">Conoce Don Punto</p>
            <h2 className="mt-3 font-display text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-carbon-950">Míralo en 40 segundos<span className="text-maiz-500">.</span></h2>
          </div>
          <div className="mt-10 rounded-[2.2rem] md:rounded-[1.9rem] bg-carbon-900 p-1.5 ring-1 ring-black/10 shadow-[0_40px_80px_-40px_rgba(4,33,26,0.55)] md:p-2 max-w-sm md:max-w-none mx-auto">
            <IntroVideo />
          </div>
        </Section>

        {/* Quiénes somos */}
        <Section id="nosotros" className="pb-16 sm:pb-28">
          <div className="flex flex-col lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-x-14 lg:items-start">
            <div className="contents lg:block">
            <figure className="order-1">
              <img src="/equipo.webp" alt="Francisco Cota y Tlaloc, creadores de DonPunto.com" width={1200} height={704} loading="lazy" decoding="async" className="block w-full rounded-[1.6rem] ring-1 ring-carbon-200/70" />
              <figcaption className="mt-4 grid grid-cols-2 gap-4 text-center text-sm">
                <span><b className="block text-base font-semibold text-carbon-950">Francisco Cota</b><span className="text-carbon-600">Desarrollo y tecnología</span></span>
                <span><b className="block text-base font-semibold text-carbon-950">Tlaloc</b><span className="text-carbon-600">Soporte y atención al cliente</span></span>
              </figcaption>
            </figure>
            <div className="order-3 mt-10 lg:mt-14">
              <h3 className="font-display text-3xl sm:text-4xl font-bold leading-[1.08] tracking-[-0.025em]">Somos emprendedores, igual que tú</h3>
              <p className="mt-4 text-lg text-carbon-700 leading-relaxed">No somos una gran empresa. Somos dos personas que conocen los retos de sacar adelante un negocio y que decidieron crear una herramienta para hacer las cosas más fáciles.</p>
            </div>
            <div className="order-4 lg:mt-2">
              <p className="mt-6 lg:mt-0 text-lg font-semibold text-carbon-950">Por eso, en DonPunto:</p>
              <ul className="mt-4 space-y-3 text-carbon-800">
                <li className="flex gap-3"><Check size={18} className="mt-1 shrink-0 text-agave-500" /> <span><b className="font-semibold text-carbon-950">Te atienden personas reales</b>, de 9:00 a. m. a 6:00 p. m.</span></li>
                <li className="flex gap-3"><Check size={18} className="mt-1 shrink-0 text-agave-500" /> <span><b className="font-semibold text-carbon-950">Puedes llevar un mejor control de tus ventas</b> y dedicar menos tiempo a las cuentas.</span></li>
                <li className="flex gap-3"><Check size={18} className="mt-1 shrink-0 text-agave-500" /> <span><b className="font-semibold text-carbon-950">Puedes calcular tus precios para plataformas digitales</b>, tomando en cuenta comisiones y otros costos para proteger tus ganancias.</span></li>
                {founderOpen && (
                  <li className="flex gap-3"><Check size={18} className="mt-1 shrink-0 text-agave-500" /> <span><b className="font-semibold text-carbon-950">Los primeros {FOUNDER.limit} negocios obtienen precio de fundador.</b> Después, las nuevas suscripciones tendrán el precio regular.</span></li>
                )}
              </ul>
            </div>
            </div>
            <div className="contents lg:block">
            <div className="order-2 mt-8 lg:mt-0">
              <span className="inline-flex rounded-full bg-agave-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-agave-800">Quiénes somos</span>
              <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">DonPunto nació de una necesidad real</h2>
              <p className="mt-5 text-lg text-carbon-700 leading-relaxed">Soy <b className="font-semibold text-carbon-950">Francisco Cota y tengo un restaurante</b>. Como muchos dueños de negocios, me he enfrentado a problemas que no siempre son fáciles de resolver: saber cuánto dinero separar para el IVA, lidiar con el SAT y llevar el control de las ventas sin depender de una libreta.</p>
              <p className="mt-4 text-lg text-carbon-700 leading-relaxed">Pero uno de mis mayores dolores de cabeza era <b className="font-semibold text-carbon-950">no saber en cuánto vender mis productos en las plataformas de reparto para realmente ganar dinero</b>. Entre comisiones, impuestos y costos, podía estar vendiendo mucho sin saber cuánto estaba ganando.</p>
              <div className={story ? '' : 'hidden sm:block'}>
                <p className="mt-4 text-lg text-carbon-700 leading-relaxed">Fue precisamente buscando ayuda con ese problema que conocí a <b className="font-semibold text-carbon-950">Tlaloc</b>, quien se dedicaba a asesorar restaurantes sobre sus ventas en plataformas digitales.</p>
                <p className="mt-4 text-lg text-carbon-700 leading-relaxed">Nos dimos cuenta de que podíamos unir nuestras experiencias: yo conocía los problemas de administrar un restaurante todos los días y Tlaloc sabía cómo ayudar a los negocios a entender sus costos y vender mejor en las plataformas.</p>
                <p className="mt-4 text-lg text-carbon-700 leading-relaxed"><b className="font-semibold text-carbon-950">Así nació DonPunto.</b> Juntos desarrollamos un sistema para que otros emprendedores puedan llevar sus ventas en orden, entender mejor sus números y administrar su negocio sin tantas complicaciones.</p>
              </div>
              {!story && (
                <button type="button" onClick={() => setStory(true)} className="sm:hidden mt-4 text-base font-semibold text-agave-700 underline underline-offset-4">Leer la historia completa</button>
              )}
            </div>
            <div className="order-5 lg:mt-6">
              <p className="mt-7 border-l-4 border-maiz-400 pl-4 text-lg font-semibold leading-snug text-carbon-950">DonPunto no nació de una idea en una oficina. Nació de los problemas reales que vivimos trabajando con restaurantes.</p>
              <p className="mt-6 text-carbon-950"><b className="font-semibold">Francisco Cota y Tlaloc</b><br /><i className="text-carbon-600">Creadores y desarrolladores de DonPunto.com</i></p>
            </div>
            </div>
          </div>
          <div className="mt-9 lg:mt-14">
              <button onClick={() => go('quienes-somos')} className="group flex w-full sm:w-auto lg:mx-auto items-center justify-center gap-4 rounded-full bg-agave-600 hover:bg-agave-700 pl-9 pr-3 py-3 text-xl sm:text-2xl font-bold text-white shadow-[0_18px_40px_-14px_rgba(4,33,26,0.55)] transition-colors">
                Probar 15 días gratis
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-0.5"><ArrowRight size={24} /></span>
              </button>
              <p className="mt-3 text-center sm:text-left lg:text-center text-sm text-carbon-600">Sin tarjeta · Sin contratos</p>
          </div>
        </Section>

        {/* El dolor de no tener un buen punto de venta */}
        <section id="por-que" className="bg-agave-950 text-white">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-28">
            <div className="max-w-3xl">
              <h2 className="font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">
                Sin un buen punto de venta, tu dinero se te escapa <span className="text-maiz-400">sin que lo veas</span>.
              </h2>
              <p className="mt-5 text-lg text-agave-100/90 leading-relaxed">La libreta, la calculadora y el cajón funcionan… hasta el día que no. Esto le pasa todos los días a los negocios sin control:</p>
            </div>
            <div className="mt-8 sm:mt-14 grid gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {PAINS.map((p, i) => (
                <div key={p.pain} className={`rounded-[1.4rem] bg-white/[0.06] p-5 sm:p-7 ring-1 ring-white/10 ${i >= 4 ? 'hidden sm:block' : ''}`}>
                  <div className="flex items-center gap-3 sm:block">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-maiz-400/15 text-maiz-400 [&>svg]:h-5 [&>svg]:w-5">{p.icon}</div>
                    <h3 className="text-lg font-semibold leading-snug sm:mt-5">{p.pain}</h3>
                  </div>
                  <p className="hidden sm:block mt-2 text-agave-100/70 leading-relaxed">{p.hurt}</p>
                  <p className="mt-3 sm:mt-4 flex gap-2.5 sm:border-t border-white/10 sm:pt-4 text-white/90 leading-relaxed"><Check size={18} className="mt-0.5 shrink-0 text-maiz-400" /> {p.fix}</p>
                </div>
              ))}
            </div>
            <p className="mt-12 max-w-3xl text-xl sm:text-2xl font-display font-bold leading-snug">Cada día sin control es dinero que se va. Con Don Punto lo ves todo desde la primera venta.</p>
            <button onClick={() => go('dolores')} className="mt-8 w-full sm:w-auto rounded-full bg-maiz-400 hover:bg-maiz-300 px-8 py-4 text-lg font-bold text-carbon-950 transition-colors">Probar 15 días gratis</button>
          </div>
        </section>

        {/* No solo restaurantes */}
        <Section id="negocios" className="pt-16 sm:pt-32">
          <div className="grid gap-7 sm:gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center rounded-[2rem] bg-white p-6 sm:p-14 ring-1 ring-carbon-200/70">
            <div>
              <span className="inline-flex rounded-full bg-maiz-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-800">No solo restaurantes</span>
              <h2 className="mt-5 font-display text-3xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">¿Tienes un negocio pequeño o mediano? También es para ti.</h2>
              <p className="hidden sm:block mt-5 text-lg text-carbon-600 leading-relaxed">Si cobras en mostrador y quieres saber cuánto vendes, cuánto te queda y qué se te está acabando, Don Punto te sirve igual. Tú decides qué productos y precios cargar.</p>
              <ul className="hidden sm:block mt-8 space-y-3 text-carbon-700">
                {['Cobro rápido con ticket impreso', 'Corte de caja diario con IVA separado', 'Reportes de lo que más y lo que menos vendes', 'Tus números protegidos con tu PIN'].map((t) => (
                  <li key={t} className="flex gap-3"><Check size={18} className="mt-0.5 shrink-0 text-agave-500" /> {t}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {BUSINESSES.map((b) => (
                <div key={b.t} className="flex items-center gap-3 rounded-2xl bg-carbon-50 px-3 sm:px-4 py-3 sm:py-4 ring-1 ring-carbon-200/70">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-agave-600 ring-1 ring-carbon-200 [&>svg]:h-5 [&>svg]:w-5">{b.icon}</span>
                  <span className="min-w-0 font-semibold text-carbon-900">{b.t}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Producto */}
        <Section id="como-funciona" className="py-16 sm:py-32">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.05]">Todo tu negocio en una sola pantalla</h2>
            <p className="mt-5 text-lg text-carbon-600 leading-relaxed">Hecho para la hora pico: botones grandes, cobro en dos toques y tickets para cliente y cocina.</p>
          </div>

          <div className="mt-8 sm:mt-14 grid gap-5 sm:gap-6 lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-8">
              <Shot src="/screens/pos.webp" alt="Pantalla de cobro de Don Punto con el menú y la orden actual" />
            </div>
            <div className="lg:col-span-4 flex flex-col justify-between gap-6 rounded-[1.4rem] bg-white p-6 sm:p-8 ring-1 ring-carbon-200/70">
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

            <div className="lg:col-span-5 rounded-[1.4rem] bg-white p-6 sm:p-8 ring-1 ring-carbon-200/70">
              <h3 className="font-display text-2xl font-bold tracking-tight">Precios por app, platillo por platillo</h3>
              <p className="mt-3 text-carbon-600 leading-relaxed">Pones tu costo y lo que quieres recibir; Don Punto te dice a cuánto subirlo en cada plataforma.</p>
              <Shot src="/screens/pricing.webp" alt="Tabla de precios por plataforma" className="mt-6" />
            </div>
            <div className="lg:col-span-7 rounded-[1.4rem] bg-white p-6 sm:p-8 ring-1 ring-carbon-200/70">
              <h3 className="font-display text-2xl font-bold tracking-tight">Reportes que entiendes en 10 segundos</h3>
              <p className="mt-3 text-carbon-600 leading-relaxed">Ventas de hoy, la semana y el mes, por canal y con el IVA ya separado. Imprime tu corte Z al cerrar.</p>
              <Shot src="/screens/reports.webp" alt="Reporte de ventas por canal" className="mt-6" />
            </div>
          </div>

          <div className="mt-10 sm:mt-20 grid gap-x-10 gap-y-4 sm:gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex items-center gap-4 sm:block">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</div>
                <div>
                  <h3 className="sm:mt-5 text-[17px] sm:text-lg font-semibold leading-snug">{f.title}</h3>
                  <p className="hidden sm:block mt-2 text-carbon-600 leading-relaxed">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Cómo empiezas */}
        <Section className="pb-16 sm:pb-32">
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em]">Empiezas hoy mismo</h2>
          <ol className="mt-8 sm:mt-12 grid gap-6 sm:gap-8 md:grid-cols-3">
            {[
              ['Crea tu cuenta', 'Tu correo y el nombre de tu negocio. Sin tarjeta: entras directo y tienes 15 días gratis.'],
              ['Sube tu menú', 'Captúralo, impórtalo desde una hoja de cálculo o tómale foto y la IA lo digitaliza.'],
              ['Cobra y cuadra', 'Vende en mostrador y apps, imprime tickets y haz tu corte con el IVA ya separado.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-5 md:block border-t-2 border-carbon-950 pt-5 md:pt-6">
                <span className="font-display text-5xl font-bold text-agave-600 tabular-nums">{i + 1}</span>
                <div>
                  <h3 className="md:mt-4 text-xl font-semibold">{t}</h3>
                  <p className="mt-1.5 md:mt-2 text-carbon-600 leading-relaxed">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        {/* Precios */}
        <section id="precios" className="bg-white border-y border-carbon-200/70">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-32">
            <div className="max-w-2xl">
              <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em]">Precio claro, sin contratos</h2>
              <p className="mt-5 text-lg text-carbon-600">Pruébalo 15 días gratis y sin tarjeta. Después pagas mes a mes en pesos y cancelas desde tu cuenta cuando quieras.</p>
              <p className="mt-3 text-lg font-semibold text-carbon-950">${basico.price} al mes es menos de ${perDay} al día. Un solo descuento sin autorizar te cuesta más.</p>
            </div>
            {founderOpen && (
              <div className="mt-10 max-w-4xl rounded-[1.4rem] bg-maiz-50 ring-1 ring-maiz-300 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-5">
                <div className="shrink-0">
                  {founders && founders.taken > 0 ? (
                    <>
                      <p className="font-display text-5xl font-bold tabular-nums text-carbon-950">{founders.left}<span className="text-2xl text-carbon-500"> / {FOUNDER.limit}</span></p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-maiz-800">lugares que quedan</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold uppercase tracking-wider text-maiz-800">Solo los primeros</p>
                      <p className="font-display text-5xl font-bold tabular-nums text-carbon-950">{FOUNDER.limit}</p>
                      <p className="text-xs font-semibold uppercase tracking-wider text-maiz-800">negocios</p>
                    </>
                  )}
                </div>
                <p className="text-carbon-700 leading-relaxed">
                  <b className="text-carbon-950">Precio de fundador de por vida.</b> Los primeros {FOUNDER.limit} negocios pagan ${FOUNDER.prices.basico} en lugar de ${PLANS.basico.price} (Pro ${FOUNDER.prices.pro} en lugar de ${PLANS.pro.price}) mientras sigan suscritos. Y te cargamos tu menú desde una foto, con una videollamada de 15 minutos para dejarte listo.
                </p>
              </div>
            )}
            <div className="mt-14 grid gap-6 lg:grid-cols-2 max-w-4xl">
              <Plan
                name="Básico"
                price={basico.price}
                regular={basico.founder ? basico.regular : undefined}
                text="Para un negocio con una sucursal que quiere orden y vender más."
                items={['1 sucursal, ventas ilimitadas', 'Tienda en línea propia, sin comisión por pedido', 'Calculadora de precios para apps de delivery', 'Tu menú desde una foto con IA', 'Combos sugeridos para mover tus platillos', 'Corte de caja con IVA, inventario y recetario', '2 usuarios: tú y 1 cajero con su PIN', 'Reportes y ganancias protegidos con PIN', 'Respaldo en la nube y app instalable']}
                cta="Probar 15 días gratis"
                note={`15 días gratis, sin tarjeta. Luego $${basico.price} al mes${basico.founder ? ' de por vida' : ''}.`}
                onClick={() => go('plan-basico')}
              />
              <Plan
                featured
                name="Pro"
                price={pro.price}
                regular={pro.founder ? pro.regular : undefined}
                text="Para negocios con equipo, varias sucursales y ganas de crecer."
                items={['Todo lo del plan Básico, incluida la tienda en línea', 'Varias sucursales con reporte de todas juntas', 'Empleados ilimitados (meseros, cajeros y gerentes) con su PIN y reporte por persona', 'Inventario que se descuenta solo y avisos al celular', 'Clientes frecuentes y recompensas por visita', 'Reportes avanzados con hoja de cálculo y PDF', 'Facturas de proveedor leídas con IA', 'Soporte prioritario']}
                cta="Probar 15 días gratis"
                note={`15 días gratis, sin tarjeta. Luego $${pro.price} al mes${pro.founder ? ' de por vida' : ''}.`}
                onClick={() => go('plan-pro')}
              />
            </div>
            <p className="mt-8 flex items-center justify-center lg:justify-start max-w-4xl gap-2 text-sm text-carbon-500"><ShieldCheck size={16} className="text-agave-500" /> Pago seguro con tarjeta procesado por Stripe. <a href="/privacidad" className="underline underline-offset-4 hover:text-carbon-800">Aviso de Privacidad</a> · <a href="/terminos" className="underline underline-offset-4 hover:text-carbon-800">Términos</a></p>
          </div>
        </section>

        {/* Te marcamos */}
        <Section id="te-marcamos" className="pt-16 sm:pt-28 scroll-mt-16">
          <div className="grid gap-8 lg:gap-14 lg:grid-cols-[1fr_0.9fr] items-center rounded-[2rem] bg-maiz-50 p-6 sm:p-14 ring-1 ring-maiz-300">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-800 ring-1 ring-maiz-300"><Phone size={13} /> Te ayudamos a empezar</span>
              <h2 className="mt-5 font-display text-3xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">¿No quieres hacerlo solo? Déjanos tu número.</h2>
              <p className="mt-4 text-lg text-carbon-700 leading-relaxed">Te marca una persona de nuestro equipo, de 9 de la mañana a 6 de la tarde. Resolvemos tus dudas y te ayudamos a dejar Don Punto listo para cobrar.</p>
            </div>
            <LeadForm ad={ad} />
          </div>
        </Section>

        {/* Además incluye (plegado: tienda, calculadora, app, Pro) */}
        <Section id="mas" className="py-16 sm:py-28">
          <h2 className="font-display text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-[1.05]">Y además incluye</h2>
          <p className="mt-4 text-lg text-carbon-600">Toca lo que te interese para verlo a detalle.</p>
          <div className="mt-8 sm:mt-10 divide-y divide-carbon-200 border-y border-carbon-200">
            <div id="tienda-en-linea" className="scroll-mt-20">
              <button type="button" onClick={() => { const next = more === 'tienda-en-linea' ? null : 'tienda-en-linea'; setMore(next); if (next) trackCustom('MasAbrir', { seccion: 'tienda-en-linea' }); }} aria-expanded={more === 'tienda-en-linea'} className="flex w-full items-center gap-4 py-5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100"><Globe size={20} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-snug text-carbon-950">Tu propia tienda en línea</span>
                  <span className="mt-0.5 block text-[15px] text-carbon-600 leading-snug">Cero comisión por pedido. Incluida en todos los planes.</span>
                </span>
                <Plus size={22} className={`shrink-0 text-carbon-400 transition-transform duration-300 ${more === 'tienda-en-linea' ? 'rotate-45' : ''}`} />
              </button>
              {more === 'tienda-en-linea' && (
                <div className="pb-10 pt-3">
              <div>
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
                      <button onClick={() => go('tienda')} className="rounded-full bg-agave-600 hover:bg-agave-700 px-7 py-3.5 font-semibold text-white transition-colors">Probar 15 días gratis</button>
                      <a href="/donchuy" target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 font-semibold text-carbon-800 ring-1 ring-carbon-300 hover:bg-white">Ver tienda de ejemplo <ArrowRight size={16} /></a>
                    </div>
                  </div>
                  <div className="relative mx-auto w-full max-w-[320px]">
                    <div className="absolute -inset-8 rounded-[3rem] bg-maiz-300/25 blur-2xl" aria-hidden="true" />
                    <div className="relative rounded-[2.6rem] bg-carbon-950 p-2.5 shadow-[0_40px_80px_-30px_rgba(4,33,26,0.6)] ring-1 ring-black/20">
                      <StoreTutorialVideo />
                    </div>
              
                  </div>
                </div>
              </div>
                </div>
              )}
            </div>
            <div id="apps" className="scroll-mt-20">
              <button type="button" onClick={() => { const next = more === 'apps' ? null : 'apps'; setMore(next); if (next) trackCustom('MasAbrir', { seccion: 'apps' }); }} aria-expanded={more === 'apps'} className="flex w-full items-center gap-4 py-5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100"><Calculator size={20} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-snug text-carbon-950">Calculadora de precios para apps de reparto</span>
                  <span className="mt-0.5 block text-[15px] text-carbon-600 leading-snug">Sabes a cuánto subir cada platillo para que te llegue lo que quieres ganar.</span>
                </span>
                <Plus size={22} className={`shrink-0 text-carbon-400 transition-transform duration-300 ${more === 'apps' ? 'rotate-45' : ''}`} />
              </button>
              {more === 'apps' && (
                <div className="pb-10 pt-3">
              <div className="rounded-[1.6rem] sm:rounded-[2rem] bg-agave-950 text-white">
                <div className="px-5 sm:px-12 py-9 sm:py-14 grid gap-10 sm:gap-14 lg:grid-cols-[1.05fr_0.95fr] items-center">
                  <div>
                    <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-400">¿También vendes en apps de reparto?</span>
                    <h2 className="mt-5 font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">
                      Un platillo de $100 en una app de reparto te deja <span className="text-maiz-400">$56</span>.
                    </h2>
                    <div className="mt-6 space-y-5 text-lg text-agave-100/90 leading-relaxed">
                      <p>La comisión de 30%, el IVA de esa comisión y las retenciones del SAT se llevan casi la mitad. Si pones el mismo precio que en tu mostrador, vendes más y ganas menos.</p>
                      <p>Don Punto calcula el precio exacto de cada platillo en cada app para que te llegue lo que quieres ganar, y te lo vuelve a calcular cuando cambias un costo. Pruébalo aquí:</p>
                    </div>
                  </div>
                  <TicketCalculator onStart={() => go('calculadora')} />
                </div>
              </div>
                </div>
              )}
            </div>
            <div id="app" className="scroll-mt-20">
              <button type="button" onClick={() => { const next = more === 'app' ? null : 'app'; setMore(next); if (next) trackCustom('MasAbrir', { seccion: 'app' }); }} aria-expanded={more === 'app'} className="flex w-full items-center gap-4 py-5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100"><Smartphone size={20} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-snug text-carbon-950">App instalable y cierre del día en tu celular</span>
                  <span className="mt-0.5 block text-[15px] text-carbon-600 leading-snug">Cada noche te llega lo que vendiste, aunque no estés en el negocio.</span>
                </span>
                <Plus size={22} className={`shrink-0 text-carbon-400 transition-transform duration-300 ${more === 'app' ? 'rotate-45' : ''}`} />
              </button>
              {more === 'app' && (
                <div className="pb-10 pt-3">
              <div>
                <div className="grid overflow-hidden rounded-[2rem] bg-carbon-950 text-white lg:grid-cols-2">
                  <div className="p-7 sm:p-14">
                    <Smartphone className="text-maiz-400" strokeWidth={1.6} />
                    <h2 className="mt-6 font-display text-4xl font-bold leading-[1.05] tracking-[-0.03em]">Instálala como app. Recibe tu cierre del día en el celular.</h2>
                    <p className="mt-5 text-lg text-carbon-300 leading-relaxed">
                      Don Punto se instala en cualquier celular, tablet o computadora sin pasar por ninguna tienda de apps. Cada noche te llega una notificación con lo que vendiste, aunque no estés en el negocio.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <button onClick={() => go('app')} className="rounded-full bg-maiz-400 hover:bg-maiz-300 px-6 py-3 font-semibold text-carbon-950 transition-colors">Probar 15 días gratis</button>
                      <InstallAppButton className="rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/20 hover:bg-white/5" />
                      <a href={ANDROID_APP_URL} className="inline-flex items-center gap-2 rounded-full px-6 py-3 font-semibold text-white ring-1 ring-white/20 hover:bg-white/5"><Download size={18} /> App para Android (APK)</a>
                    </div>
                    <p className="mt-4 text-sm text-carbon-400">¿Impresora Bluetooth en tablet o celular Android? Instala la app para Android: imprime directo, sin ventana ni apps extra.</p>
                  </div>
                  <div className="relative flex items-center justify-center p-10 sm:p-14 bg-[radial-gradient(120%_80%_at_70%_20%,rgba(22,137,95,0.35),transparent_60%)]">
                    <div className="w-full max-w-sm space-y-3">
                      <Notification time="10:02 p.m." title="Cierre de hoy: $8,940" body="63 ventas · ticket promedio $142. Toca para ver tu reporte." />
                      <Notification time="Ayer" title="Cierre de hoy: $7,310" body="51 ventas · ticket promedio $143." muted />
                      <Notification time="Lunes" title="Tu membresía está activa" body="Gracias por tu pago. Don Punto ya está listo para cobrar." muted />
                    </div>
                  </div>
                </div>
              </div>
                </div>
              )}
            </div>
            <div id="pro" className="scroll-mt-20">
              <button type="button" onClick={() => { const next = more === 'pro' ? null : 'pro'; setMore(next); if (next) trackCustom('MasAbrir', { seccion: 'pro' }); }} aria-expanded={more === 'pro'} className="flex w-full items-center gap-4 py-5 text-left">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-agave-50 text-agave-600 ring-1 ring-agave-100"><Store size={20} strokeWidth={1.6} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold leading-snug text-carbon-950">Plan Pro: equipo, sucursales e inventario</span>
                  <span className="mt-0.5 block text-[15px] text-carbon-600 leading-snug">Para cuando ya tienes más gente, más de un local y quieres crecer.</span>
                </span>
                <Plus size={22} className={`shrink-0 text-carbon-400 transition-transform duration-300 ${more === 'pro' ? 'rotate-45' : ''}`} />
              </button>
              {more === 'pro' && (
                <div className="pb-10 pt-3">
              <div>
                <div className="rounded-[2rem] bg-gradient-to-br from-maiz-50 via-white to-agave-50 ring-1 ring-carbon-200/70 p-8 sm:p-14">
                  <span className="inline-flex rounded-full bg-maiz-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-maiz-800">Plan Pro</span>
                  <h2 className="mt-5 max-w-2xl font-display text-4xl sm:text-5xl font-bold leading-[1.05] tracking-[-0.03em]">Para cuando ya tienes equipo, más de un local y quieres crecer.</h2>
                  <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { icon: <Store strokeWidth={1.6} />, t: 'Varias sucursales', d: 'Cada local cobra con su caja, su corte y su inventario. Tú ves todas juntas: cuál vende más y cuál va para abajo.' },
                      { icon: <UserCog strokeWidth={1.6} />, t: 'Todo tu equipo con su PIN', d: 'Meseros que mandan órdenes a cocina, cajeros y gerentes con permisos distintos. Sabes quién cobró, quién hizo descuentos y quién canceló.' },
                      { icon: <PackageCheck strokeWidth={1.6} />, t: 'Inventario que se descuenta solo', d: 'Al vender un platillo se restan los insumos de su receta. Te llega un aviso al celular cuando algo se está acabando.' },
                      { icon: <HeartHandshake strokeWidth={1.6} />, t: 'Clientes que regresan', d: 'Guarda a tus clientes con su teléfono, mira lo que compran y prémialos: "tu orden 10 va por la casa".' },
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
              </div>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Preguntas */}
        <Section id="preguntas" className="pb-16 sm:pb-32">
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
        <Section className="pb-16 sm:pb-32">
          <div className="relative overflow-hidden rounded-[2rem] bg-agave-600 px-8 py-16 sm:px-16 sm:py-20 text-white">
            <div aria-hidden="true" className="absolute -right-24 -bottom-24 h-80 w-80 rounded-full bg-maiz-400/90" />
            <div className="relative max-w-2xl">
              <Mark size={64} />
              <h2 className="mt-8 font-display text-4xl sm:text-6xl font-bold leading-[1.02] tracking-[-0.035em]">Deja de adivinar cuánto ganas.</h2>
              <p className="mt-5 text-lg text-agave-100">Crea tu cuenta en un minuto y cobra tu primera venta hoy.</p>
              <button onClick={() => go('cierre')} className="mt-9 w-full sm:w-auto rounded-full bg-white px-9 py-4 text-lg font-bold text-agave-800 hover:bg-agave-50 transition-colors">
                Probar 15 días gratis
              </button>
              <p className="mt-3 text-sm text-agave-100">Sin tarjeta · Sin contratos</p>
            </div>
          </div>
        </Section>
      </main>

      <footer className="border-t border-carbon-200/70 bg-white">
        <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <Logo size={60} tagline />
            <p className="text-sm text-carbon-500">Punto de venta para restaurantes y negocios pequeños y medianos.</p>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-carbon-600">
            <a href="#precios" className="hover:text-carbon-950">Precios</a>
            <a href="/blog" className="hover:text-carbon-950">Blog</a>
            <a href={ANDROID_APP_URL} className="hover:text-carbon-950">App para Android</a>
            <a href="/privacidad" className="hover:text-carbon-950">Aviso de Privacidad</a>
            <a href="/terminos" className="hover:text-carbon-950">Términos</a>
            {SUPPORT_EMAIL && (
              <a href={`mailto:${SUPPORT_EMAIL}`} className="inline-flex items-center gap-1.5 hover:text-carbon-950"><Mail size={14} /> {SUPPORT_EMAIL}</a>
            )}
          </nav>
        </div>
        <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-xs text-carbon-400">© {new Date().getFullYear()} Don Punto</div>
      </footer>

      <div className={`md:hidden fixed bottom-4 left-4 right-[5.5rem] z-[60] transition-all duration-300 ${sticky ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-24 opacity-0'}`}>
        <button onClick={() => go('barra-fija')} tabIndex={sticky ? 0 : -1} className="flex h-14 w-full flex-col items-center justify-center rounded-full bg-agave-600 px-4 text-white shadow-[0_14px_30px_-10px_rgba(4,33,26,0.6)] active:scale-[0.98]">
          <span className="text-[15px] font-semibold leading-tight">Probar 15 días gratis</span>
          <span className="text-[11px] leading-tight text-agave-100">Sin tarjeta · Sin contratos</span>
        </button>
      </div>

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

/** «Déjanos tu número»: avisa al equipo (Telegram) para que le marquen. */
function LeadForm({ ad }: { ad: string | null }) {
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [phone, setPhone] = useState('');
  const [trap, setTrap] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (phone.replace(/\D/g, '').length < 10) { setError('Escribe tu teléfono a 10 dígitos.'); return; }
    setState('sending');
    try {
      const eid = 'lead_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); // mismo id que manda el servidor (CAPI)
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, business, phone, ad: ad || '', website: trap, eid }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || 'No se pudo enviar. Intenta de nuevo.');
      track('Lead', { content_name: 'te-marcamos' }, eid);
      setState('done');
    } catch (err: any) {
      setError(err?.message || 'No se pudo enviar. Intenta de nuevo.');
      setState('idle');
    }
  };
  if (state === 'done') {
    return (
      <div className="rounded-[1.4rem] bg-white p-7 sm:p-9 ring-1 ring-carbon-200/70 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-agave-50 text-agave-600 ring-1 ring-agave-100"><Check size={28} /></span>
        <p className="mt-4 font-display text-2xl font-bold">Listo, {name.trim().split(' ')[0]}.</p>
        <p className="mt-2 text-carbon-600 leading-relaxed">Ya tenemos tu número. Te marcamos en horario de 9 de la mañana a 6 de la tarde.</p>
      </div>
    );
  }
  const input = 'mt-1.5 w-full rounded-xl bg-white px-4 py-3.5 text-base text-carbon-950 ring-1 ring-carbon-300 placeholder:text-carbon-400 focus:outline-none focus:ring-2 focus:ring-agave-500';
  return (
    <form onSubmit={submit} className="rounded-[1.4rem] bg-white p-6 sm:p-8 ring-1 ring-carbon-200/70 space-y-4">
      <label className="block text-sm font-semibold text-carbon-800">Tu nombre
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={60} autoComplete="name" placeholder="Ej. Juan Pérez" />
      </label>
      <label className="block text-sm font-semibold text-carbon-800">Tu teléfono
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} required type="tel" inputMode="tel" maxLength={20} autoComplete="tel" placeholder="10 dígitos" />
      </label>
      <label className="block text-sm font-semibold text-carbon-800">Tu negocio <span className="font-normal text-carbon-500">(opcional)</span>
        <input className={input} value={business} onChange={(e) => setBusiness(e.target.value)} maxLength={80} autoComplete="organization" placeholder="Ej. Taquería Don Juan" />
      </label>
      <input className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} name="website" />
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <button type="submit" disabled={state === 'sending'} className="w-full rounded-full bg-carbon-950 hover:bg-carbon-800 py-4 text-lg font-bold text-white transition-colors disabled:opacity-60">
        {state === 'sending' ? 'Enviando…' : 'Quiero que me marquen'}
      </button>
      <p className="text-center text-xs text-carbon-500">Solo usamos tu número para contactarte sobre Don Punto. <a href="/privacidad" className="underline underline-offset-2">Aviso de Privacidad</a></p>
    </form>
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

function Plan({ name, price, regular, text, items, cta, note, onClick, featured }: { name: string; price: number; regular?: number; text: string; items: string[]; cta: string; note?: string; onClick: () => void; featured?: boolean }) {
  const [all, setAll] = useState(false);
  const SHORT = 5; // en celular se ven 5 y el resto con «Ver todo»
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
          {regular && <span className={`text-xl font-semibold line-through tabular-nums ${featured ? 'text-agave-100/50' : 'text-carbon-400'}`}>${regular}</span>}
          <span className={featured ? 'text-agave-100/70' : 'text-carbon-500'}>MXN al mes</span>
        </p>
        {regular && <p className={`mt-1 text-sm font-semibold ${featured ? 'text-maiz-300' : 'text-maiz-700'}`}>Precio de fundador, de por vida</p>}
        <ul className="mt-8 space-y-3 flex-1">
          {items.map((it, i) => (
            <li key={it} className={`gap-3 ${i >= SHORT && !all ? 'hidden sm:flex' : 'flex'}`}>
              <Check size={18} className={featured ? 'text-maiz-400 shrink-0 mt-0.5' : 'text-agave-500 shrink-0 mt-0.5'} />
              <span className={featured ? 'text-white/90' : 'text-carbon-700'}>{it}</span>
            </li>
          ))}
          {items.length > SHORT && !all && (
            <li className="sm:hidden">
              <button type="button" onClick={() => setAll(true)} className={`text-sm font-semibold underline underline-offset-4 ${featured ? 'text-maiz-300' : 'text-agave-700'}`}>Ver todo lo que incluye ({items.length})</button>
            </li>
          )}
        </ul>
        <button
          onClick={onClick}
          className={`mt-8 sm:mt-10 w-full rounded-full py-4 text-lg font-bold transition-colors ${featured ? 'bg-maiz-400 hover:bg-maiz-300 text-carbon-950' : 'bg-carbon-950 hover:bg-carbon-800 text-white'}`}
        >
          {cta}
        </button>
        {note && <p className={`mt-3 text-center text-sm ${featured ? 'text-agave-100/70' : 'text-carbon-500'}`}>{note}</p>}
      </div>
    </div>
  );
}
