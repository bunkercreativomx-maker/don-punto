// Página pública del restaurante: donpunto.com/<slug> — menú, carrito, pedido y seguimiento.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, Bike, Store as StoreIcon, Clock, MapPin, Phone, Minus, Plus, X, ChevronLeft, Check, Copy, Loader2, AlertCircle, QrCode, Banknote, LocateFixed, Search } from 'lucide-react';
import { money, STATUS_LABEL } from '../../lib/onlineStore';

interface PMod { id: string; name: string; price: number }
interface PGroup { id: string; name: string; type: 'single' | 'multiple'; min?: number; max?: number; options: PMod[] }
interface PProduct { id: string; name: string; description: string; price: number; categoryId: string; groups: string[]; soldOut: boolean; photo: string | null }
interface PStore {
  slug: string; name: string; tagline: string; phone: string; address: string; hours: string; color: string;
  logo: string | null; cover: string | null; open: boolean; pickup: boolean; delivery: boolean; deliveryFee: number;
  minOrder: number; deliveryArea: string; prepMinutes: number; payCash: boolean; payCodi: boolean; cashDelivery: boolean;
  lat: number | null; lng: number | null; radiusKm: number;
  categories: { id: string; name: string }[]; groups: PGroup[]; products: PProduct[];
}
interface CartLine { key: string; id: string; qty: number; mods: Record<string, string[]>; note: string }

function distKm(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** Formas de pago según entrega: recoger = efectivo o CoDi; domicilio = CoDi (efectivo solo como solicitud). */
function payOptions(store: { payCash: boolean; payCodi: boolean; cashDelivery: boolean }, mode: 'pickup' | 'delivery') {
  const o: ('cash' | 'codi')[] = [];
  if (mode === 'delivery') { if (store.payCodi) o.push('codi'); if (store.cashDelivery) o.push('cash'); }
  else { if (store.payCash) o.push('cash'); if (store.payCodi) o.push('codi'); }
  return o;
}

const ls = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : d; } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } },
};

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  let d: any = null;
  try { d = await r.json(); } catch { /* vacío */ }
  if (!r.ok) throw Object.assign(new Error(d?.error || 'No se pudo conectar. Revisa tu internet.'), { status: r.status, code: d?.code });
  return d as T;
}

function useThemeColor(color: string) {
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }, [color]);
}

