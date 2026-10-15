import { registerSW } from 'virtual:pwa-register';
import { apiPost } from './api';
import { VAPID_PUBLIC_KEY } from '../config';

// ---------------------------------------------------------------- actualización de la app
type Listener = () => void;
let needRefresh = false;
const refreshListeners = new Set<Listener>();
let doUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export function initPWA() {
  if (!('serviceWorker' in navigator)) return;
  doUpdate = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      refreshListeners.forEach((l) => l());
    },
    onRegisteredSW(_url, reg) {
      // Revisa si hay versión nueva cada hora mientras la app está abierta
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    },
  });
}

export const updateAvailable = () => needRefresh;
export function onUpdateAvailable(l: Listener) {
  refreshListeners.add(l);
  return () => refreshListeners.delete(l);
}
export function applyUpdate() {
  doUpdate?.(true);
}

// ---------------------------------------------------------------- instalación
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let deferred: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<Listener>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installListeners.forEach((l) => l());
  });
}

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPromptInstall = () => !!deferred;
export function onInstallChange(l: Listener) {
  installListeners.add(l);
  return () => installListeners.delete(l);
}
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  installListeners.forEach((l) => l());
  return outcome === 'accepted';
}

// ---------------------------------------------------------------- notificaciones push
export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function enablePush(dailySummary = true): Promise<PushState> {
  if (!pushSupported()) return getPushState();
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
  }
  await apiPost('/api/push', { action: 'subscribe', subscription: sub.toJSON(), dailySummary });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await apiPost('/api/push', { action: 'unsubscribe', endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

export async function setDailySummary(on: boolean) {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) await apiPost('/api/push', { action: 'settings', endpoint: sub.endpoint, dailySummary: on });
}

export const sendTestPush = () => apiPost('/api/push', { action: 'test' });
