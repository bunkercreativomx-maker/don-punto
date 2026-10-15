import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AuthPage } from './components/auth/AuthPage';
import { SubscriptionGate } from './components/auth/SubscriptionGate';
import { pb } from './lib/pocketbase';
import { hydrateUser, attachUserOffline, clearUser, flushAll, onSyncStatus, type SyncStatus } from './lib/cloudStore';
import { apiPost } from './lib/api';
import { supportLink } from './config';
import { Mark } from './components/brand/Logo';

const App = lazy(() => import('./App'));
const LandingPage = lazy(() => import('./components/landing/LandingPage').then((m) => ({ default: m.LandingPage })));

function Splash({ text = 'Cargando Don Punto…' }: { text?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <Mark size={56} className="animate-pulse" />
      <div className="text-slate-500 text-[10px] font-black tracking-widest uppercase animate-pulse">{text}</div>
    </div>
  );
}

type Phase = 'checking' | 'landing' | 'auth' | 'loading' | 'ready';
interface SubInfo { status: string; hasStripeCustomer: boolean }

const subCacheKey = (uid: string) => `dp:${uid}:__sub`;

async function fetchSubscription(uid: string): Promise<SubInfo> {
  try {
    const s = await pb.collection('subscriptions').getFirstListItem(pb.filter('owner = {:o}', { o: uid }), { requestKey: null });
    const info = { status: s.status === 'trialing' ? 'active' : (s.status as string) || 'inactive', hasStripeCustomer: !!s.stripe_customer_id };
    localStorage.setItem(subCacheKey(uid), JSON.stringify(info));
    return info;
  } catch (e: any) {
    if (e?.status === 404) {
      const info = { status: 'inactive', hasStripeCustomer: false };
      localStorage.setItem(subCacheKey(uid), JSON.stringify(info));
      return info;
    }
    throw e;
  }
}

function SyncBadge() {
  const [s, setS] = useState<SyncStatus>('ok');
  useEffect(() => onSyncStatus(setS), []);
  if (s === 'ok') return null;
  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[200] no-print pointer-events-none">
      <div className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-lg ${s === 'offline' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-slate-800/90 text-slate-300 border-white/10'}`}>
        {s === 'offline' ? 'Sin internet · se guarda en este equipo' : 'Guardando en la nube…'}
      </div>
    </div>
  );
}

