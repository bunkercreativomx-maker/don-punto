import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,ico,woff2}'],
        globIgnores: ['**/og-image.png', '**/mockups/**', '**/screens/**', '**/brand/logo-1600.png', '**/brand/mark-1024.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'Don Punto · Punto de venta',
        short_name: 'Don Punto',
        description: 'Punto de venta para restaurantes: cobra, haz tu corte y calcula tus precios para Uber, DiDi y Rappi.',
        lang: 'es-MX',
        dir: 'ltr',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'any',
        background_color: '#F2F4F7',
        theme_color: '#F2F4F7',
        categories: ['business', 'finance', 'food'],
        icons: [
          { src: '/pwa-192.png?v=3d', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512.png?v=3d', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512.png?v=3d', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Cobrar', short_name: 'Cobrar', url: '/?tab=pos', icons: [{ src: '/pwa-192.png?v=3d', sizes: '192x192' }] },
          { name: 'Reporte del día', short_name: 'Reporte', url: '/?tab=reports', icons: [{ src: '/pwa-192.png?v=3d', sizes: '192x192' }] },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    allowedHosts: true,
  },
})
