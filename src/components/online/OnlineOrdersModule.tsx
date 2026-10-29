// Pedidos en línea (panel del restaurante): pedidos entrantes, página pública, menú con fotos y cobro con CoDi.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Bike, Store as StoreIcon, Check, X, Printer, Phone, MapPin, ExternalLink, Copy, Image as ImageIcon, Loader2, Globe, QrCode, Banknote, Lock, Eye, EyeOff, Clock, ChefHat, PackageCheck, AlertTriangle, Upload, LocateFixed, Search } from 'lucide-react';
import { pb } from '../../lib/pocketbase';
import { buildMenu, compressImage, slugify, money, SLUG_RE, RESERVED_SLUGS, type OMenu } from '../../lib/onlineStore';
import { getPushState, enablePush, type PushState } from '../../lib/pwa';
import { InstallAppButton } from '../pwa/InstallApp';
import { useSession, isPro } from '../../lib/session';
import { usePOS } from '../../hooks/usePOS';
import { applySaleToInventory } from '../../lib/inventoryAuto';
import { apiPost } from '../../lib/api';
import { PrintArea } from '../print/PrintArea';
import { POSTicket } from '../pos/POSTicket';
import { runPrint } from '../../lib/print';
import type { ProductRowData, Category, ModifierGroup } from '../../types/calculator';
import type { CartItem, OrderDestination, POSPaymentMethod } from '../../types/pos';

type Rec = Record<string, any>;
interface WebOrder {
  id: string; number: number; customer_name: string; customer_phone: string; type: 'pickup' | 'delivery'; address: string; notes: string;
  items: { rowId: string; name: string; quantity: number; unit: number; line: number; customerNote?: string; selectedModifiers: CartItem['selectedModifiers'] }[];
  subtotal: number; delivery_fee: number; total: number; payment: 'cash' | 'codi'; payment_status: 'pending' | 'reported' | 'paid';
  status: 'new' | 'accepted' | 'ready' | 'on_way' | 'done' | 'rejected'; reason: string; sale_id: string; created: string;
  lat?: number; lng?: number; distance_km?: number; pay_changed?: boolean;
}

/** JSON con llaves ordenadas (y sin undefined/null) para comparar sin importar el orden */
function stableJSON(v: unknown): string {
  const norm = (x: any): any => Array.isArray(x) ? x.map(norm) : x && typeof x === 'object'
    ? Object.fromEntries(Object.keys(x).sort().filter((k) => x[k] !== undefined && x[k] !== null && x[k] !== '').map((k) => [k, norm(x[k])])) : x;
  return JSON.stringify(norm(v));
}
const fileUrl = (rec: Rec, name?: string) => (name ? pb.files.getURL(rec, name) : '');
const COLORS = ['#16803C', '#C2410C', '#B91C1C', '#1D4ED8', '#7C3AED', '#0F766E', '#A16207', '#111827'];

// ---------------------------------------------------------------- aviso sonoro + contador (toda la app)
let audioCtx: AudioContext | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', () => {
    try { audioCtx ||= new AudioContext(); audioCtx.resume(); } catch { /* sin audio */ }
  }, { passive: true });
}
export function chime() {
  try {
    audioCtx ||= new AudioContext();
    const t0 = audioCtx.currentTime;
    [880, 1175, 1568].forEach((f, i) => {
      const o = audioCtx!.createOscillator();
      const g = audioCtx!.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.16);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.16 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.16 + 0.5);
      o.connect(g).connect(audioCtx!.destination);
      o.start(t0 + i * 0.16);
      o.stop(t0 + i * 0.16 + 0.55);
    });
  } catch { /* el navegador no deja sonar sin un toque previo */ }
}

/** Pedidos nuevos sin atender. El timbre suena cada 5 s hasta que alguien acepte o rechace (o se silencie un rato). */
export function useIncomingOrders() {
  const [pending, setPending] = useState(0);
  const [latest, setLatest] = useState<{ number: number; name: string } | null>(null);
  const [mutedUntil, setMutedUntil] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const ring = () => { if (Date.now() >= mutedUntil) chime(); };
    const iv = setInterval(ring, 5000);
    return () => clearInterval(iv);
  }, [pending, mutedUntil]);
  useEffect(() => {
    const uid = pb.authStore.record?.id;
    if (!uid) return;
    let alive = true;
    const refresh = () => pb.collection('web_orders').getList(1, 1, { filter: pb.filter('owner = {:o} && status = "new"', { o: uid }), fields: 'id', requestKey: null })
      .then((r) => alive && setPending(r.totalItems)).catch(() => undefined);
    refresh();
    const poll = setInterval(refresh, 30_000); // por si se cae la conexión en tiempo real
    let unsub: (() => void) | undefined;
    pb.collection('web_orders').subscribe('*', (e) => {
      refresh();
      if (e.action === 'create') {
        chime();
        setLatest({ number: e.record.number, name: e.record.customer_name });
      }
    }).then((u) => { unsub = u; }).catch(() => undefined);
    return () => { alive = false; clearInterval(poll); unsub?.(); };
  }, []);
  const muted = mutedUntil > Date.now();
  return { pending, latest, muted, mute: (ms = 2 * 60_000) => { setMutedUntil(Date.now() + ms); setTimeout(() => setMutedUntil(0), ms); }, unmute: () => setMutedUntil(0), dismiss: () => setLatest(null) };
}

// ---------------------------------------------------------------- módulo
interface Props { rows: ProductRowData[]; categories: Category[]; modifierGroups: ModifierGroup[]; onNeedPin: () => void }
type Sub = 'orders' | 'page' | 'menu' | 'pay';