export default function Root() {
  const initialPhase: Phase = pb.authStore.isValid ? 'checking' : window.location.pathname.startsWith('/login') ? 'auth' : 'landing';
  const [phase, setPhase] = useState<Phase>(initialPhase);
  const [uid, setUid] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [sub, setSub] = useState<SubInfo>({ status: 'checking', hasStripeCustomer: false });
  const [verifying, setVerifying] = useState(false);
  const booted = useRef(false);

  const bootstrap = useCallback(async (user: any, offline = false) => {
    setPhase('loading');
    setUid(user.id);
    setEmail(user.email);

    if (offline) {
      attachUserOffline(user.id);
      const cached = localStorage.getItem(subCacheKey(user.id));
      setSub(cached ? JSON.parse(cached) : { status: 'inactive', hasStripeCustomer: false });
      setPhase('ready');
      return;
    }

    // Restaurante (se crea si no existe) + menú respaldado en la versión anterior
    let legacyMenu: unknown;
    try {
      let rest: any = null;
      try {
        rest = await pb.collection('restaurants').getFirstListItem(pb.filter('owner = {:o}', { o: user.id }), { requestKey: null });
      } catch (e: any) {
        if (e?.status !== 404) throw e;
      }
      if (!rest) rest = await pb.collection('restaurants').create({ name: 'Mi Restaurante', owner: user.id }, { requestKey: null });
      try { legacyMenu = JSON.parse(rest.stripe_customer_id || 'null')?.menu; } catch { /* no había respaldo */ }
    } catch (e) {
      console.error('restaurante', e);
    }

    try {
      const [info] = await Promise.all([fetchSubscription(user.id), hydrateUser(user.id, legacyMenu)]);
      setSub(info);
    } catch (e: any) {
      console.error('carga inicial', e);
      if (!e?.status) return bootstrap(user, true); // red caída: modo sin conexión
      setSub({ status: 'inactive', hasStripeCustomer: false });
    }
    setPhase('ready');
  }, []);

  // Color de la barra del navegador: claro en la página de ventas, oscuro dentro de la app
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', phase === 'landing' ? '#FAFAF7' : '#0D100E');
  }, [phase]);

  // Sesión guardada
  useEffect(() => {
    if (booted.current || initialPhase !== 'checking') return;
    booted.current = true;
    (async () => {
      try {
        const r = await pb.collection('users').authRefresh({ requestKey: null });
        bootstrap(r.record);
      } catch (e: any) {
        const cached = pb.authStore.record;
        if (!e?.status && cached) {
          bootstrap(cached, true);
        } else {
          pb.authStore.clear();
          setPhase('landing');
        }
      }
    })();
  }, [bootstrap, initialPhase]);

  // Regreso de Stripe: esperar a que el webhook active la membresía
  useEffect(() => {
    if (phase !== 'ready' || !uid) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('pago') !== 'ok') return;
    window.history.replaceState({}, '', '/');
    if (sub.status === 'active') return;
    setVerifying(true);
    let tries = 0;
    const iv = setInterval(async () => {
      tries++;
      try {
        const info = await fetchSubscription(uid);
        if (info.status === 'active' || tries > 25) {
          setSub(info);
          setVerifying(false);
          clearInterval(iv);
        }
      } catch {
        if (tries > 25) { setVerifying(false); clearInterval(iv); }
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [phase, uid, sub.status]);

  const logout = useCallback(async () => {
    try {
      await Promise.race([flushAll(), new Promise((r) => setTimeout(r, 4000))]);
    } catch { /* se queda pendiente en este equipo */ }
    clearUser();
    pb.authStore.clear();
    setUid(null);
    setEmail(null);
    setSub({ status: 'checking', hasStripeCustomer: false });
    setPhase('landing');
  }, []);

  const billing = useCallback(async () => {
    try {
      const { url } = await apiPost<{ url: string }>('/api/stripe-portal', {});
      window.location.assign(url);
    } catch (e: any) {
      const link = supportLink(`Hola, necesito ayuda con mi plan de Don Punto (${email ?? ''}).`);
      if (link && window.confirm(`${e.message}\n\n¿Quieres escribirle a soporte?`)) window.open(link, '_blank');
      else if (!link) alert(e.message);
    }
  }, [email]);

  if (phase === 'checking' || phase === 'loading') {
    return <Splash text={phase === 'loading' ? 'Cargando tus datos…' : undefined} />;
  }

  if (phase === 'landing') {
    return (
      <Suspense fallback={<Splash />}>
        <LandingPage onLogin={() => setPhase('auth')} onSubscribe={() => setPhase('auth')} />
      </Suspense>
    );
  }

  if (phase === 'auth') {
    return (
      <AuthPage
        onBack={() => setPhase('landing')}
        onAuthSuccess={() => {
          const rec = pb.authStore.record;
          if (rec) bootstrap(rec);
        }}
      />
    );
  }

  if (sub.status !== 'active' || verifying) {
    return (
      <SubscriptionGate
        status={sub.status}
        email={email}
        verifyingPayment={verifying}
        hasStripeCustomer={sub.hasStripeCustomer}
        onLogout={logout}
      />
    );
  }

  return (
    <>
      <Suspense fallback={<Splash text="Cargando tus datos…" />}>
        <App key={uid} userEmail={email} onLogout={logout} onBilling={billing} />
      </Suspense>
      <SyncBadge />
    </>
  );
}
