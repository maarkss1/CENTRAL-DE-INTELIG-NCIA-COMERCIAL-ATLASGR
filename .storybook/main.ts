import type { StorybookConfig } from '@storybook/react-vite';
import { mergeConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Addons deliberadamente NÃO incluídos pelo `storybook init` padrão: @chromatic-com/storybook
// (serviço pago de regressão visual — exigiria conta/token externo não solicitado) e
// @storybook/addon-mcp (expõe um servidor MCP para agentes de IA controlarem o Storybook — fora
// do escopo de "catálogo de componentes").
const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: ['@storybook/addon-vitest', '@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: '@storybook/react-vite',
  // O builder Vite do Storybook não herda automaticamente vite.config.ts da raiz — sem isto, as
  // classes utilitárias do Tailwind 4 (CSS-first, plugin @tailwindcss/vite) não seriam geradas
  // dentro do Storybook e os componentes apareceriam sem estilo.
  async viteFinal(viteConfig) {
    return mergeConfig(viteConfig, {
      plugins: [tailwindcss()],
    });
  },
};
export default config;