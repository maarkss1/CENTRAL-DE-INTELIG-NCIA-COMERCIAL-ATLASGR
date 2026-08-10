# Registro de pilotos — Central de Inteligência Comercial ATLASGR

Registro curto de cada tela/fluxo usado como piloto real da camada `.claude/`. Objetivo: não perder
aprendizado empírico depois que a tarefa termina. Ver `CLAUDE.md` seção 12 para quando adicionar uma
entrada nova.

## Pilot 001 — WelcomeScreen

- **Objetivo**: evoluir `src/features/auth/components/WelcomeScreen.tsx` (porta de entrada do
  produto, antes da escolha de marca) para um padrão enterprise, sem virar landing page genérica, e
  validar se a camada `.claude/` orienta esse tipo de tarefa na prática.
- **Problemas encontrados (leitura de código, antes de codificar)**: fundo hex hardcoded ignorando
  `ThemeContext`; ícones do rodapé quebrados (Font Awesome nunca foi dependência do projeto);
  `boxShadow`/`scale` pulsando para sempre (`repeat: Infinity`) sem comunicar nada; gradiente de
  texto tricolor + glow no título; hierarquia invertida (crédito pessoal com mais peso visual que o
  CTA); áudio externo (CDN pixabay) carregando desde o mount.
- **Decisões principais**: manter composição centralizada (exceção justificada — tela é um portão
  de decisão única, sem dado real pra grid, com as duas marcas precisando de peso igual antes da
  escolha); trocar fundo/cores por tokens de tema; remover toda animação em loop sem propósito;
  reaproveitar o padrão de glow ambiente já usado em `LoginScreen` em vez de inventar um novo;
  trocar ícones quebrados por `lucide-react` + SVG inline (convenção já usada em `Logo.tsx`);
  preservar áudio, crédito e todos os links existentes, só reestilizando.
- **Regras da `.claude/` que influenciaram a implementação**: regra visual #6 (sem animação
  gratuita) → remoção do pulso infinito; nota de `design-system` sobre `atlas-orange`/
  `totaltrack-blue` estáticos serem intencionais em pré-seleção → não "corrigir" a ausência de
  reatividade à marca nesta tela; `performance`/`motion-design` (não adicionar dependência nova) →
  ícones sociais viraram SVG inline em vez de uma lib nova.
- **Problemas encontrados só durante QA** (não a leitura de código): `Logo variant="white"` fixo
  ficaria ilegível em tema claro; `text-ink-2/70` no crédito e no selo institucional/link de
  telefone (mobile + claro) davam contraste insuficiente (2.63–4.04:1 vs. mínimo 4.5:1) — o glow de
  fundo, num viewport de 390px, tingia a tela quase inteira; raiz `<div>` sem landmark
  (`landmark-one-main`/`region` do axe-core).
- **Validações executadas**: `eslint` (0 erros), `tsc -b --noEmit` (0 erros), `npm run build`
  (limpo), `vitest run` (70 arquivos/430 testes passando), `axe-core` via Playwright contra o build
  estático real (`vite preview`) em 4 combinações (dark/light × desktop/mobile), verificação de
  `prefers-reduced-motion` via `context({ reducedMotion: 'reduce' })`, checagem de overflow
  horizontal e foco visível no CTA. Suíte oficial `tests/e2e/*.spec.ts` **não pôde rodar** — sem
  Docker/Postgres/Redis pro servidor Express que o `webServer` do Playwright exige.
- **Resultado**: 0 violações de acessibilidade bloqueantes ao final (3 problemas de contraste + 1
  landmark corrigidos durante a implementação); diff restrito a `WelcomeScreen.tsx`; nenhuma outra
  tela tocada.
- **Aprendizados incorporados à constituição** (`CLAUDE.md` seção indicada):
  - Seção 5 — regra de exceção justificada (a composição centralizada da própria `WelcomeScreen` é
    o exemplo de referência).
  - Seção 6 — preservação de conteúdo/funcionalidade (crédito e áudio mantidos, só refinados).
  - Seção 7, item 7 — tema e marca são eixos independentes; detalhado em `design-system/SKILL.md`.
  - Seção 8 — motion precisa responder "que informação comunica?"; detalhado em
    `motion-design/SKILL.md`.
  - Seção 9 — mídia/áudio/vídeo não tem autoplay por estética; detalhado em `performance/SKILL.md`.
  - `accessibility/SKILL.md` — checklist ganhou o item de landmark semântico na raiz.
  - `visual-qa/SKILL.md` — amplitude de QA por risco, classificação de warnings, e o protocolo
    formal para quando a suíte oficial não roda (este piloto é a referência conceitual do protocolo,
    não uma receita obrigatória pra toda tela).
