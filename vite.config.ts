import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
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
            return undefined;
          },
        },
      },
    },
  };
});