export function OnlineOrdersModule({ rows, categories, modifierGroups, onNeedPin }: Props) {
  const { operator } = useSession();
  const canEdit = operator?.role === 'dueno' || operator?.role === 'gerente';
  const { settings: posSettings } = usePOS();
  const [store, setStore] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<Sub>('orders');
  const uid = pb.authStore.record?.id as string;

  const load = useCallback(async () => {
    try {
      const s = await pb.collection('stores').getFirstListItem(pb.filter('owner = {:o}', { o: uid }), { requestKey: null });
      setStore(s);
    } catch (e: any) {
      if (e?.status === 404) setStore(null);
    } finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { load(); }, [load]);

  // El menú publicado sigue al Catálogo (precios, nombres, modificadores) sin perder fotos ni descripciones.
  // PocketBase reordena las llaves del JSON: comparar con llaves ordenadas, y solo cuando cambia el Catálogo.
  const storeRef = useRef(store);
  storeRef.current = store;
  const storeId = store?.id;
  useEffect(() => {
    const cur = storeRef.current;
    if (!cur || !canEdit) return;
    const next = buildMenu(rows, categories, modifierGroups, cur.menu as OMenu);
    if (stableJSON({ ...next, syncedAt: null }) === stableJSON({ ...(cur.menu || {}), syncedAt: null })) return;
    pb.collection('stores').update(cur.id, { menu: next }, { requestKey: 'menu-sync' }).then(setStore).catch(() => undefined);
  }, [storeId, rows, categories, modifierGroups, canEdit]);

  if (loading) return <div className="py-24 grid place-items-center"><Loader2 className="w-6 h-6 animate-spin text-carbon-400" /></div>;

  if (!store) {
    if (!canEdit) return <LockedNotice onNeedPin={onNeedPin} text="Para crear la página de pedidos en línea entra con el PIN del dueño." />;
    return <Setup uid={uid} suggestedName={posSettings.businessName || ''} phone={posSettings.businessPhone || ''} address={posSettings.businessAddress || ''} rows={rows} categories={categories} modifierGroups={modifierGroups} onCreated={setStore} />;
  }

  const link = `${window.location.origin}/${store.slug}`;
  const TABS: { k: Sub; label: string; Icon: typeof Bell; owner?: boolean }[] = [
    { k: 'orders', label: 'Pedidos', Icon: Bell },
    { k: 'page', label: 'Mi página', Icon: Globe, owner: true },
    { k: 'menu', label: 'Menú y fotos', Icon: ImageIcon, owner: true },
    { k: 'pay', label: 'Cobro y entrega', Icon: QrCode, owner: true },
  ];

  return (
    <div className="space-y-5 pb-28">
      <StoreHeader store={store} link={link} canEdit={canEdit} onChange={setStore} />
      <div className="flex gap-1 overflow-x-auto no-scrollbar rounded-2xl bg-white p-1 ring-1 ring-carbon-950/5 w-fit max-w-full">
        {TABS.map(({ k, label, Icon, owner }) => (
          <button key={k} onClick={() => (owner && !canEdit ? onNeedPin() : setSub(k))} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors ${sub === k ? 'bg-agave-600 text-white' : 'text-carbon-600 hover:bg-carbon-50'}`}>
            <Icon className="w-4 h-4" />{label}{owner && !canEdit && <Lock className="w-3 h-3 opacity-60" />}
          </button>
        ))}
      </div>
      {sub === 'orders' && <OrdersBoard store={store} rows={rows} />}
      {sub === 'page' && canEdit && <PageEditor store={store} onChange={setStore} />}
      {sub === 'menu' && canEdit && <MenuEditor store={store} onChange={setStore} categories={categories} />}
      {sub === 'pay' && canEdit && <PayEditor store={store} onChange={setStore} />}
    </div>
  );
}

function LockedNotice({ onNeedPin, text }: { onNeedPin: () => void; text: string }) {
  return (
    <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-carbon-950/5">
      <Lock className="mx-auto w-8 h-8 text-carbon-400" />
      <p className="mt-3 font-semibold text-carbon-800">{text}</p>
      <button onClick={onNeedPin} className="mt-5 rounded-xl bg-agave-600 px-5 py-2.5 text-sm font-bold text-white">Escribir PIN</button>
    </div>
  );
}

// ---------------------------------------------------------------- alta
function Setup({ uid, suggestedName, phone, address, rows, categories, modifierGroups, onCreated }: { uid: string; suggestedName: string; phone: string; address: string; rows: ProductRowData[]; categories: Category[]; modifierGroups: ModifierGroup[]; onCreated: (s: Rec) => void }) {
  const [name, setName] = useState(suggestedName);
  const [slug, setSlug] = useState(slugify(suggestedName));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = useSlugCheck(slug);
  const create = async () => {
    setErr('');
    if (!name.trim()) return setErr('Escribe el nombre de tu restaurante.');
    if (!check.ok) return setErr(check.msg || 'Elige otra dirección.');
    setBusy(true);
    try {
      const rec = await pb.collection('stores').create({
        owner: uid, slug, name: name.trim(), phone, address, color: COLORS[0], published: false, accepting: true,
        pickup: true, delivery: false, delivery_fee: 0, min_order: 0, prep_minutes: 20, pay_cash: true, pay_codi: false,
        menu: buildMenu(rows, categories, modifierGroups, null),
      });
      onCreated(rec);
    } catch (e: any) {
      setErr(e?.response?.data?.slug ? 'Esa dirección ya la usa otro restaurante.' : 'No se pudo crear. Intenta de nuevo.');
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <div className="rounded-3xl bg-white p-6 sm:p-8 ring-1 ring-carbon-950/5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-agave-50 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-agave-700">Incluido en tu plan</span>
        <h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-carbon-900">Tu propia página para recibir pedidos</h2>
        <p className="mt-2 text-carbon-600">Tus clientes ven tu menú con fotos y piden para recoger o a domicilio. Sin comisiones por pedido: el pedido te llega aquí y tú cobras directo.</p>
        <div className="mt-6 space-y-4">
          <label className="block"><span className="text-[13px] font-semibold text-carbon-600">Nombre del restaurante</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }} className="mt-1 w-full rounded-xl border border-carbon-200 px-4 py-3 outline-none focus:border-agave-500" placeholder="Café Veracruzano" />
          </label>
          <SlugField slug={slug} setSlug={setSlug} check={check} />
          {err && <p className="text-sm font-semibold text-red-600">{err}</p>}
          <button disabled={busy} onClick={create} className="flex items-center gap-2 rounded-xl bg-agave-600 px-6 py-3 font-bold text-white disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Crear mi página</button>
          <p className="text-[12px] text-carbon-500">Después agregas logo, fotos y cómo cobras. Nadie la ve hasta que la publiques.</p>
        </div>
      </div>
      <ul className="space-y-3 self-center">
        {[
          ['Tu menú del Catálogo', 'Mismos precios que en caja. Si cambias un precio, tu página se actualiza sola.'],
          ['Recoger o a domicilio', 'Tú decides si haces entregas, cuánto cobras de envío y el pedido mínimo.'],
          ['Cobro con CoDi', 'Tu cliente paga desde la app de su banco y el dinero llega directo a tu cuenta.'],
          ['Aviso al instante', 'Suena aquí y te llega notificación al celular aunque la app esté cerrada.'],
        ].map(([t, d]) => (
          <li key={t} className="flex gap-3 rounded-2xl bg-white/70 p-4 ring-1 ring-carbon-950/5"><Check className="mt-0.5 w-5 h-5 shrink-0 text-agave-600" /><span><span className="block font-bold text-carbon-900">{t}</span><span className="text-[13px] text-carbon-600">{d}</span></span></li>
        ))}
      </ul>
    </div>
  );
}

function useSlugCheck(slug: string, current?: string) {
  const [st, setSt] = useState<{ ok: boolean; msg: string; loading: boolean }>({ ok: false, msg: '', loading: false });
  useEffect(() => {
    if (slug === current) { setSt({ ok: true, msg: '', loading: false }); return; }
    if (!SLUG_RE.test(slug)) { setSt({ ok: false, msg: 'Usa de 3 a 40 letras minúsculas, números o guiones.', loading: false }); return; }
    if (RESERVED_SLUGS.has(slug)) { setSt({ ok: false, msg: 'Esa dirección está reservada.', loading: false }); return; }
    setSt((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      fetch(`/api/order?check=${encodeURIComponent(slug)}`).then((r) => r.json())
        .then((d) => setSt({ ok: !!d.available, msg: d.available ? '' : d.reason || 'No disponible', loading: false }))
        .catch(() => setSt({ ok: true, msg: '', loading: false }));
    }, 400);
    return () => clearTimeout(t);
  }, [slug, current]);
  return st;
}

function SlugField({ slug, setSlug, check }: { slug: string; setSlug: (s: string) => void; check: { ok: boolean; msg: string; loading: boolean } }) {
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-carbon-600">Dirección de tu página</span>
      <div className="mt-1 flex items-center rounded-xl border border-carbon-200 focus-within:border-agave-500 overflow-hidden">
        <span className="bg-carbon-50 px-3 py-3 text-[14px] text-carbon-500 border-r border-carbon-200">donpunto.com/</span>
        <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} className="min-w-0 flex-1 px-3 py-3 outline-none font-semibold" />
        <span className="px-3">{check.loading ? <Loader2 className="w-4 h-4 animate-spin text-carbon-400" /> : check.ok ? <Check className="w-4 h-4 text-agave-600" /> : <X className="w-4 h-4 text-red-500" />}</span>
      </div>
      {check.msg && <span className="mt-1 block text-[12px] font-semibold text-red-600">{check.msg}</span>}
    </label>
  );
}

// ---------------------------------------------------------------- encabezado: link, abierto/cerrado, notificaciones
function StoreHeader({ store, link, canEdit, onChange }: { store: Rec; link: string; canEdit: boolean; onChange: (s: Rec) => void }) {
  const [copied, setCopied] = useState(false);
  const [push, setPush] = useState<PushState | 'loading'>('loading');
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => { getPushState().then(setPush).catch(() => setPush('unsupported')); }, []);
  const toggle = async (field: 'accepting' | 'published') => {
    if (field === 'published' && !store.published) {
      const visible = (store.menu?.products || []).filter((p: any) => !p.hidden).length;
      const problems = [
        !visible && 'tu menú no tiene platillos visibles',
        !(store.pickup || store.delivery) && 'elige recoger en tienda o a domicilio',
        store.delivery && !(store.lat || store.lng) && 'marca la ubicación de tu negocio (Cobro y entrega)',
        !(store.pay_cash || (store.pay_codi && (store.codi_clabe || store.codi_qr))) && 'elige cómo te van a pagar',
      ].filter(Boolean);
      if (problems.length) return alert('Antes de publicar: ' + problems.join(', ') + '.');
    }
    onChange(await pb.collection('stores').update(store.id, { [field]: !store[field] }));
  };
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-carbon-950/5">
        {store.logo ? <img src={fileUrl(store, store.logo)} className="h-12 w-12 rounded-2xl object-cover" alt="" /> : <div className="grid h-12 w-12 place-items-center rounded-2xl text-lg font-black text-white" style={{ background: store.color || '#16803C' }}>{(store.name || 'R')[0]}</div>}
        <div className="min-w-[180px] flex-1">
          <p className="font-display text-lg font-extrabold text-carbon-900 truncate">{store.name}</p>
          <p className="text-[13px] text-carbon-500 truncate">{link.replace(/^https?:\/\//, '')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })} className="flex items-center gap-1.5 rounded-xl border border-carbon-200 px-3 py-2 text-[13px] font-semibold text-carbon-700 hover:bg-carbon-50">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}{copied ? 'Copiado' : 'Copiar link'}</button>
          <a href={link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl border border-carbon-200 px-3 py-2 text-[13px] font-semibold text-carbon-700 hover:bg-carbon-50"><ExternalLink className="w-4 h-4" />Ver página</a>
          <Toggle on={!!store.accepting} onClick={() => toggle('accepting')} label={store.accepting ? 'Recibiendo pedidos' : 'Pausado'} />
          {canEdit && <Toggle on={!!store.published} onClick={() => toggle('published')} label={store.published ? 'Publicada' : 'Sin publicar'} />}
        </div>
      </div>
      {push !== 'on' && push !== 'loading' && (
        <div className="flex items-center gap-3 rounded-3xl bg-maiz-50 p-4 ring-1 ring-maiz-200 lg:max-w-sm">
          <Bell className="w-6 h-6 shrink-0 text-maiz-700" />
          <div className="min-w-0 flex-1 text-[13px] text-carbon-800">
            {push === 'needs-install' ? <>Instala la app para recibir avisos de pedidos en tu celular.</> : push === 'denied' ? <>Bloqueaste las notificaciones. Actívalas en los ajustes del navegador.</> : push === 'unsupported' ? <>Este navegador no recibe notificaciones; deja esta pantalla abierta (suena al llegar un pedido).</> : <>Activa los avisos para enterarte de cada pedido aunque la app esté cerrada.</>}
          </div>
          {push === 'needs-install' ? <InstallAppButton compact className="rounded-xl bg-carbon-900 px-3 py-2 text-[12px] font-bold text-white" /> : push === 'off' && (
            <button disabled={pushBusy} onClick={async () => { setPushBusy(true); try { setPush(await enablePush(true)); } catch (e: any) { alert(e.message); } setPushBusy(false); }} className="rounded-xl bg-carbon-900 px-3 py-2 text-[12px] font-bold text-white disabled:opacity-50">Activar</button>
          )}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-bold ring-1 ${on ? 'bg-agave-50 text-agave-700 ring-agave-200' : 'bg-carbon-50 text-carbon-600 ring-carbon-200'}`}>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-agave-600' : 'bg-carbon-300'}`}><span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`} /></span>{label}
    </button>
  );
}

// ---------------------------------------------------------------- pedidos
const ACTIVE = ['new', 'accepted', 'ready', 'on_way'];
function OrdersBoard({ store, rows }: { store: Rec; rows: ProductRowData[] }) {
  const [orders, setOrders] = useState<WebOrder[]>([]);
  const [printing, setPrinting] = useState<WebOrder | null>(null);
  const [charging, setCharging] = useState<WebOrder | null>(null);
  const { settings, addTransaction } = usePOS();
  const uid = pb.authStore.record?.id as string;

  const load = useCallback(async () => {
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString().replace('T', ' ');
    const r = await pb.collection('web_orders').getList<WebOrder>(1, 100, {
      filter: pb.filter('owner = {:o} && (status = "new" || status = "accepted" || status = "ready" || status = "on_way" || created >= {:s})', { o: uid, s: since }),
      sort: '-created', requestKey: null,
    });
    setOrders(r.items);
  }, [uid]);
  useEffect(() => {
    load();
    let unsub: (() => void) | undefined;
    pb.collection('web_orders').subscribe('*', () => load()).then((u) => { unsub = u; }).catch(() => undefined);
    const iv = setInterval(load, 60_000);
    return () => { unsub?.(); clearInterval(iv); };
  }, [load]);

  const patch = async (o: WebOrder, data: Partial<WebOrder>) => {
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, ...data } : x)));
    try { await pb.collection('web_orders').update(o.id, data); } catch (e: any) { alert('No se pudo actualizar: ' + (e?.message || '')); load(); }
  };
  const printComanda = (o: WebOrder) => { setPrinting(o); setTimeout(() => runPrint('ticket', () => setPrinting(null)), 50); };
  const canCodi = !!store.pay_codi && !!(store.codi_clabe || store.codi_qr);
  const accept = (o: WebOrder) => { patch(o, { status: 'accepted' }); if (settings.printKitchenTicket) printComanda(o); };
  const askCodi = (o: WebOrder) => { patch(o, { status: 'accepted', payment: 'codi', pay_changed: true }); if (settings.printKitchenTicket) printComanda(o); };
  const reject = (o: WebOrder) => {
    const reason = window.prompt('¿Por qué no puedes aceptar el pedido? (lo verá el cliente)', 'Estamos por cerrar');
    if (reason === null) return;
    patch(o, { status: 'rejected', reason: reason.slice(0, 200) });
  };
  const finish = (o: WebOrder, method: POSPaymentMethod) => {
    const items: CartItem[] = o.items.map((i) => ({ cartId: crypto.randomUUID(), rowId: i.rowId, quantity: i.quantity, customerNote: i.customerNote, selectedModifiers: i.selectedModifiers || [] }));
    const note = `Pedido en línea #${o.number} · ${o.type === 'delivery' ? 'A domicilio' : 'Para recoger'}${o.delivery_fee ? ` (envío ${money(o.delivery_fee)})` : ''}`;
    const tx = addTransaction(o.total, method, 'Tienda', note, o.customer_name, undefined, items);
    if (isPro()) {
      const { alerts } = applySaleToInventory(items, rows);
      if (alerts.length) apiPost('/api/push', { action: 'stock', items: alerts.map((a) => ({ nombre: a.nombre, saldo: a.saldo, unidad: a.unidad, level: a.level })) }).catch(() => {});
    }
    patch(o, { status: 'done', payment_status: 'paid', sale_id: tx.id });
    setCharging(null);
  };

  const groups = {
    new: orders.filter((o) => o.status === 'new'),
    live: orders.filter((o) => ['accepted', 'ready', 'on_way'].includes(o.status)),
    past: orders.filter((o) => !ACTIVE.includes(o.status)),
  };

  return (
    <div className="space-y-6">
      {orders.length === 0 && (
        <div className="rounded-3xl border-2 border-dashed border-carbon-200 bg-white/60 p-10 text-center">
          <Bell className="mx-auto w-8 h-8 text-carbon-300" />
          <p className="mt-3 font-bold text-carbon-800">Aquí van a llegar tus pedidos en línea</p>
          <p className="mt-1 text-[13px] text-carbon-500">{store.published ? 'Comparte tu link en redes y en tu perfil de mensajes.' : 'Publica tu página para empezar a recibir pedidos.'}</p>
        </div>
      )}
      {groups.new.length > 0 && <Column title="Nuevos" tone="maiz" list={groups.new} render={(o) => <OrderCard key={o.id} o={o} canCodi={canCodi} onAskCodi={() => askCodi(o)} onAccept={() => accept(o)} onReject={() => reject(o)} onPrint={() => printComanda(o)} onPatch={(d) => patch(o, d)} onCharge={() => setCharging(o)} />} />}
      {groups.live.length > 0 && <Column title="En curso" tone="agave" list={groups.live} render={(o) => <OrderCard key={o.id} o={o} canCodi={canCodi} onAskCodi={() => askCodi(o)} onAccept={() => accept(o)} onReject={() => reject(o)} onPrint={() => printComanda(o)} onPatch={(d) => patch(o, d)} onCharge={() => setCharging(o)} />} />}
      {groups.past.length > 0 && (
        <details className="rounded-3xl bg-white ring-1 ring-carbon-950/5">
          <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-carbon-700">Terminados recientes ({groups.past.length})</summary>
          <div className="divide-y divide-carbon-100 px-5 pb-3">
            {groups.past.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span><b>#{o.number}</b> · {o.customer_name} · {new Date(o.created).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={o.status === 'rejected' ? 'text-red-600 font-semibold' : 'text-agave-700 font-semibold'}>{o.status === 'rejected' ? 'Rechazado' : `Entregado · ${money(o.total)}`}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {charging && (
        <div className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4" onClick={() => setCharging(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[12px] font-bold uppercase tracking-widest text-carbon-500">Pedido #{charging.number}</p>
            <h3 className="mt-1 font-display text-2xl font-extrabold">Cobrar {money(charging.total)}</h3>
            <p className="mt-1 text-[13px] text-carbon-500">Se registra la venta en tu corte del día.</p>
            <div className="mt-5 grid gap-2">
              {(charging.payment === 'codi' ? ['Transferencia', 'Efectivo', 'Tarjeta'] : ['Efectivo', 'Tarjeta', 'Transferencia']).map((m) => (
                <button key={m} onClick={() => finish(charging, m as POSPaymentMethod)} className="flex items-center gap-3 rounded-2xl border-2 border-carbon-100 px-4 py-3 text-left font-bold hover:border-agave-500">
                  {m === 'Transferencia' ? <QrCode className="w-5 h-5 text-agave-600" /> : <Banknote className="w-5 h-5 text-agave-600" />}{m === 'Transferencia' ? 'CoDi / transferencia' : m}
                  {charging.payment === 'codi' && m === 'Transferencia' && charging.payment_status !== 'paid' && <span className="ml-auto text-[11px] font-semibold text-maiz-700">Revisa tu banco</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setCharging(null)} className="mt-4 w-full py-2 text-sm font-semibold text-carbon-500">Cancelar</button>
          </div>
        </div>
      )}

      {printing && (
        <PrintArea kind="ticket" paper={settings.paperSize}>
          <POSTicket items={printing.items.map((i) => ({ cartId: i.rowId, rowId: i.rowId, quantity: i.quantity, customerNote: i.customerNote, selectedModifiers: i.selectedModifiers || [] }))}
            total={printing.total} paymentMethod="Efectivo" isKitchen paperSize={settings.paperSize}
            destination={(`En línea · ${printing.type === 'delivery' ? 'Domicilio' : 'Recoger'}`) as OrderDestination}
            customerName={`#${printing.number} ${printing.customer_name}`} />
        </PrintArea>
      )}
    </div>
  );
}

function Column({ title, tone, list, render }: { title: string; tone: 'maiz' | 'agave'; list: WebOrder[]; render: (o: WebOrder) => React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-widest text-carbon-600">
        <span className={`h-2 w-2 rounded-full ${tone === 'maiz' ? 'bg-maiz-500 animate-pulse' : 'bg-agave-500'}`} />{title} <span className="text-carbon-400">{list.length}</span>
      </h3>
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{list.map(render)}</div>
    </section>
  );
}

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`;
}

function OrderCard({ o, canCodi, onAskCodi, onAccept, onReject, onPrint, onPatch, onCharge }: { o: WebOrder; canCodi: boolean; onAskCodi: () => void; onAccept: () => void; onReject: () => void; onPrint: () => void; onPatch: (d: Partial<WebOrder>) => void; onCharge: () => void }) {
  const [, tick] = useState(0);
  useEffect(() => { const iv = setInterval(() => tick((x) => x + 1), 30_000); return () => clearInterval(iv); }, []);
  const isNew = o.status === 'new';
  const cashRequest = isNew && o.type === 'delivery' && o.payment === 'cash';
  const payBadge = o.payment === 'cash'
    ? (cashRequest ? { t: 'Pide pagar en efectivo', c: 'bg-maiz-100 text-maiz-800' } : { t: o.type === 'delivery' ? 'Efectivo al recibir' : 'Paga al recoger', c: 'bg-carbon-100 text-carbon-700' })
    : o.payment_status === 'paid' ? { t: 'CoDi pagado ✓', c: 'bg-agave-100 text-agave-800' }
    : o.payment_status === 'reported' ? { t: 'CoDi: dice que ya pagó', c: 'bg-maiz-100 text-maiz-800' }
    : { t: 'CoDi: pendiente', c: 'bg-carbon-100 text-carbon-700' };
  return (
    <article className={`flex flex-col rounded-3xl bg-white ring-1 ${isNew ? 'ring-2 ring-maiz-400 shadow-[0_18px_40px_-20px_rgba(161,98,7,0.45)]' : 'ring-carbon-950/5'}`}>
      <header className="flex items-start justify-between gap-3 border-b border-carbon-100 p-4">
        <div>
          <p className="font-display text-2xl font-extrabold leading-none text-carbon-900">#{o.number}</p>
          <p className="mt-1 flex items-center gap-1 text-[12px] text-carbon-500"><Clock className="w-3.5 h-3.5" />{ago(o.created)}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${o.type === 'delivery' ? 'bg-blue-50 text-blue-700' : 'bg-carbon-900 text-white'}`}>{o.type === 'delivery' ? <><Bike className="w-3.5 h-3.5" />A domicilio</> : <><StoreIcon className="w-3.5 h-3.5" />Recoger</>}</span>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${payBadge.c}`}>{payBadge.t}</span>
        </div>
      </header>
      <div className="space-y-3 p-4 text-[14px]">
        <div>
          <p className="font-bold text-carbon-900">{o.customer_name}</p>
          <a href={`tel:${o.customer_phone.replace(/\s/g, '')}`} className="flex items-center gap-1.5 text-[13px] text-agave-700 font-semibold"><Phone className="w-3.5 h-3.5" />{o.customer_phone}</a>
          {o.type === 'delivery' && (o.address || o.lat) && <a target="_blank" rel="noreferrer" href={o.lat ? `https://maps.google.com/?q=${o.lat},${o.lng}` : `https://maps.google.com/?q=${encodeURIComponent(o.address)}`} className="mt-1 flex items-start gap-1.5 text-[13px] text-carbon-700"><MapPin className="mt-0.5 w-3.5 h-3.5 shrink-0" /><span>{o.address}{o.distance_km ? <b className="ml-1 text-carbon-900">· {Number(o.distance_km).toFixed(1)} km</b> : null}<span className="block text-[11px] font-semibold text-agave-700">Ver en mapa →</span></span></a>}
          {o.notes && <p className="mt-1 rounded-lg bg-maiz-50 px-2.5 py-1.5 text-[12px] text-maiz-900">“{o.notes}”</p>}
        </div>
        <ul className="space-y-1.5 border-t border-dashed border-carbon-200 pt-3">
          {o.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2">
              <span><b>{i.quantity}×</b> {i.name}
                {i.selectedModifiers?.length > 0 && <span className="block text-[12px] text-carbon-500">+ {i.selectedModifiers.flatMap((g) => g.modifiers.map((m) => m.name)).join(', ')}</span>}
                {i.customerNote && <span className="block text-[12px] font-semibold text-carbon-700">* {i.customerNote}</span>}
              </span>
              <span className="text-carbon-600">{money(i.line)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-carbon-100 pt-2 font-black text-carbon-900"><span>Total{o.delivery_fee ? <span className="ml-1 text-[11px] font-semibold text-carbon-500">(incluye envío {money(o.delivery_fee)})</span> : null}</span><span>{money(o.total)}</span></div>
      </div>
      <footer className="mt-auto flex flex-wrap gap-2 border-t border-carbon-100 p-3">
        {cashRequest ? (
          <div className="w-full space-y-2">
            <p className="flex gap-2 rounded-xl bg-maiz-50 p-2.5 text-[12px] text-maiz-900"><Banknote className="w-4 h-4 shrink-0" /><span><b>El cliente pide pagar en efectivo al recibir.</b> Si no te conviene, acepta el pedido pidiendo pago por CoDi.</span></p>
            <div className="flex flex-wrap gap-2">
              <button onClick={onReject} className="flex items-center gap-1.5 rounded-xl border border-carbon-200 px-3 py-2.5 text-[13px] font-bold text-carbon-600 hover:bg-red-50 hover:text-red-700"><X className="w-4 h-4" />Rechazar</button>
              {canCodi && <button onClick={onAskCodi} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-agave-600 px-3 py-2 text-[13px] font-bold text-agave-700"><QrCode className="w-4 h-4" />Aceptar con CoDi</button>}
              <button onClick={onAccept} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-agave-600 px-3 py-2.5 text-[13px] font-bold text-white"><Check className="w-4 h-4" />Aceptar efectivo</button>
            </div>
          </div>
        ) : isNew ? (
          <>
            <button onClick={onReject} className="flex items-center gap-1.5 rounded-xl border border-carbon-200 px-3 py-2.5 text-[13px] font-bold text-carbon-600 hover:bg-red-50 hover:text-red-700"><X className="w-4 h-4" />Rechazar</button>
            <button onClick={onAccept} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-agave-600 px-3 py-2.5 text-[13px] font-bold text-white hover:bg-agave-700"><Check className="w-4 h-4" />Aceptar pedido</button>
          </>
        ) : (
          <>
            <button onClick={onPrint} title="Imprimir comanda" className="grid h-10 w-10 place-items-center rounded-xl border border-carbon-200 text-carbon-600 hover:bg-carbon-50"><Printer className="w-4 h-4" /></button>
            {o.payment === 'codi' && o.payment_status !== 'paid' && <button onClick={() => onPatch({ payment_status: 'paid' })} className="rounded-xl border border-agave-300 px-3 py-2 text-[13px] font-bold text-agave-700 hover:bg-agave-50">Confirmar pago</button>}
            {o.status === 'accepted' && (o.type === 'delivery'
              ? <button onClick={() => onPatch({ status: 'on_way' })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-carbon-900 px-3 py-2.5 text-[13px] font-bold text-white"><Bike className="w-4 h-4" />Salió a entregar</button>
              : <button onClick={() => onPatch({ status: 'ready' })} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-carbon-900 px-3 py-2.5 text-[13px] font-bold text-white"><ChefHat className="w-4 h-4" />Ya está listo</button>)}
            {(o.status === 'ready' || o.status === 'on_way') && <button onClick={onCharge} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-agave-600 px-3 py-2.5 text-[13px] font-bold text-white"><PackageCheck className="w-4 h-4" />Entregado y cobrado</button>}
          </>
        )}
      </footer>
    </article>
  );
}

// ---------------------------------------------------------------- mi página
function useDraft(store: Rec, keys: string[]) {
  const pick = () => Object.fromEntries(keys.map((k) => [k, store[k] ?? '']));
  const [d, setD] = useState<Rec>(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setD(pick()), [store.id]);
  const dirty = keys.some((k) => (d[k] ?? '') !== (store[k] ?? ''));
  return { d, set: (k: string, v: any) => setD((x) => ({ ...x, [k]: v })), dirty };
}

function SaveBar({ dirty, busy, onSave, msg }: { dirty: boolean; busy: boolean; onSave: () => void; msg: string }) {
  return (
    <div className="sticky bottom-3 z-10 flex items-center justify-end gap-3">
      {msg && <span className="text-[13px] font-semibold text-carbon-600">{msg}</span>}
      <button disabled={!dirty || busy} onClick={onSave} className="flex items-center gap-2 rounded-xl bg-agave-600 px-6 py-3 font-bold text-white shadow-lg disabled:opacity-40">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Guardar cambios</button>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 sm:p-6 ring-1 ring-carbon-950/5">
      <h3 className="font-display text-lg font-extrabold text-carbon-900">{title}</h3>
      {desc && <p className="mt-0.5 text-[13px] text-carbon-500">{desc}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}
function Input({ label, value, onChange, placeholder, type = 'text', hint, textarea }: { label: string; value: any; onChange: (v: string) => void; placeholder?: string; type?: string; hint?: string; textarea?: boolean }) {
  const cls = 'mt-1 w-full rounded-xl border border-carbon-200 px-4 py-2.5 text-[14px] outline-none focus:border-agave-500';
  return (
    <label className="block">
      <span className="text-[13px] font-semibold text-carbon-600">{label}</span>
      {textarea ? <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={cls} /> : <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type={type} className={cls} />}
      {hint && <span className="mt-1 block text-[12px] text-carbon-500">{hint}</span>}
    </label>
  );
}

function ImagePick({ store, field, label, aspect, hint, onChange }: { store: Rec; field: 'logo' | 'cover' | 'codi_qr'; label: string; aspect: string; hint?: string; onChange: (s: Rec) => void }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const pick = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    try {
      const file = field === 'codi_qr' ? f : await compressImage(f, field === 'cover' ? 1600 : 600);
      const fd = new FormData();
      fd.append(field, file);
      onChange(await pb.collection('stores').update(store.id, fd));
    } catch (e: any) { alert('No se pudo subir la imagen: ' + (e?.message || '')); }
    setBusy(false);
  };
  const url = fileUrl(store, store[field]);
  return (
    <div>
      <span className="text-[13px] font-semibold text-carbon-600">{label}</span>
      <button type="button" onClick={() => ref.current?.click()} className={`mt-1 relative grid w-full place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-carbon-200 bg-carbon-50 hover:border-agave-400 ${aspect}`}>
        {url ? <img src={url} alt="" className={`h-full w-full ${field === 'codi_qr' ? 'object-contain p-2 bg-white' : 'object-cover'}`} /> : <span className="flex flex-col items-center gap-1 text-[12px] font-semibold text-carbon-500"><Upload className="w-5 h-5" />Subir imagen</span>}
        {busy && <span className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="w-5 h-5 animate-spin" /></span>}
      </button>
      {hint && <p className="mt-1 text-[11px] leading-snug text-carbon-500">{hint}</p>}
      {url && <button type="button" onClick={async () => onChange(await pb.collection('stores').update(store.id, { [field]: null }))} className="mt-1 text-[12px] font-semibold text-carbon-500 hover:text-red-600">Quitar</button>}
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

function PageEditor({ store, onChange }: { store: Rec; onChange: (s: Rec) => void }) {
  const { d, set, dirty } = useDraft(store, ['name', 'slug', 'tagline', 'phone', 'address', 'hours', 'color']);
  const check = useSlugCheck(d.slug, store.slug);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (!check.ok) return setMsg(check.msg || 'Revisa la dirección');
    setBusy(true); setMsg('');
    try { onChange(await pb.collection('stores').update(store.id, d)); setMsg('Guardado ✓'); }
    catch (e: any) { setMsg(e?.response?.data?.slug ? 'Esa dirección ya está ocupada' : 'No se pudo guardar'); }
    setBusy(false);
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Tu marca" desc="Así te ven tus clientes al abrir tu link.">
          <div className="grid grid-cols-[120px_1fr] gap-4">
            <ImagePick store={store} field="logo" label="Logo" aspect="aspect-square" onChange={onChange} />
            <ImagePick store={store} field="cover" label="Foto de portada" aspect="aspect-[768/224]" hint="Tamaño recomendado: 1536 × 448 px. Deja lo importante al centro; en celular se recortan los lados y el logo tapa la esquina inferior izquierda." onChange={onChange} />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-carbon-600">Color de tu página</span>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {COLORS.map((c) => <button key={c} onClick={() => set('color', c)} className={`h-9 w-9 rounded-full ring-offset-2 ${d.color === c ? 'ring-2 ring-carbon-900' : ''}`} style={{ background: c }} aria-label={c} />)}
              <input type="color" value={d.color || '#16803C'} onChange={(e) => set('color', e.target.value)} className="h-9 w-12 cursor-pointer rounded-lg border border-carbon-200" />
            </div>
          </div>
        </Card>
        <Card title="Datos del restaurante">
          <Input label="Nombre" value={d.name} onChange={(v) => set('name', v)} />
          <SlugField slug={d.slug} setSlug={(v) => set('slug', v)} check={check} />
          <Input label="Frase corta" value={d.tagline} onChange={(v) => set('tagline', v)} placeholder="Tacos al carbón desde 1998" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Teléfono" value={d.phone} onChange={(v) => set('phone', v)} type="tel" />
            <Input label="Horario" value={d.hours} onChange={(v) => set('hours', v)} placeholder="Lun a Sáb · 1 pm a 11 pm" />
          </div>
          <Input label="Dirección" value={d.address} onChange={(v) => set('address', v)} />
        </Card>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} msg={msg} />
    </div>
  );
}

// ---------------------------------------------------------------- menú y fotos
function MenuEditor({ store, onChange, categories }: { store: Rec; onChange: (s: Rec) => void; categories: Category[] }) {
  const menu: OMenu = store.menu || { categories: [], groups: [], products: [] };
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const target = useRef<string | null>(null);
  const saveMenu = async (products: OMenu['products']) => {
    onChange({ ...store, menu: { ...menu, products } });
    try { onChange(await pb.collection('stores').update(store.id, { menu: { ...menu, products } }, { requestKey: 'menu' })); } catch (e: any) { if (!e?.isAbort) alert('No se pudo guardar el menú'); }
  };
  const setP = (id: string, patch: Partial<OMenu['products'][number]>) => saveMenu(menu.products.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const upload = async (f?: File) => {
    const id = target.current;
    if (!f || !id) return;
    setBusyId(id);
    try {
      const p = menu.products.find((x) => x.id === id);
      const fd = new FormData();
      fd.append('photos+', await compressImage(f, 1000));
      if (p?.photo) fd.append('photos-', p.photo);
      const before = new Set<string>(store.photos || []);
      const rec = await pb.collection('stores').update(store.id, fd);
      const added = (rec.photos as string[]).find((n) => !before.has(n));
      const products = (rec.menu as OMenu).products.map((x) => (x.id === id ? { ...x, photo: added } : x));
      onChange(await pb.collection('stores').update(store.id, { menu: { ...(rec.menu as OMenu), products } }));
    } catch (e: any) { alert('No se pudo subir la foto: ' + (e?.message || '')); }
    setBusyId(null);
  };
  const groups = useMemo(() => {
    const cats = [...categories.map((c) => ({ id: c.id, name: c.name })), { id: '', name: 'Sin categoría' }];
    return cats.map((c) => ({ ...c, items: menu.products.filter((p) => (p.categoryId || '') === c.id || (c.id === '' && !categories.some((x) => x.id === p.categoryId))) })).filter((c) => c.items.length);
  }, [menu.products, categories]);
  const visible = menu.products.filter((p) => !p.hidden).length;
  const withPhoto = menu.products.filter((p) => !p.hidden && p.photo).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-white px-5 py-3 ring-1 ring-carbon-950/5 text-[13px] text-carbon-600">
        <span><b className="text-carbon-900">{visible}</b> platillos visibles</span><span className="text-carbon-300">·</span>
        <span><b className="text-carbon-900">{withPhoto}</b> con foto</span><span className="text-carbon-300">·</span>
        <span>Los precios y nombres vienen de <b>Catálogo</b> (se actualizan solos).</span>
      </div>
      {menu.products.length === 0 && <p className="rounded-3xl bg-white p-8 text-center text-carbon-500 ring-1 ring-carbon-950/5">Primero agrega platillos en Catálogo.</p>}
      {groups.map((g) => (
        <Card key={g.id || 'none'} title={g.name}>
          <div className="divide-y divide-carbon-100 -my-2">
            {g.items.map((p) => (
              <div key={p.id} className={`flex flex-wrap items-center gap-4 py-3 ${p.hidden ? 'opacity-50' : ''}`}>
                <button onClick={() => { target.current = p.id; fileRef.current?.click(); }} className="relative grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-carbon-200 bg-carbon-50 hover:border-agave-400" title="Cambiar foto">
                  {p.photo ? <img src={fileUrl(store, p.photo)} alt="" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center text-[11px] font-semibold text-carbon-500"><ImageIcon className="w-5 h-5" />Foto</span>}
                  {busyId === p.id && <span className="absolute inset-0 grid place-items-center bg-white/70"><Loader2 className="w-5 h-5 animate-spin" /></span>}
                </button>
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-baseline justify-between gap-3"><p className="font-bold text-carbon-900">{p.name}</p><p className="font-bold text-carbon-900">{money(p.price)}</p></div>
                  <textarea defaultValue={p.description || ''} onBlur={(e) => e.target.value !== (p.description || '') && setP(p.id, { description: e.target.value.slice(0, 300) })} rows={2} placeholder="Descripción que verán tus clientes (opcional)" className="mt-1 w-full resize-none rounded-xl border border-carbon-100 px-3 py-2 text-[13px] outline-none focus:border-agave-400" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setP(p.id, { hidden: !p.hidden })} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-bold ring-1 ${p.hidden ? 'bg-carbon-50 text-carbon-600 ring-carbon-200' : 'bg-agave-50 text-agave-700 ring-agave-200'}`}>{p.hidden ? <><EyeOff className="w-4 h-4" />Oculto</> : <><Eye className="w-4 h-4" />Visible</>}</button>
                  <button onClick={() => setP(p.id, { soldOut: !p.soldOut })} className={`rounded-xl px-3 py-2 text-[12px] font-bold ring-1 ${p.soldOut ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-white text-carbon-600 ring-carbon-200'}`}>{p.soldOut ? 'Agotado hoy' : 'Hay'}</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
    </div>
  );
}

// ---------------------------------------------------------------- cobro y entrega
function PayEditor({ store, onChange }: { store: Rec; onChange: (s: Rec) => void }) {
  const { d, set, dirty } = useDraft(store, ['pickup', 'delivery', 'delivery_fee', 'min_order', 'delivery_area', 'prep_minutes', 'pay_cash', 'pay_codi', 'codi_clabe', 'codi_bank', 'codi_holder', 'cash_delivery', 'lat', 'lng', 'radius_km']);
  const [geoQ, setGeoQ] = useState('');
  const [geoRes, setGeoRes] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMsg, setGeoMsg] = useState('');
  const hasLoc = !!(d.lat || d.lng);
  const gps = () => {
    if (!navigator.geolocation) return setGeoMsg('Este navegador no da ubicación; busca la dirección.');
    setGeoBusy(true); setGeoMsg('');
    navigator.geolocation.getCurrentPosition((p) => { set('lat', p.coords.latitude); set('lng', p.coords.longitude); setGeoBusy(false); setGeoMsg('Ubicación tomada. Guarda los cambios.'); },
      (e) => { setGeoBusy(false); setGeoMsg(e.code === 1 ? 'No diste permiso de ubicación.' : 'No se pudo obtener la ubicación.'); }, { enableHighAccuracy: true, timeout: 12000 });
  };
  const geoSearch = async () => {
    const qq = (geoQ || store.address || '').trim();
    if (qq.length < 4) return;
    setGeoBusy(true); setGeoMsg('');
    try {
      const r = await fetch(`/api/order?geo=${encodeURIComponent(qq)}`).then((x) => x.json());
      setGeoRes(r.results || []);
      if (!r.results?.length) setGeoMsg('No encontramos esa dirección. Prueba calle, número, colonia y ciudad.');
    } catch { setGeoMsg('No se pudo buscar.'); }
    setGeoBusy(false);
  };
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const clabe = String(d.codi_clabe || '').replace(/\D/g, '');
  const save = async () => {
    if (!d.pickup && !d.delivery) return setMsg('Elige al menos recoger o domicilio');
    if (!d.pay_cash && !d.pay_codi && !d.cash_delivery) return setMsg('Elige al menos una forma de pago');
    if (d.delivery && !hasLoc) return setMsg('Para entregar a domicilio marca la ubicación de tu negocio');
    if (d.delivery && !d.pay_codi && !d.cash_delivery) return setMsg('A domicilio necesita CoDi o efectivo con aprobación');
    if (d.pickup && !d.pay_cash && !d.pay_codi) return setMsg('Para recoger elige efectivo o CoDi');
    if (d.pay_codi && clabe && clabe.length !== 18) return setMsg('La CLABE debe tener 18 dígitos');
    if (d.pay_codi && !clabe && !store.codi_qr) return setMsg('Para CoDi sube tu QR o escribe tu CLABE');
    setBusy(true); setMsg('');
    try {
      onChange(await pb.collection('stores').update(store.id, { ...d, codi_clabe: clabe, radius_km: Number(d.radius_km) || 3, lat: Number(d.lat) || null, lng: Number(d.lng) || null, delivery_fee: Number(d.delivery_fee) || 0, min_order: Number(d.min_order) || 0, prep_minutes: Number(d.prep_minutes) || 0 }));
      setMsg('Guardado ✓');
    } catch { setMsg('No se pudo guardar'); }
    setBusy(false);
  };
  const check2 = ({ k, title, sub, Icon }: { k: string; title: string; sub: string; Icon: typeof Bike }) => (
    <button type="button" onClick={() => set(k, !d[k])} className={`flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ${d[k] ? 'border-agave-500 bg-agave-50/60' : 'border-carbon-100'}`}>
      <Icon className={`w-5 h-5 ${d[k] ? 'text-agave-600' : 'text-carbon-400'}`} />
      <span className="flex-1"><span className="block font-bold text-carbon-900">{title}</span><span className="block text-[12px] text-carbon-500">{sub}</span></span>
      <span className={`grid h-6 w-6 place-items-center rounded-md border-2 ${d[k] ? 'border-agave-600 bg-agave-600' : 'border-carbon-300'}`}>{d[k] && <Check className="w-4 h-4 text-white" strokeWidth={3} />}</span>
    </button>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Entrega" desc="Qué opciones ve tu cliente al pedir.">
          {check2({ k: "pickup", title: "Recoger en tienda", sub: "El cliente pasa por su pedido", Icon: StoreIcon })}
          {check2({ k: "delivery", title: "A domicilio", sub: "Tú o tu repartidor lo llevan", Icon: Bike })}
          {d.delivery && (
            <div className="space-y-3 rounded-2xl bg-carbon-50 p-4">
              <p className="font-bold text-carbon-900">Ubicación del negocio y zona de entrega</p>
              <p className={`flex items-center gap-2 text-[13px] font-semibold ${hasLoc ? 'text-agave-700' : 'text-red-600'}`}>{hasLoc ? <><Check className="w-4 h-4" />Ubicación marcada · <a className="underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${d.lat},${d.lng}`}>ver en mapa</a></> : <><AlertTriangle className="w-4 h-4" />Falta marcar dónde está tu negocio</>}</p>
              <button type="button" onClick={gps} disabled={geoBusy} className="flex items-center gap-2 rounded-xl bg-carbon-900 px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">{geoBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}Estoy en el negocio: usar mi ubicación</button>
              <div className="flex gap-2">
                <input value={geoQ} onChange={(e) => setGeoQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), geoSearch())} placeholder={store.address || 'o busca la dirección del negocio'} className="min-w-0 flex-1 rounded-xl border border-carbon-200 bg-white px-3 py-2.5 text-[14px] outline-none focus:border-agave-500" />
                <button type="button" onClick={geoSearch} className="grid w-11 place-items-center rounded-xl border border-carbon-200 bg-white" aria-label="Buscar"><Search className="w-4 h-4" /></button>
              </div>
              {geoRes.length > 0 && <div className="divide-y divide-carbon-100 rounded-xl border border-carbon-200 bg-white">{geoRes.map((r, i) => <button type="button" key={i} onClick={() => { set('lat', r.lat); set('lng', r.lng); setGeoRes([]); setGeoMsg('Ubicación elegida. Guarda los cambios.'); }} className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-[13px]"><MapPin className="mt-0.5 w-4 h-4 shrink-0 text-carbon-400" />{r.label}</button>)}</div>}
              {geoMsg && <p className="text-[12px] font-semibold text-carbon-600">{geoMsg}</p>}
              <Input label="Entregas hasta (km a la redonda)" value={d.radius_km || 3} onChange={(v) => set('radius_km', v.replace(/[^\d.]/g, ''))} type="number" hint="El cliente confirma su ubicación y el sistema no deja pedir si está más lejos." />
            </div>
          )}
          {d.delivery && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Costo de envío ($)" value={d.delivery_fee} onChange={(v) => set('delivery_fee', v.replace(/[^\d.]/g, ''))} type="number" hint="0 = envío gratis" />
              <Input label="Pedido mínimo ($)" value={d.min_order} onChange={(v) => set('min_order', v.replace(/[^\d.]/g, ''))} type="number" hint="0 = sin mínimo" />
            </div>
          )}
          <Input label="Tiempo de preparación aproximado (min)" value={d.prep_minutes} onChange={(v) => set('prep_minutes', v.replace(/\D/g, ''))} type="number" />
        </Card>
        <Card title="Cobro" desc="El dinero llega directo a ti. Don Punto no cobra comisión por pedido.">
          {check2({ k: "pay_cash", title: "Efectivo al recoger en tienda", sub: "Efectivo o tarjeta cuando pasan por su pedido", Icon: Banknote })}
          {check2({ k: "pay_codi", title: "CoDi / transferencia", sub: "Recoger o a domicilio. Tu cliente paga desde la app de su banco", Icon: QrCode })}
          {check2({ k: "cash_delivery", title: "Efectivo a domicilio (con tu aprobación)", sub: "El cliente lo solicita y tú decides: aceptar efectivo o pedirle CoDi", Icon: Bike })}
          {d.pay_codi && (
            <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
              <ImagePick store={store} field="codi_qr" label="Tu QR de CoDi" aspect="aspect-square" onChange={onChange} />
              <div className="space-y-3">
                <Input label="CLABE (18 dígitos)" value={d.codi_clabe} onChange={(v) => set('codi_clabe', v.replace(/[^\d ]/g, '').slice(0, 22))} />
                <Input label="Banco" value={d.codi_bank} onChange={(v) => set('codi_bank', v)} />
                <Input label="Titular de la cuenta" value={d.codi_holder} onChange={(v) => set('codi_holder', v)} />
              </div>
              <p className="sm:col-span-2 flex gap-2 rounded-2xl bg-maiz-50 p-3 text-[12px] text-maiz-900"><AlertTriangle className="w-4 h-4 shrink-0" /><span><b>¿Dónde saco mi QR?</b> En la app de tu banco busca <b>CoDi → Cobrar</b> y guarda la imagen del QR. Antes de entregar, confirma en tu banco que el pago llegó (el cliente puede decir que ya pagó).</span></p>
            </div>
          )}
        </Card>
      </div>
      <SaveBar dirty={dirty} busy={busy} onSave={save} msg={msg} />
    </div>
  );
}
