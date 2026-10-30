// Chat de soporte Tawk.to (gratis). Se carga solo en donpunto.com (landing, login, membresía y app),
// nunca en las tiendas públicas de los restaurantes.
const SRC = 'https://embed.tawk.to/6ae3e557e8184b3471689526/1k653fnem';

type TawkApi = Record<string, any>;
declare global { interface Window { Tawk_API?: TawkApi; Tawk_LoadStart?: Date } }

let loaded = false;
let wantHidden = false;
let pendingUser: { name: string; email: string } | null = null;

function api(): TawkApi {
  window.Tawk_API = window.Tawk_API || {};
  return window.Tawk_API;
}

function applyUser() {
  const t = api();
  if (!pendingUser || typeof t.setAttributes !== 'function') return;
  t.setAttributes(pendingUser, () => {});
}

export function loadTawk() {
  if (loaded || typeof document === 'undefined') return;
  loaded = true;
  const t = api();
  window.Tawk_LoadStart = new Date();
  t.onLoad = () => {
    if (wantHidden) t.hideWidget?.();
    applyUser();
  };
  // En el POS la burbuja vuelve a ocultarse al minimizar el chat
  t.onChatMinimized = () => { if (wantHidden) t.hideWidget?.(); };
  const s = document.createElement('script');
  s.async = true;
  s.src = SRC;
  s.charset = 'UTF-8';
  s.setAttribute('crossorigin', '*');
  document.head.appendChild(s);
}

/** Burbuja visible (landing/login) u oculta (dentro del POS, para no tapar botones). */
export function setTawkBubble(visible: boolean) {
  wantHidden = !visible;
  const t = api();
  if (visible) t.showWidget?.(); else t.hideWidget?.();
}

export function setTawkUser(email: string | null) {
  pendingUser = email ? { name: email.split('@')[0], email } : null;
  applyUser();
}

/** Abre el chat (botón "Ayuda" del menú). Si aún no carga, regresa false. */
export function openTawk(): boolean {
  loadTawk();
  const t = api();
  if (typeof t.maximize !== 'function') return false;
  t.showWidget?.();
  t.maximize();
  return true;
}
