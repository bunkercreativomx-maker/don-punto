// Estado del chat de soporte propio (sin terceros). Los mensajes van a /api/support → Telegram de Pako.
import { pb } from './pocketbase';

export interface SupportMsg { id: string; from: 'user' | 'agent'; text: string; at: number; pending?: boolean }

const VT_KEY = 'dp:support:vt';
const SEEN_KEY = 'dp:support:seen';
const NAME_KEY = 'dp:support:name';

function newVt() {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
export function visitorToken(): string {
  let vt = localStorage.getItem(VT_KEY);
  if (!vt || !/^[a-f0-9]{32,64}$/.test(vt)) { vt = newVt(); localStorage.setItem(VT_KEY, vt); }
  return vt;
}

type State = { open: boolean; bubble: boolean; messages: SupportMsg[]; unread: number };
let state: State = { open: false, bubble: true, messages: [], unread: 0 };
const subs = new Set<(s: State) => void>();
function set(p: Partial<State>) {
  state = { ...state, ...p };
  subs.forEach((f) => f(state));
}
export function subscribeSupport(f: (s: State) => void) { subs.add(f); f(state); return () => { subs.delete(f); }; }
export const getSupport = () => state;

const seenAt = () => Number(localStorage.getItem(SEEN_KEY) || 0);
function recount(messages: SupportMsg[]) {
  if (state.open) {
    const last = messages[messages.length - 1]?.at || 0;
    if (last) localStorage.setItem(SEEN_KEY, String(last));
    return 0;
  }
  const s = seenAt();
  return messages.filter((m) => m.from === 'agent' && m.at > s).length;
}

export function openSupport() {
  set({ open: true, unread: 0 });
  recount(state.messages);
  poll();
  if (timer) { clearTimeout(timer); timer = null; }
  startSupportPolling();
}
export function closeSupport() { set({ open: false }); }
export function setSupportBubble(visible: boolean) { if (state.bubble !== visible) set({ bubble: visible }); }

let inflight = false;
export async function poll() {
  if (inflight) return;
  inflight = true;
  try {
    const r = await fetch(`/api/support?vt=${visitorToken()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { messages } = (await r.json()) as { messages: SupportMsg[] };
    const pending = state.messages.filter((m) => m.pending);
    set({ messages: [...messages, ...pending], unread: recount(messages) });
  } catch { /* sin internet: se reintenta */ } finally { inflight = false; }
}

export function savedName() { return localStorage.getItem(NAME_KEY) || ''; }

export async function sendSupport(text: string, contact?: { name?: string; email?: string }) {
  const t = text.trim();
  if (!t) return;
  if (contact?.name) localStorage.setItem(NAME_KEY, contact.name);
  const tmp: SupportMsg = { id: 'tmp' + Date.now(), from: 'user', text: t, at: Date.now(), pending: true };
  set({ messages: [...state.messages, tmp] });
  try {
    const r = await fetch('/api/support', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(pb.authStore.isValid ? { Authorization: pb.authStore.token } : {}) },
      body: JSON.stringify({ action: 'send', vt: visitorToken(), text: t, name: contact?.name || savedName(), email: contact?.email, page: location.pathname }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'No se pudo enviar.');
    localStorage.setItem('dp:support:active', '1');
    set({ messages: state.messages.filter((m) => m.id !== tmp.id) });
    await poll();
  } catch (e) {
    set({ messages: state.messages.filter((m) => m.id !== tmp.id) });
    throw e;
  }
}

// Sondeo: cada 4 s con el chat abierto; cada 60 s cerrado (solo si ya escribió alguna vez)
let timer: ReturnType<typeof setTimeout> | null = null;
export function startSupportPolling() {
  if (timer) return;
  const tick = () => {
    const active = state.open || localStorage.getItem('dp:support:active') === '1';
    if (active && document.visibilityState === 'visible') poll();
    timer = setTimeout(tick, state.open ? 4000 : 60000);
  };
  if (localStorage.getItem('dp:support:active') === '1') poll();
  timer = setTimeout(tick, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && localStorage.getItem('dp:support:active') === '1') poll(); });
}
