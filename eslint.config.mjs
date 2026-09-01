// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(eslint.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ['dist', 'node_modules', 'build', '*.config.js'],
}, {
  files: ['**/*.{ts,tsx}'],
  plugins: {
    react,
    'react-hooks': reactHooks,
    'react-refresh': reactRefresh,
    'jsx-a11y': jsxA11y,
  },
  rules: {
    ...react.configs.flat.recommended.rules,
    ...react.configs.flat['jsx-runtime'].rules, // React 19: novo JSX transform, não precisa de `import React` em escopo
    ...reactHooks.configs.recommended.rules,
    ...jsxA11y.flatConfigs.recommended.rules,
    'react-hooks/rules-of-hooks': 'off', // O erro de whatsappService estava acusando uso indevido de hook num service
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'react/prop-types': 'off', // TypeScript já cobre isso — regra de projetos JS puro
    // As 6 regras jsx-a11y abaixo foram rebaixadas de 'error' pra 'warn' na introdução do
    // plugin (dezenas de ocorrências não revisadas). Onda 43: todas as ocorrências foram
    // revisadas caso a caso (role/tabIndex/onKeyDown adicionados sem quebrar comportamento
    // existente — inclusive preservando onKeyDown do dnd-kit em Calendar.tsx — e as exceções
    // genuínas documentadas com eslint-disable pontual e justificativa: backdrop de modal com
    // Escape/botão de fechar já cobrindo teclado, <dialog> nativo, autoFocus em modal/página de
    // propósito único, áudio decorativo sem fala, e transcrição textual completa já exibida ao
    // lado da gravação). Voltam ao 'error' padrão do plugin (sem override aqui) — a lista
    // explícita ficava sem propósito depois da correção; DESIGN_QA_CENTRAL_ATLASGR.md, que
    // rastreava o backlog anterior, foi removido do controle de versão em 22/08/2026 — ver
    // docs/REMOVED-DOCS.md.
    // As regras do React Compiler (set-state-in-effect/purity/immutability/use-memo) exigem
    // eslint-plugin-react-hooks >=6; o projeto está fixado em v5.2.0 (revert de v7 — ver
    // git log "fix(08): react-hooks v7 sem migração"), que não as possui. Reintroduzir junto
    // de uma futura migração real de versão do plugin, não isoladamente.
  },
  settings: {
    react: { version: 'detect' },
  },
}, {
  // @react-three/fiber usa props de intrínsecos JSX que não são propriedades DOM reais
  // (position, args, castShadow, emissive, attach, intensity etc.) — falso positivo do
  // react/no-unknown-property, que não conhece o namespace de elementos do react-three-fiber.
  files: [
    'src/features/gamification/components/SpaceGame.tsx',
    'src/features/gamification/components/GameWidget.tsx',
    'src/components/ui/AtlasOrb.tsx',
  ],
  rules: {
    'react/no-unknown-property': 'off',
  },
}, storybook.configs["flat/recommended"]);