export default function StorePage({ slug }: { slug: string }) {
  const [tracking, setTracking] = useState<string | null>(() => new URLSearchParams(window.location.search).get('pedido'));
  useEffect(() => {
    const onPop = () => setTracking(new URLSearchParams(window.location.search).get('pedido'));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (t: string | null) => {
    window.history.pushState({}, '', t ? `/${slug}?pedido=${t}` : `/${slug}`);
    setTracking(t);
    window.scrollTo(0, 0);
  };
  return tracking ? <Tracking slug={slug} token={tracking} onBack={() => go(null)} /> : <Menu slug={slug} onOrdered={go} />;
}

// ---------------------------------------------------------------- menú + carrito
function Menu({ slug, onOrdered }: { slug: string; onOrdered: (t: string) => void }) {
  const [store, setStore] = useState<PStore | null>(null);
  const [err, setErr] = useState('');
  const [cart, setCart] = useState<CartLine[]>(() => ls.get(`dpstore:${slug}:cart`, []));
  const [mode, setMode] = useState<'pickup' | 'delivery'>(() => ls.get(`dpstore:${slug}:mode`, 'pickup'));
  const [picked, setPicked] = useState<PProduct | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [activeCat, setActiveCat] = useState('');
  const [search, setSearch] = useState('');
  const [last] = useState(() => {
    const l = ls.get<{ t: string; n: number; at: number } | null>(`dpstore:${slug}:last`, null);
    return l && Date.now() - l.at < 1000 * 60 * 60 * 12 ? l : null;
  });

  useEffect(() => {
    getJSON<PStore>(`/api/order?slug=${encodeURIComponent(slug)}`)
      .then((s) => {
        setStore(s);
        document.title = `${s.name} · Pide en línea`;
        if (!s.pickup && s.delivery) setMode('delivery');
        if (s.pickup && !s.delivery) setMode('pickup');
      })
      .catch((e) => setErr(e.message));
  }, [slug]);
  useEffect(() => ls.set(`dpstore:${slug}:cart`, cart), [slug, cart]);
  useEffect(() => ls.set(`dpstore:${slug}:mode`, mode), [slug, mode]);
  useThemeColor(store?.color || '#FAFAF7');

  const prodMap = useMemo(() => new Map((store?.products || []).map((p) => [p.id, p])), [store]);
  const groupMap = useMemo(() => new Map((store?.groups || []).map((g) => [g.id, g])), [store]);
  // Si el restaurante quitó un platillo, sale del carrito
  const validCart = useMemo(() => cart.filter((l) => prodMap.has(l.id)), [cart, prodMap]);
  const lineUnit = useCallback((l: CartLine) => {
    const p = prodMap.get(l.id);
    if (!p) return 0;
    let u = p.price;
    for (const gid of p.groups) {
      const g = groupMap.get(gid);
      if (g) u += g.options.filter((o) => l.mods[gid]?.includes(o.id)).reduce((a, o) => a + o.price, 0);
    }
    return u;
  }, [prodMap, groupMap]);
  const subtotal = validCart.reduce((a, l) => a + lineUnit(l) * l.qty, 0);
  const count = validCart.reduce((a, l) => a + l.qty, 0);

  const sections = useMemo(() => {
    if (!store) return [];
    const cats = store.categories.map((c) => ({ ...c, items: store.products.filter((p) => p.categoryId === c.id) }));
    const orphan = store.products.filter((p) => !store.categories.some((c) => c.id === p.categoryId));
    if (orphan.length) cats.push({ id: '_otros', name: cats.length ? 'Otros' : 'Menú', items: orphan });
    return cats.filter((c) => c.items.length);
  }, [store]);

  // Categoría visible al hacer scroll
  useEffect(() => {
    if (!sections.length) return;
    setActiveCat((c) => c || sections[0].id);
    const obs = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) setActiveCat(vis.target.id.replace('cat-', ''));
    }, { rootMargin: '-120px 0px -60% 0px' });
    sections.forEach((s) => { const el = document.getElementById('cat-' + s.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [sections]);

  if (err) return <Centered><AlertCircle className="w-10 h-10 text-carbon-400" /><p className="mt-3 font-semibold text-carbon-800">{err}</p><a href="/" className="mt-6 text-sm text-carbon-500 underline">Ir a Don Punto</a></Centered>;
  if (!store) return <Centered><Loader2 className="w-8 h-8 animate-spin text-carbon-400" /></Centered>;

  const brand = store.color;
  const addLine = (line: Omit<CartLine, 'key'>) => {
    const key = line.id + JSON.stringify(line.mods) + line.note;
    setCart((c) => {
      const i = c.findIndex((x) => x.key === key);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], qty: n[i].qty + line.qty }; return n; }
      return [...c, { ...line, key }];
    });
  };
  const setQty = (key: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((x) => x.key !== key) : c.map((x) => (x.key === key ? { ...x, qty } : x))));

  const q = search.trim().toLowerCase();
  const shown = q ? sections.map((s) => ({ ...s, items: s.items.filter((p) => (p.name + ' ' + p.description).toLowerCase().includes(q)) })).filter((s) => s.items.length) : sections;
  const totalItems = sections.reduce((a, s) => a + s.items.length, 0);
  const qtyOf = (id: string) => validCart.filter((l) => l.id === id).reduce((a, l) => a + l.qty, 0);

  return (
    <div className="min-h-screen bg-[#F6F5F1] text-carbon-900" style={{ ['--brand' as any]: brand }}>
      {/* Portada a todo lo ancho: el flyer completo (nunca recortado) sobre un fondo difuminado de la misma imagen */}
      <div className="relative w-full overflow-hidden bg-carbon-900">
        {store.cover ? (
          <>
            <img src={store.cover} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
            <div className="absolute inset-0 bg-black/10" />
            <img src={store.cover} alt={store.name} className="relative mx-auto block h-auto max-h-[560px] w-full object-contain" />
          </>
        ) : (
          <div className="h-36 sm:h-56" style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc 55%, #0d100e)` }} />
        )}
      </div>

      <div className="w-full px-3 pb-28 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-x-8 lg:px-10 lg:pb-16 xl:grid-cols-[minmax(0,1fr)_400px] 2xl:px-14">
        <div className="min-w-0">
          {/* Restaurante */}
          <header className="relative z-10 mt-4 rounded-3xl bg-white p-5 shadow-[0_12px_40px_-18px_rgba(13,16,14,0.3)] ring-1 ring-black/5 sm:mt-6 sm:p-7">
            <div className="flex items-center gap-4 sm:gap-5">
              <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-white p-1 shadow-md ring-1 ring-black/5 sm:h-24 sm:w-24">
                {store.logo ? <img src={store.logo} alt={store.name} className="h-full w-full rounded-xl object-contain" /> : <div className="grid h-full w-full place-items-center rounded-xl text-2xl font-black text-white" style={{ background: brand }}>{store.name.slice(0, 1)}</div>}
              </div>
              <div className="min-w-0">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${store.open ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-carbon-100 text-carbon-600 ring-1 ring-carbon-200'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${store.open ? 'animate-pulse bg-emerald-500' : 'bg-carbon-400'}`} />{store.open ? 'Recibiendo pedidos' : 'Cerrado por ahora'}
                </span>
                <h1 className="mt-1.5 font-display text-[26px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{store.name}</h1>
                {store.tagline && <p className="text-[14px] font-medium uppercase tracking-[0.14em] text-carbon-500 sm:text-[13px]">{store.tagline}</p>}
              </div>
            </div>
            {(store.hours || store.address || store.phone) && (
              <div className="mt-5 grid gap-px overflow-hidden rounded-2xl bg-carbon-100 ring-1 ring-carbon-100 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_0.7fr]">
                {store.hours && <Info Icon={Clock} label="Horario" className="sm:col-span-2 xl:col-span-1">{hoursLines(store.hours).map((h, i) => <span key={i} className="block">{h}</span>)}</Info>}
                {store.address && <Info Icon={MapPin} label="Dirección" href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`}>{store.address}</Info>}
                {store.phone && <Info Icon={Phone} label="Teléfono" href={`tel:${store.phone.replace(/\s/g, '')}`}>{fmtPhone(store.phone)}</Info>}
              </div>
            )}
            {last && (
              <button onClick={() => onOrdered(last.t)} className="mt-4 flex w-full items-center justify-between rounded-2xl border border-carbon-200 bg-carbon-50 px-4 py-3 text-left text-sm font-semibold">
                <span>Ver mi pedido #{last.n}</span><span style={{ color: brand }}>Seguimiento →</span>
              </button>
            )}
            {(store.pickup || store.delivery) && <div className="lg:hidden"><ModeSwitch store={store} mode={mode} setMode={setMode} /></div>}
          </header>

          {/* Buscador + categorías */}
          <nav className="sticky top-0 z-20 -mx-3 mt-4 bg-[#F6F5F1]/95 px-3 pb-3 pt-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-0 lg:px-0">
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-carbon-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar en el menú${totalItems > 8 ? ` (${totalItems} platillos)` : ''}`}
                className="w-full rounded-2xl border border-carbon-200 bg-white py-3 pl-11 pr-10 text-[15px] outline-none transition-colors focus:border-carbon-400" />
              {search && <button onClick={() => setSearch('')} aria-label="Limpiar" className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-carbon-500 hover:bg-carbon-100"><X className="h-4 w-4" /></button>}
            </div>
            {sections.length > 1 && !q && (
              <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
                {sections.map((s) => (
                  <button key={s.id} onClick={() => { const el = document.getElementById('cat-' + s.id); if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 140, behavior: 'smooth' }); }}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${activeCat === s.id ? 'text-white' : 'bg-white text-carbon-700 ring-1 ring-carbon-200 hover:bg-carbon-50'}`}
                    style={activeCat === s.id ? { background: brand } : undefined}>{s.name}</button>
                ))}
              </div>
            )}
          </nav>

          {/* Platillos */}
          <main>
            {sections.length === 0 && <p className="py-16 text-center text-carbon-500">Este restaurante aún no publica su menú.</p>}
            {sections.length > 0 && shown.length === 0 && <p className="py-16 text-center text-carbon-500">No encontramos “{search}” en el menú.</p>}
            {shown.map((s) => (
              <section key={s.id} id={'cat-' + s.id} className="pt-3 first:pt-1">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="font-display text-xl font-extrabold tracking-tight sm:text-2xl">{s.name}</h2>
                  <span className="text-[12px] font-semibold text-carbon-400">{s.items.length} {s.items.length === 1 ? 'platillo' : 'platillos'}</span>
                </div>
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
                  {s.items.map((p) => <ProductCard key={p.id} p={p} brand={brand} qty={qtyOf(p.id)} canAdd={store.open} onClick={() => setPicked(p)} />)}
                </div>
              </section>
            ))}
            <footer className="mt-12 border-t border-carbon-200 py-8 text-center text-[12px] text-carbon-400">
              Pedidos en línea con <a href="https://donpunto.com" className="font-semibold text-carbon-600 hover:underline">Don Punto</a>
            </footer>
          </main>
        </div>

        {/* Carrito lateral (escritorio) */}
        <aside className="relative z-10 hidden lg:sticky lg:top-6 lg:mt-6 lg:block">
          <CartPanel store={store} mode={mode} setMode={setMode} cart={validCart} prodMap={prodMap} groupMap={groupMap} lineUnit={lineUnit}
            subtotal={subtotal} count={count} setQty={setQty} onCheckout={() => setCheckout(true)} />
        </aside>
      </div>

      {/* Barra del carrito (celular / tablet) */}
      {count > 0 && !checkout && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
          <button onClick={() => setCheckout(true)} className="mx-auto flex w-full max-w-xl items-center justify-between rounded-2xl px-5 py-4 text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.99]" style={{ background: brand }}>
            <span className="flex items-center gap-3 font-bold"><span className="grid h-7 min-w-7 place-items-center rounded-lg bg-white/20 px-1.5 text-sm">{count}</span>Ver mi pedido</span>
            <span className="font-black">{money(subtotal)}</span>
          </button>
        </div>
      )}

      {picked && <ProductSheet p={picked} groups={groupMap} brand={brand} canAdd={store.open} onClose={() => setPicked(null)} onAdd={(l) => { addLine(l); setPicked(null); }} />}
      {checkout && (
        <Checkout store={store} slug={slug} mode={mode} setMode={setMode} cart={validCart} prodMap={prodMap} groupMap={groupMap} lineUnit={lineUnit} subtotal={subtotal}
          setQty={setQty} onClose={() => setCheckout(false)}
          onDone={(t, n) => { setCart([]); ls.set(`dpstore:${slug}:last`, { t, n, at: Date.now() }); onOrdered(t); }} />
      )}
    </div>
  );
}

/** "Lunes a Viernes 9 a 6, Sábado 9 a 2" → una línea por día (corta antes de cada día en mayúscula). */
function hoursLines(h: string) {
  return h.replace(/\s+/g, ' ').split(/[,.;]\s+(?=[A-ZÁÉÍÓÚ])/).map((x) => x.trim()).filter(Boolean);
}

function fmtPhone(p: string) {
  const d = p.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : p;
}

function Info({ Icon, label, href, className = '', children }: { Icon: typeof Clock; label: string; href?: string; className?: string; children: React.ReactNode }) {
  const body = (
    <>
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-carbon-50 text-carbon-500"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-carbon-400">{label}</span>
        <span className="block text-[13.5px] leading-snug text-carbon-700">{children}</span>
      </span>
    </>
  );
  const cls = `flex items-start gap-3 bg-white px-4 py-3 ${className}`;
  return href
    ? <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls + ' transition-colors hover:bg-carbon-50'}>{body}</a>
    : <div className={cls}>{body}</div>;
}

function ProductCard({ p, brand, qty, canAdd, onClick }: { p: PProduct; brand: string; qty: number; canAdd: boolean; onClick: () => void }) {
  return (
    <button disabled={p.soldOut} onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-carbon-100 transition-all hover:-translate-y-px hover:shadow-[0_10px_30px_-16px_rgba(13,16,14,0.35)] hover:ring-carbon-200 disabled:pointer-events-none disabled:opacity-50"
      style={qty > 0 ? { boxShadow: `inset 0 0 0 2px ${brand}` } : undefined}>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {qty > 0 && <span className="mt-0.5 grid h-5 min-w-5 place-items-center rounded-md px-1 text-[11px] font-black text-white" style={{ background: brand }}>{qty}</span>}
          <h3 className="font-semibold leading-snug text-carbon-900">{p.name}</h3>
        </div>
        {p.description && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-carbon-500">{p.description}</p>}
        <p className="mt-1.5 text-[15px] font-bold">{p.soldOut ? <span className="text-carbon-500">Agotado hoy</span> : money(p.price)}</p>
      </div>
      {p.photo ? (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-carbon-100">
          <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
          {!p.soldOut && canAdd && <span className="absolute bottom-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-full bg-white shadow-md"><Plus className="h-4 w-4" style={{ color: brand }} /></span>}
        </div>
      ) : (!p.soldOut && canAdd && (
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--brand)_9%,white)] text-[var(--brand)] transition-colors group-hover:bg-[var(--brand)] group-hover:text-white">
          <Plus className="h-[18px] w-[18px]" />
        </span>
      ))}
    </button>
  );
}

function CartPanel(props: {
  store: PStore; mode: 'pickup' | 'delivery'; setMode: (m: 'pickup' | 'delivery') => void; cart: CartLine[]; prodMap: Map<string, PProduct>; groupMap: Map<string, PGroup>;
  lineUnit: (l: CartLine) => number; subtotal: number; count: number; setQty: (k: string, q: number) => void; onCheckout: () => void;
}) {
  const { store, mode, setMode, cart, prodMap, groupMap, lineUnit, subtotal, count, setQty, onCheckout } = props;
  const fee = mode === 'delivery' ? store.deliveryFee : 0;
  const belowMin = mode === 'delivery' && store.minOrder > 0 && subtotal < store.minOrder;
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[0_12px_40px_-18px_rgba(13,16,14,0.35)] ring-1 ring-black/5">
      <div className="flex items-center justify-between border-b border-carbon-100 px-5 py-4">
        <h2 className="font-display text-lg font-extrabold">Tu pedido</h2>
        {count > 0 && <span className="rounded-full bg-carbon-100 px-2.5 py-0.5 text-[12px] font-bold text-carbon-600">{count} {count === 1 ? 'artículo' : 'artículos'}</span>}
      </div>
      {(store.pickup || store.delivery) && <div className="px-5 pb-1"><ModeSwitch store={store} mode={mode} setMode={setMode} /></div>}
      {cart.length === 0 ? (
        <div className="flex flex-col items-center px-6 pb-6 pt-7 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-carbon-50 text-carbon-400"><ShoppingBag className="h-6 w-6" /></span>
          <p className="mt-3 font-semibold text-carbon-700">Tu pedido está vacío</p>
          <p className="mt-1 text-[13px] text-carbon-500">Elige platillos del menú para empezar.</p>
        </div>
      ) : (
        <>
          <div className="max-h-[42vh] divide-y divide-carbon-100 overflow-y-auto px-5 py-2">
            {cart.map((l) => {
              const p = prodMap.get(l.id)!;
              const mods = p.groups.flatMap((g) => groupMap.get(g)?.options.filter((o) => l.mods[g]?.includes(o.id)).map((o) => o.name) || []);
              return (
                <div key={l.key} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold leading-snug">{p.name}</p>
                    {mods.length > 0 && <p className="text-[12px] text-carbon-500">{mods.join(', ')}</p>}
                    {l.note && <p className="text-[12px] italic text-carbon-500">“{l.note}”</p>}
                    <p className="mt-0.5 text-[13px] font-bold">{money(lineUnit(l) * l.qty)}</p>
                  </div>
                  <Stepper qty={l.qty} setQty={(n) => setQty(l.key, n)} small />
                </div>
              );
            })}
          </div>
          <div className="space-y-1.5 border-t border-carbon-100 px-5 py-4 text-[14px]">
            <Row k="Subtotal" v={money(subtotal)} />
            {mode === 'delivery' && <Row k="Envío" v={fee ? money(fee) : 'Gratis'} />}
            <div className="flex justify-between pt-1 text-base font-black"><span>Total</span><span>{money(subtotal + fee)}</span></div>
            {belowMin && <p className="pt-1 text-[12px] font-semibold text-amber-700">Pedido mínimo a domicilio: {money(store.minOrder)}</p>}
          </div>
        </>
      )}
      <div className="px-5 pb-5">
        <button disabled={!cart.length || !store.open} onClick={onCheckout} className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-white transition-opacity hover:opacity-95 disabled:bg-carbon-100 disabled:text-carbon-400" style={cart.length && store.open ? { background: store.color } : undefined}>
          {!store.open ? 'Cerrado por ahora' : cart.length ? <>Continuar · {money(subtotal + fee)}</> : 'Agrega algo para continuar'}
        </button>
      </div>
    </div>
  );
}

function ModeSwitch({ store, mode, setMode }: { store: PStore; mode: 'pickup' | 'delivery'; setMode: (m: 'pickup' | 'delivery') => void }) {
  const opts = [
    store.pickup && { k: 'pickup' as const, label: 'Recoger en tienda', sub: store.prepMinutes ? `Listo en ~${store.prepMinutes} min` : 'Sin costo', Icon: StoreIcon },
    store.delivery && { k: 'delivery' as const, label: 'A domicilio', sub: store.deliveryFee ? `Envío ${money(store.deliveryFee)}` : 'Envío gratis', Icon: Bike },
  ].filter(Boolean) as { k: 'pickup' | 'delivery'; label: string; sub: string; Icon: typeof Bike }[];
  return (
    <div className="mt-5">
      <div className={`grid gap-2 ${opts.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {opts.map(({ k, label, sub, Icon }) => (
          <button key={k} onClick={() => setMode(k)} className={`flex items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors ${mode === k ? '' : 'border-carbon-100 bg-white'}`}
            style={mode === k ? { borderColor: store.color, background: store.color + '0f' } : undefined}>
            <Icon className="w-5 h-5 shrink-0" style={{ color: mode === k ? store.color : '#8a8f8b' }} />
            <span className="min-w-0"><span className="block text-[13px] font-bold leading-tight">{label}</span><span className="block text-[11px] text-carbon-500">{sub}</span></span>
          </button>
        ))}
      </div>
      {mode === 'delivery' && (
        <p className="mt-2 text-[12px] text-carbon-500">Entregamos hasta {store.radiusKm} km a la redonda.{store.minOrder > 0 && <> Pedido mínimo {money(store.minOrder)}.</>}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- platillo
function ProductSheet({ p, groups, brand, canAdd, onClose, onAdd }: { p: PProduct; groups: Map<string, PGroup>; brand: string; canAdd: boolean; onClose: () => void; onAdd: (l: Omit<CartLine, 'key'>) => void }) {
  const gs = p.groups.map((g) => groups.get(g)).filter(Boolean) as PGroup[];
  const [mods, setMods] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const toggle = (g: PGroup, id: string) => setMods((m) => {
    const cur = m[g.id] || [];
    if (g.type === 'single') return { ...m, [g.id]: cur[0] === id && !(g.min || 0) ? [] : [id] };
    if (cur.includes(id)) return { ...m, [g.id]: cur.filter((x) => x !== id) };
    if (g.max && cur.length >= g.max) return m;
    return { ...m, [g.id]: [...cur, id] };
  });
  const missing = gs.find((g) => (mods[g.id]?.length || 0) < (g.min || 0));
  const unit = p.price + gs.reduce((a, g) => a + g.options.filter((o) => mods[g.id]?.includes(o.id)).reduce((x, o) => x + o.price, 0), 0);
  return (
    <Sheet onClose={onClose}>
      {p.photo && <img src={p.photo} alt="" className="h-60 w-full object-cover sm:rounded-t-3xl" />}
      <div className="p-5">
        <h3 className="font-display text-2xl font-extrabold tracking-tight">{p.name}</h3>
        {p.description && <p className="mt-1.5 text-[14px] text-carbon-600">{p.description}</p>}
        <p className="mt-2 text-lg font-bold">{money(p.price)}</p>
        {gs.map((g) => (
          <div key={g.id} className="mt-5">
            <div className="flex items-baseline justify-between">
              <h4 className="font-bold">{g.name}</h4>
              <span className="text-[11px] font-semibold text-carbon-500">{g.min ? 'Obligatorio' : 'Opcional'}{g.type === 'multiple' && g.max ? ` · hasta ${g.max}` : ''}</span>
            </div>
            <div className="mt-2 divide-y divide-carbon-100 rounded-2xl border border-carbon-100">
              {g.options.map((o) => {
                const on = !!mods[g.id]?.includes(o.id);
                return (
                  <button key={o.id} onClick={() => toggle(g, o.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <span className={`grid h-5 w-5 place-items-center border-2 ${g.type === 'single' ? 'rounded-full' : 'rounded-md'}`} style={{ borderColor: on ? brand : '#cfd3cf', background: on ? brand : 'transparent' }}>{on && <Check className="w-3 h-3 text-white" strokeWidth={4} />}</span>
                    <span className="flex-1 text-[14px]">{o.name}</span>
                    {o.price > 0 && <span className="text-[13px] text-carbon-500">+{money(o.price)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <label className="mt-5 block">
          <span className="font-bold">Indicaciones</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Ej. sin cebolla" className="mt-2 w-full rounded-xl border border-carbon-200 px-4 py-3 text-[14px] outline-none focus:border-carbon-400" />
        </label>
      </div>
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-carbon-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Stepper qty={qty} setQty={(n) => setQty(Math.max(1, n))} />
        <button disabled={!canAdd || !!missing} onClick={() => onAdd({ id: p.id, qty, mods, note: note.trim() })} className="flex-1 rounded-2xl py-3.5 font-bold text-white disabled:opacity-40" style={{ background: brand }}>
          {!canAdd ? 'Cerrado por ahora' : missing ? `Elige ${missing.name.toLowerCase()}` : `Agregar · ${money(unit * qty)}`}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- pagar
function Checkout(props: {
  store: PStore; slug: string; mode: 'pickup' | 'delivery'; setMode: (m: 'pickup' | 'delivery') => void; cart: CartLine[];
  prodMap: Map<string, PProduct>; groupMap: Map<string, PGroup>; lineUnit: (l: CartLine) => number; subtotal: number;
  setQty: (k: string, q: number) => void; onClose: () => void; onDone: (t: string, n: number) => void;
}) {
  const { store, slug, mode, cart, prodMap, groupMap, lineUnit, subtotal, setQty, onClose, onDone } = props;
  const saved = ls.get('dpstore:customer', { name: '', phone: '', address: '' });
  const [name, setName] = useState(saved.name);
  const [phone, setPhone] = useState(saved.phone);
  const [address, setAddress] = useState(saved.address);
  const [notes, setNotes] = useState('');
  const opts = payOptions(store, mode);
  const [payPick, setPayment] = useState<'cash' | 'codi'>(opts[0] || 'cash');
  const payment = opts.includes(payPick) ? payPick : opts[0] || 'cash';
  // Al cambiar recoger/domicilio vuelve a la forma de pago principal (a domicilio: CoDi primero)
  useEffect(() => { setPayment(payOptions(store, mode)[0] || 'cash'); }, [store, mode]);
  const savedLoc = ls.get<{ lat: number; lng: number } | null>('dpstore:loc', null);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(savedLoc);
  const [locBusy, setLocBusy] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ label: string; full: string; lat: number; lng: number }[]>([]);
  const dist = loc && store.lat != null && store.lng != null ? distKm(store.lat, store.lng, loc.lat, loc.lng) : null;
  const outOfZone = mode === 'delivery' && dist != null && dist > store.radiusKm;
  const pickLoc = (l: { lat: number; lng: number }) => { setLoc(l); ls.set('dpstore:loc', l); setResults([]); setLocErr(''); };
  const useGPS = () => {
    if (!navigator.geolocation) return setLocErr('Tu navegador no permite ubicación. Busca tu dirección.');
    setLocBusy(true); setLocErr('');
    navigator.geolocation.getCurrentPosition(async (p) => {
      const l = { lat: p.coords.latitude, lng: p.coords.longitude };
      pickLoc(l);
      try {
        const r = await getJSON<{ address: string }>(`/api/order?rev=${l.lat},${l.lng}`);
        if (r.address && !address.trim()) setAddress(r.address);
      } catch { /* la dirección la escribe el cliente */ }
      setLocBusy(false);
    }, (e) => { setLocBusy(false); setLocErr(e.code === 1 ? 'No diste permiso de ubicación. Busca tu dirección abajo.' : 'No se pudo obtener tu ubicación. Busca tu dirección.'); }, { enableHighAccuracy: true, timeout: 12000 });
  };
  const search = async () => {
    if (query.trim().length < 4) return;
    setLocBusy(true); setLocErr('');
    try {
      const r = await getJSON<{ results: { label: string; full: string; lat: number; lng: number }[] }>(`/api/order?geo=${encodeURIComponent(query)}&slug=${slug}`);
      setResults(r.results);
      if (!r.results.length) setLocErr('No encontramos esa dirección. Prueba con calle y colonia, o usa tu ubicación.');
    } catch (e: any) { setLocErr(e.message); }
    setLocBusy(false);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const hp = useRef<HTMLInputElement>(null);
  const fee = mode === 'delivery' ? store.deliveryFee : 0;
  const total = subtotal + fee;
  const belowMin = mode === 'delivery' && store.minOrder > 0 && subtotal < store.minOrder;

  const submit = async () => {
    setErr('');
    if (name.trim().length < 2) return setErr('Escribe tu nombre.');
    if (phone.replace(/\D/g, '').length < 10) return setErr('Escribe tu teléfono a 10 dígitos.');
    if (mode === 'delivery' && !loc) return setErr('Confirma tu ubicación: toca "Usar mi ubicación" o busca tu dirección.');
    if (outOfZone) return setErr(`Estás a ${dist!.toFixed(1)} km. Este restaurante entrega hasta ${store.radiusKm} km.`);
    if (mode === 'delivery' && address.trim().length < 8) return setErr('Escribe tu dirección completa (calle, número, colonia).');
    setBusy(true);
    ls.set('dpstore:customer', { name: name.trim(), phone: phone.trim(), address: address.trim() });
    try {
      const r = await getJSON<{ token: string; number: number }>('/api/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', slug, type: mode, payment, name, phone, address, notes, ...(mode === 'delivery' && loc ? { lat: loc.lat, lng: loc.lng } : {}), website: hp.current?.value || '', items: cart.map((l) => ({ id: l.id, qty: l.qty, mods: l.mods, note: l.note })) }),
      });
      onDone(r.token, r.number);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} full>
      <div className="flex items-center gap-2 border-b border-carbon-100 px-3 py-3">
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-carbon-100"><ChevronLeft className="w-5 h-5" /></button>
        <h3 className="font-display text-lg font-extrabold">Tu pedido</h3>
      </div>
      <div className="space-y-6 p-5">
        <div className="divide-y divide-carbon-100">
          {cart.map((l) => {
            const p = prodMap.get(l.id)!;
            const mods = p.groups.flatMap((g) => groupMap.get(g)?.options.filter((o) => l.mods[g]?.includes(o.id)).map((o) => o.name) || []);
            return (
              <div key={l.key} className="flex items-start gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug">{p.name}</p>
                  {mods.length > 0 && <p className="text-[12px] text-carbon-500">{mods.join(', ')}</p>}
                  {l.note && <p className="text-[12px] italic text-carbon-500">“{l.note}”</p>}
                  <p className="mt-1 text-[14px] font-bold">{money(lineUnit(l) * l.qty)}</p>
                </div>
                <Stepper qty={l.qty} setQty={(n) => setQty(l.key, n)} small />
              </div>
            );
          })}
        </div>

        {(store.pickup && store.delivery) && <ModeSwitch store={store} mode={mode} setMode={props.setMode} />}

        <div className="space-y-3">
          <h4 className="font-bold">Tus datos</h4>
          <Field label="Nombre" value={name} onChange={setName} autoComplete="name" />
          <Field label="Teléfono (10 dígitos)" value={phone} onChange={setPhone} type="tel" autoComplete="tel" />
          {mode === 'delivery' && (
            <div className="space-y-3 rounded-2xl border border-carbon-200 p-4">
              <p className="text-[13px] font-semibold text-carbon-600">¿Dónde te lo llevamos? <span className="font-normal text-carbon-500">(entregan hasta {store.radiusKm} km)</span></p>
              <button type="button" onClick={useGPS} disabled={locBusy} className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-60" style={{ background: store.color }}>
                {locBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}Usar mi ubicación actual
              </button>
              <div className="flex gap-2">
                <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), search())} placeholder="o busca: calle, número y colonia" className="min-w-0 flex-1 rounded-xl border border-carbon-200 px-3 py-2.5 text-[14px] outline-none focus:border-carbon-500" />
                <button type="button" onClick={search} disabled={locBusy} className="grid w-11 place-items-center rounded-xl border border-carbon-200" aria-label="Buscar"><Search className="w-4 h-4" /></button>
              </div>
              {results.length > 0 && (
                <div className="divide-y divide-carbon-100 rounded-xl border border-carbon-200">
                  {results.map((r, i) => {
                    const d = store.lat != null && store.lng != null ? distKm(store.lat, store.lng, r.lat, r.lng) : 0;
                    return (
                      <button type="button" key={i} onClick={() => { pickLoc({ lat: r.lat, lng: r.lng }); if (!address.trim()) setAddress(r.label); }} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-[13px]">
                        <MapPin className="mt-0.5 w-4 h-4 shrink-0 text-carbon-400" />
                        <span className="flex-1">{r.label}<span className={`block text-[11px] ${d > store.radiusKm ? 'text-red-600' : 'text-carbon-500'}`}>{d.toFixed(1)} km{d > store.radiusKm ? ' · fuera de zona' : ''}</span></span>
                      </button>
                    );
                  })}
                </div>
              )}
              {locErr && <p className="text-[12px] font-semibold text-amber-700">{locErr}</p>}
              {loc && dist != null && (
                <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold ${outOfZone ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                  {outOfZone ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                  {outOfZone ? `Estás a ${dist.toFixed(1)} km: fuera de su zona (máx. ${store.radiusKm} km).${store.pickup ? ' Puedes pedir para recoger.' : ''}` : `Ubicación confirmada · estás a ${dist.toFixed(1)} km`}
                </p>
              )}
              <Field label="Dirección y referencias (calle, número, colonia, color de la casa)" value={address} onChange={setAddress} textarea autoComplete="street-address" />
            </div>
          )}
          <Field label="Comentarios para el restaurante (opcional)" value={notes} onChange={setNotes} />
          <input ref={hp} name="website" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
        </div>

        <div className="space-y-2">
          <h4 className="font-bold">¿Cómo vas a pagar?</h4>
          {opts.includes('codi') && (
            <PayOpt on={payment === 'codi'} brand={store.color} onClick={() => setPayment('codi')} Icon={QrCode}
              title="CoDi / transferencia" sub="Pagas desde la app de tu banco con el QR o la CLABE" />
          )}
          {opts.includes('cash') && (
            <PayOpt on={payment === 'cash'} brand={store.color} onClick={() => setPayment('cash')} Icon={Banknote}
              title={mode === 'delivery' ? 'Efectivo al recibir (solicitud)' : 'Al recoger en tienda'}
              sub={mode === 'delivery' ? 'El restaurante debe aprobarlo; si no, te pedirá pagar con CoDi' : 'Efectivo o tarjeta en el momento'} />
          )}
          {opts.length === 0 && <p className="text-[13px] text-amber-700">Esta forma de entrega no tiene pago disponible.</p>}
        </div>

        <div className="space-y-1.5 rounded-2xl bg-carbon-50 p-4 text-[14px]">
          <Row k="Subtotal" v={money(subtotal)} />
          {mode === 'delivery' && <Row k="Envío" v={fee ? money(fee) : 'Gratis'} />}
          <div className="flex justify-between border-t border-carbon-200 pt-2 text-base font-black"><span>Total</span><span>{money(total)}</span></div>
        </div>
        {belowMin && <p className="text-[13px] font-semibold text-amber-700">El pedido mínimo a domicilio es de {money(store.minOrder)}.</p>}
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{err}</p>}
      </div>
      <div className="sticky bottom-0 border-t border-carbon-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button disabled={busy || !store.open || belowMin || !cart.length || outOfZone || !opts.length} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white disabled:opacity-40" style={{ background: store.color }}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
          {!store.open ? 'El restaurante está cerrado' : `Enviar pedido · ${money(total)}`}
        </button>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- seguimiento
interface POrder {
  number: number; status: string; reason: string; type: 'pickup' | 'delivery'; payment: 'cash' | 'codi'; paymentStatus: string; payChanged?: boolean;
  subtotal: number; deliveryFee: number; total: number; created: string; customerName: string;
  items: { name: string; quantity: number; line: number; mods: string[]; note: string }[];
  store: { slug: string; name: string; phone: string; address: string; color: string; logo: string | null; prepMinutes: number };
  codi: { clabe: string; bank: string; holder: string; qr: string | null } | null;
}

function Tracking({ slug, token, onBack }: { slug: string; token: string; onBack: () => void }) {
  const [o, setO] = useState<POrder | null>(null);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const load = useCallback(() => getJSON<POrder>(`/api/order?t=${token}`).then((x) => { setO(x); setErr(''); }).catch((e) => setErr(e.message)), [token]);
  useEffect(() => {
    load();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 8000);
    return () => clearInterval(iv);
  }, [load]);
  useEffect(() => { if (o) document.title = `Pedido #${o.number} · ${o.store.name}`; }, [o]);
  useThemeColor(o?.store.color || '#FAFAF7');

  if (err && !o) return <Centered><AlertCircle className="w-10 h-10 text-carbon-400" /><p className="mt-3 font-semibold">{err}</p><button onClick={onBack} className="mt-6 text-sm underline">Volver al menú</button></Centered>;
  if (!o) return <Centered><Loader2 className="w-8 h-8 animate-spin text-carbon-400" /></Centered>;

  const brand = o.store.color;
  const steps = ['new', 'accepted', o.type === 'delivery' ? 'on_way' : 'ready', 'done'];
  const cur = o.status === 'ready' && o.type === 'delivery' ? 1.5 : steps.indexOf(o.status);
  const rejected = o.status === 'rejected';
  const stepLabel = (s: string) => (s === 'new' ? 'Recibido' : s === 'accepted' ? 'Preparando' : s === 'ready' ? 'Listo para recoger' : s === 'on_way' ? 'En camino' : 'Entregado');
  const headline = rejected ? 'El restaurante no pudo aceptar tu pedido'
    : o.status === 'new' ? (o.type === 'delivery' && o.payment === 'cash' ? 'Esperando que el restaurante acepte tu pago en efectivo' : 'Esperando que el restaurante confirme')
    : o.status === 'accepted' ? 'Están preparando tu pedido'
    : o.status === 'ready' ? (o.type === 'pickup' ? '¡Tu pedido está listo! Pasa por él' : 'Tu pedido está listo y saldrá pronto')
    : o.status === 'on_way' ? 'Tu pedido va en camino' : '¡Pedido entregado! Buen provecho';
  const copy = () => { navigator.clipboard?.writeText(o.codi?.clabe || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }); };
  const reportPaid = async () => {
    setPaying(true);
    try { await getJSON('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'paid', t: token }) }); await load(); } catch (e: any) { alert(e.message); }
    setPaying(false);
  };

  return (
    <div className="min-h-screen bg-[#F6F5F1] text-carbon-900">
      <div className="mx-auto max-w-2xl bg-white min-h-screen shadow-[0_0_0_1px_rgba(13,16,14,0.06)]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-carbon-100">
          <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full hover:bg-carbon-100"><ChevronLeft className="w-5 h-5" /></button>
          {o.store.logo && <img src={o.store.logo} alt="" className="h-9 w-9 rounded-xl object-cover" />}
          <span className="font-bold">{o.store.name}</span>
        </div>
        <div className="p-5 space-y-6">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-widest text-carbon-500">Pedido #{o.number} · {o.type === 'delivery' ? 'A domicilio' : 'Para recoger'}</p>
            <h1 className="mt-1 font-display text-[26px] leading-tight font-extrabold tracking-tight">{headline}</h1>
            {rejected && o.reason && <p className="mt-2 text-carbon-600">Motivo: {o.reason}</p>}
            {!rejected && o.status === 'accepted' && o.store.prepMinutes > 0 && <p className="mt-1 text-carbon-600">Tiempo aproximado: {o.store.prepMinutes} min</p>}
          </div>
          {!rejected && (
            <ol className="grid grid-cols-4 gap-2">
              {steps.map((s, i) => {
                const done = i <= cur;
                return (
                  <li key={s} className="text-center">
                    <div className="h-1.5 rounded-full transition-colors duration-500" style={{ background: done ? brand : '#e6e8e5' }} />
                    <p className={`mt-2 text-[11px] font-semibold ${done ? 'text-carbon-900' : 'text-carbon-400'}`}>{stepLabel(s)}</p>
                  </li>
                );
              })}
            </ol>
          )}

          {o.codi && !rejected && o.status === 'new' && o.paymentStatus === 'pending' && (
            <div className="flex gap-3 rounded-2xl bg-carbon-50 p-4 text-[13px] text-carbon-700"><QrCode className="w-5 h-5 shrink-0 text-carbon-500" /><span>Cuando el restaurante acepte tu pedido, aquí aparecen los datos para pagar con CoDi. No pagues antes.</span></div>
          )}
          {o.codi && !rejected && (o.status !== 'new' || o.paymentStatus !== 'pending') && (
            <div className="rounded-3xl border-2 p-5" style={{ borderColor: brand + '55', background: brand + '08' }}>
              {o.paymentStatus === 'paid' ? (
                <p className="flex items-center gap-2 font-bold text-emerald-700"><Check className="w-5 h-5" />Pago confirmado por el restaurante</p>
              ) : (
                <>
                  {o.payChanged && <p className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">El restaurante aceptó tu pedido y te pide pagar con CoDi en lugar de efectivo.</p>}
                  <h2 className="font-display text-lg font-extrabold">Paga con CoDi o transferencia</h2>
                  <p className="mt-1 text-[13px] text-carbon-600">Abre la app de tu banco, escanea el QR o usa la CLABE. Monto exacto y concepto:</p>
                  <div className="mt-3 flex items-baseline justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-carbon-100">
                    <span className="text-[13px] text-carbon-500">Pedido #{o.number}</span><span className="text-2xl font-black">{money(o.total)}</span>
                  </div>
                  {o.codi.qr && <><img src={o.codi.qr} alt="QR CoDi" className="mx-auto mt-4 w-56 max-w-full rounded-2xl bg-white p-2 ring-1 ring-carbon-100" /><p className="mt-2 text-center text-[12px] text-carbon-500">¿Estás en el celular? Toma captura del QR y ábrela desde la app de tu banco, o copia la CLABE.</p></>}
                  {o.codi.clabe && (
                    <button onClick={copy} className="mt-4 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-carbon-100">
                      <span><span className="block text-[11px] font-bold uppercase tracking-wider text-carbon-500">CLABE{o.codi.bank ? ` · ${o.codi.bank}` : ''}</span><span className="font-mono text-[15px] font-bold tracking-wide">{o.codi.clabe}</span>{o.codi.holder && <span className="block text-[12px] text-carbon-500">{o.codi.holder}</span>}</span>
                      <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: brand }}>{copied ? <><Check className="w-4 h-4" />Copiada</> : <><Copy className="w-4 h-4" />Copiar</>}</span>
                    </button>
                  )}
                  {o.paymentStatus === 'reported' ? (
                    <p className="mt-4 rounded-xl bg-white px-4 py-3 text-[13px] font-semibold text-carbon-700 ring-1 ring-carbon-100">Le avisamos al restaurante. En cuanto vea tu pago lo confirma aquí.</p>
                  ) : (
                    <button disabled={paying} onClick={reportPaid} className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-white disabled:opacity-50" style={{ background: brand }}>
                      {paying && <Loader2 className="w-4 h-4 animate-spin" />}Ya pagué
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          <div>
            <h3 className="font-bold">Resumen</h3>
            <div className="mt-2 divide-y divide-carbon-100 text-[14px]">
              {o.items.map((i, k) => (
                <div key={k} className="flex justify-between gap-3 py-2.5">
                  <span><span className="font-semibold">{i.quantity}× {i.name}</span>{i.mods.length > 0 && <span className="block text-[12px] text-carbon-500">{i.mods.join(', ')}</span>}{i.note && <span className="block text-[12px] italic text-carbon-500">“{i.note}”</span>}</span>
                  <span className="font-semibold">{money(i.line)}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 space-y-1 border-t border-carbon-200 pt-3 text-[14px]">
              {o.deliveryFee > 0 && <Row k="Envío" v={money(o.deliveryFee)} />}
              <div className="flex justify-between text-base font-black"><span>Total</span><span>{money(o.total)}</span></div>
              <p className="text-[12px] text-carbon-500">{o.payment === 'codi' ? 'Pago por CoDi / transferencia' : o.type === 'delivery' ? (o.status === 'new' ? 'Pediste pagar en efectivo al recibir (pendiente de aprobación)' : 'Pagas en efectivo al recibir') : 'Pagas al recoger'}</p>
            </div>
          </div>
          {o.store.phone && <a href={`tel:${o.store.phone.replace(/\s/g, '')}`} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-carbon-200 py-3.5 font-bold"><Phone className="w-4 h-4" />Llamar al restaurante</a>}
          {o.type === 'pickup' && o.store.address && <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(o.store.address)}`} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-carbon-200 py-3.5 font-bold"><MapPin className="w-4 h-4" />Cómo llegar</a>}
          <p className="text-center text-[12px] text-carbon-400">Guarda esta página para ver cómo va tu pedido · {STATUS_LABEL[o.status]} <br /><a href={`/${slug}`} className="underline">Volver al menú</a></p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- piezas
function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen grid place-items-center bg-[#F6F5F1] p-8 text-center"><div className="flex flex-col items-center">{children}</div></div>;
}
function Sheet({ children, onClose, full }: { children: React.ReactNode; onClose: () => void; full?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/45 animate-[fadeIn_.2s_ease-out]" onClick={onClose} />
      <div className={`relative w-full max-w-lg overflow-y-auto bg-white shadow-2xl animate-[sheetUp_.28s_cubic-bezier(.2,.8,.2,1)] ${full ? 'h-[100dvh] sm:h-[90vh] sm:rounded-3xl' : 'max-h-[92dvh] rounded-t-3xl sm:rounded-3xl'}`}>
        {!full && <button onClick={onClose} aria-label="Cerrar" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-white/90 shadow"><X className="w-4 h-4" /></button>}
        {children}
      </div>
    </div>
  );
}
function Stepper({ qty, setQty, small }: { qty: number; setQty: (n: number) => void; small?: boolean }) {
  const b = small ? 'h-8 w-8' : 'h-11 w-11';
  return (
    <div className="flex items-center rounded-full bg-carbon-100">
      <button onClick={() => setQty(qty - 1)} className={`grid ${b} place-items-center`} aria-label="Menos"><Minus className="w-4 h-4" /></button>
      <span className="w-6 text-center font-bold">{qty}</span>
      <button onClick={() => setQty(qty + 1)} className={`grid ${b} place-items-center`} aria-label="Más"><Plus className="w-4 h-4" /></button>
    </div>
  );
}
function Field({ label, value, onChange, type = 'text', textarea, autoComplete }: { label: string; value: string; onChange: (v: string) => void; type?: string; textarea?: boolean; autoComplete?: string }) {
  const cls = 'mt-1 w-full rounded-xl border border-carbon-200 px-4 py-3 text-[15px] outline-none focus:border-carbon-500';
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-carbon-600">{label}</span>
      {textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} autoComplete={autoComplete} className={cls + ' resize-none'} /> : <input value={value} onChange={(e) => onChange(e.target.value)} type={type} autoComplete={autoComplete} className={cls} />}
    </label>
  );
}
function PayOpt({ on, brand, onClick, Icon, title, sub }: { on: boolean; brand: string; onClick: () => void; Icon: typeof QrCode; title: string; sub: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left" style={{ borderColor: on ? brand : '#ecedea', background: on ? brand + '0d' : 'white' }}>
      <Icon className="w-5 h-5" style={{ color: on ? brand : '#8a8f8b' }} />
      <span className="flex-1"><span className="block text-[14px] font-bold">{title}</span><span className="block text-[12px] text-carbon-500">{sub}</span></span>
      <span className="grid h-5 w-5 place-items-center rounded-full border-2" style={{ borderColor: on ? brand : '#cfd3cf', background: on ? brand : 'transparent' }}>{on && <Check className="w-3 h-3 text-white" strokeWidth={4} />}</span>
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between text-carbon-600"><span>{k}</span><span>{v}</span></div>;
}
