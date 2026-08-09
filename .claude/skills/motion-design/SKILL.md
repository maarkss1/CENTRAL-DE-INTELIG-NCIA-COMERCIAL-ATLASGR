---
name: motion-design
description: Use ao adicionar ou revisar qualquer animação, transição de estado, reveal, parallax ou microinteração. Framer Motion é a biblioteca padrão deste projeto (src/lib/motion.ts) — define quando animar, quando não, e como respeitar prefers-reduced-motion.
---

# Motion Design — Central de Inteligência Comercial ATLASGR

## Biblioteca padrão: Framer Motion

`framer-motion` já é dependência e já tem uma camada de padronização em `src/lib/motion.ts`:

- Variantes prontas: `fadeIn`, `fadeInUp`, `scaleIn`, `staggerContainer(stagger, delayChildren)`,
  `staggerItem`, `pageTransition`.
- Easings padronizados: `EASE_PREMIUM = [0.22, 1, 0.36, 1]`, `EASE_SPRING_SOFT`.
- Springs padronizados: `SPRING_SNAPPY`, `SPRING_SOFT`.
- Hooks de microinteração: `useTilt(intensity)` (inclinação 3D sutil que segue o cursor,
  desativada automaticamente com `prefers-reduced-motion`), `useMagnetic(strength)` (botão
  magnético). Ambos já tratam `useReducedMotion()` internamente — copie esse padrão em qualquer
  hook de motion novo.

**Use essas variantes/hooks antes de escrever uma animação inline nova.** Se a animação que você
precisa não existe em `motion.ts` mas é genuinamente reutilizável (não um caso único), adicione-a
lá em vez de duplicar inline em cada componente.

## Por que não GSAP/ScrollTrigger (por enquanto)

Framer Motion já cobre o que este produto precisa: reveal progressivo (`staggerContainer`/
`staggerItem`), transição entre estados/rotas (`pageTransition`), parallax sutil e microinterações
(`useTilt`/`useMagnetic`). Este é um CRM de uso repetido, não uma página de scrollytelling — GSAP
ScrollTrigger resolveria um problema que este produto não tem hoje. Não adicione a dependência
especulativamente. Se uma página de marketing dedicada com scroll coreografado complexo for
pedida no futuro, primeiro avalie `useScroll`/`useTransform` do próprio Framer Motion antes de
introduzir uma segunda biblioteca de animação.

## 3D (`@react-three/fiber`) — já existe, mantenha contido

`@react-three/fiber`/`three` são dependências reais, hoje só em uso decorativo/gamificação
(`SpaceGame.tsx`, `AtlasOrb.tsx`). Regra do projeto: **3D não é decoração default** — antes de
adicionar uma `<Canvas>` nova, pergunte se ela comunica algo que CSS/SVG/Framer Motion não
comunicam mais barato. O custo técnico real (bundle, CPU/GPU, pausa fora de viewport, bateria
mobile) e os critérios operacionais completos estão em `performance/SKILL.md` — comece por lá antes
de expandir o uso de 3D.

## Regras de quando animar

Antes de criar qualquer animação contínua — `repeat: Infinity`, pulse, glow animado, scale
contínuo, box-shadow animado, parallax permanente, loop decorativo — pergunte: **"que informação ou
estado esta animação comunica?"**. Se a resposta for "nenhuma, só fica bonito", ela não deve
existir. Isso vale mesmo quando a animação é sutil (ex.: um glow de fundo rotacionando devagar) —
sutileza não é isenção da pergunta, só reduz o custo se a resposta ainda for "não comunica nada".

Priorize, nesta ordem de preferência: entrada/saída de conteúdo, mudança de estado, feedback de
ação, continuidade espacial/orientação do usuário. Exemplo real corrigido no Piloto 001
(`.claude/PILOTS.md`): um `boxShadow`/`scale` pulsando para sempre (`repeat: Infinity`, 2s) num
bloco de crédito não comunicava nenhum dos quatro — foi removido; um glow de fundo rotacionando
devagar (mesmo padrão já usado em `LoginScreen`) foi mantido porque estabelece ambientação
consistente entre as telas do funil de autenticação, com custo baixo (`transform`/`opacity`, sem
reflow) e opacidade reduzida o suficiente para não competir com o conteúdo.

- Prefira `transform`/`opacity` (o que `fadeInUp`/`staggerItem` já fazem) — evita reflow/repaint
  caro. Não anime `width`/`height`/`top`/`left` quando `transform` resolve.
- Nunca anime layout (reflow) de forma contínua ou desnecessária — especialmente em listas/tabelas
  densas (`ContactList`, `CompanyList`, `CrmBoard`) onde o custo se multiplica por item.
- Duração/easing consistentes: reuse `EASE_PREMIUM`/springs existentes em vez de valores ad-hoc por
  componente — inconsistência de timing é um dos sinais mais visíveis de "interface remendada".

## `prefers-reduced-motion` é obrigatório, sempre

- CSS puro: `globals.css` já tem um `@media (prefers-reduced-motion: reduce)` global cobrindo
  keyframes customizados e `transition-all`. Não precisa reescrever isso, mas não adicione
  `animation`/`transition` fora do que esse bloco cobre sem verificar que ainda é pego por ele.
- Framer Motion: o root já deve estar envolvido em `<MotionConfig reducedMotion="user">` (ver
  `DESIGN_QA_CENTRAL_ATLASGR.md`, item de acessibilidade do segundo lote). Qualquer `motion.div`
  novo herda esse comportamento automaticamente — não precisa de tratamento manual, exceto em
  hooks customizados como `useTilt`/`useMagnetic`, que checam `useReducedMotion()` explicitamente
  porque manipulam `MotionValue` fora do fluxo declarativo do `motion.*`.
- **Como verificar de fato, não só supor**: com Playwright, abra um `context` com
  `reducedMotion: 'reduce'` e confira `getComputedStyle(el).animationName`/`transitionDuration` do
  elemento animado — deve neutralizar (`animationName: 'none'` ou duração ~0). Foi assim que o
  Piloto 001 confirmou que o `MotionConfig` da raiz realmente propaga, em vez de assumir que sim.

## Checklist de saída

- [ ] Animação usa variante/hook existente de `src/lib/motion.ts`, ou foi adicionada lá se for
      reutilizável.
- [ ] Anima `transform`/`opacity`, não propriedades de layout.
- [ ] Tem uma razão comunicável (estado, atenção, feedback), não é decorativa.
- [ ] Respeita `prefers-reduced-motion` (via `MotionConfig` herdado, ou `useReducedMotion()`
      explícito em hooks customizados).
- [ ] Nenhuma dependência de animação nova (GSAP, Lottie, etc.) foi adicionada sem necessidade
      comprovada que Framer Motion não resolve.
