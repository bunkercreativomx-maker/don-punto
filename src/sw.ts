/// <reference lib="webworker" />
// Service worker de Don Punto: app offline (precache) + notificaciones push
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst } from 'workbox-strategies';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null }> };

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// La app abre sin internet: cualquier navegación (excepto API y páginas legales) sirve index.html
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), {
    denylist: [/^\/api\//, /^\/blog/, /^\/privacidad/, /^\/terminos/, /^\/webinar/],
  }),
);

// Imágenes de marca
registerRoute(({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/brand/'), new CacheFirst({ cacheName: 'brand' }));

// Actualización controlada: la app pide activar la nueva versión cuando el usuario acepta
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
clientsClaim();

// ---------------------------------------------------------------- push
self.addEventListener('push', (event) => {
  let data: { title?: string; body?: string; url?: string; tag?: string; renotify?: boolean; sticky?: boolean } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Don Punto';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/pwa-192.png',
      badge: '/brand/badge-96.png',
      tag: data.tag,
      // Pedidos en línea: el aviso se repite (vuelve a sonar) y no se quita solo hasta que lo atiendan
      renotify: !!(data.renotify && data.tag),
      requireInteraction: !!data.sticky,
      vibrate: data.sticky ? [300, 120, 300, 120, 300] : undefined,
      data: { url: data.url || '/' },
      lang: 'es-MX',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data?.url as string) || '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of all) {
        if (new URL(c.url).origin === self.location.origin) {
          await (c as WindowClient).focus();
          (c as WindowClient).navigate(url).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
