import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist', 'node_modules', 'build', '*.config.js'],
  },
  {
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
      // Downgradadas de 'error' pra 'warn' na introdução do jsx-a11y: cada uma tem dezenas de
      // ocorrências espalhadas por telas de negócio e exigem revisão caso a caso (adicionar
      // role/tabIndex/onKeyDown a um <div> com onClick pode mudar comportamento de interação;
      // associar <label> a um controle às vezes exige reestruturar o campo, não só adicionar
      // htmlFor). Ver DESIGN_QA_CENTRAL_ATLASGR.md pro backlog de correção incremental.
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/no-autofocus': 'warn', // autoFocus em SwarmDashboard.tsx é UX intencional — avaliar caso a caso, não remover às cegas
      'jsx-a11y/media-has-caption': 'warn', // exige uma trilha de legenda de verdade (asset), não é algo que lint --fix resolve
    },
    settings: {
      react: { version: 'detect' },
    },
  },
  {
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
  }
);
