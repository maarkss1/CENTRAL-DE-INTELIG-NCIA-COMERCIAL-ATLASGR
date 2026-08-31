import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: 'AtlasGR — Central de Inteligência Comercial',
          short_name: 'AtlasGR',
          description: 'CRM com IA para equipes comerciais de alta performance',
          theme_color: '#F97316',
          background_color: '#111827',
          display: 'standalone',
          orientation: 'portrait-primary',
          scope: '/',
          start_url: '/app',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'CRM', url: '/app/crm', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
            { name: 'Prospecção', url: '/app/prospect', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          ],
        },
        workbox: {
          // Cache de assets estáticos: CacheFirst (imutáveis via hash de build)
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          runtimeCaching: [
            {
              // API do CRM: StaleWhileRevalidate — mostra dado cacheado, busca novo em BG
              urlPattern: /^https?:\/\/.*\/api\/(companies|contacts|deals|activities)/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'atlas-crm-data',
                expiration: { maxAgeSeconds: 300, maxEntries: 200 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Assets de fontes e ícones: CacheFirst
              urlPattern: /\.(woff2?|ttf|otf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'atlas-fonts',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
          // Exclui rotas de API real do service worker (não cachear POST/PATCH/DELETE)
          navigateFallbackDenylist: [/^\/api\//, /^\/webhook\//],
        },
        // Desabilita em modo dev para não interferir com HMR
        devOptions: { enabled: false },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: true, // Permite acesso via rede (0.0.0.0)
      port: 3005, // O backend já usa a 3005 via env.PORT e serve o Vite via middleware.
      strictPort: true, // Garante que se usarem Vite standalone, ele tente usar a 3005.
      proxy: {
        '/api': {
          target: 'http://localhost:3005',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // ignored: sem isso, o Vite observa o projeto inteiro (inclusive playwright-report/ e
      // test-results/, que o Playwright regrava a cada teste enquanto o servidor de e2e roda essa
      // mesma config em middleware mode) — cada gravação do relatório disparava um full reload da
      // página no meio do teste, derrubando login/formulário em andamento (TEST-002).
      watch: process.env.DISABLE_HMR === 'true' ? null : {
        ignored: ['**/playwright-report/**', '**/test-results/**', '**/coverage/**'],
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/');
            if (!normalizedId.includes('/node_modules/')) return undefined;

            if (
              normalizedId.includes('/react/') ||
              normalizedId.includes('/react-dom/') ||
              normalizedId.includes('/react-router') ||
              normalizedId.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
            if (normalizedId.includes('/framer-motion/') || normalizedId.includes('/motion/')) {
              return 'vendor-motion';
            }
            if (normalizedId.includes('/lucide-react/')) {
              return 'vendor-icons';
            }
            if (normalizedId.includes('/@dnd-kit/')) {
              return 'vendor-dnd';
            }
            // ECharts é ~750kB antes de tree-shake — chunk dedicado para lazy load
            if (normalizedId.includes('/echarts/') || normalizedId.includes('/zrender/')) {
              return 'vendor-echarts';
            }
            // Tiptap + ProseMirror
            if (normalizedId.includes('/@tiptap/') || normalizedId.includes('/prosemirror-')) {
              return 'vendor-tiptap';
            }
            // React PDF (pdf-lib + fontkit)
            if (normalizedId.includes('/@react-pdf/') || normalizedId.includes('/pdf-lib/') || normalizedId.includes('/fontkit/')) {
              return 'vendor-pdf';
            }
            // Embla Carousel
            if (normalizedId.includes('/embla-carousel')) {
              return 'vendor-carousel';
            }
            return undefined;
          },
        },
      },
    },
  };
});
