# Constituição de Design Engineering — Central de Inteligência Comercial ATLASGR

Este arquivo é a camada permanente de direção visual e de engenharia de frontend deste
repositório. Qualquer sessão do Claude Code que crie, edite ou revise UI neste projeto deve ler
isto primeiro. O objetivo não é decoração: é garantir que toda interface nova pareça **desenhada
para este produto**, não gerada por um modelo genérico de IA.

Este documento **não autoriza redesenho da aplicação**. Ele define como qualquer trabalho visual
futuro deve ser pensado e executado. Mudanças visuais amplas só acontecem quando pedidas
explicitamente pelo usuário.

Esta constituição é revisada com base em pilotos reais, não em teoria — cada piloto de tela vira
aprendizado incorporado aqui e um registro curto em `.claude/PILOTS.md`. Ver Piloto 001
(`WelcomeScreen.tsx`) para o primeiro caso que moldou as seções 5, 6 e 9.

## 1. O que é este projeto

- **Produto:** "Prospector" — Central de Inteligência Comercial, um CRM B2B com IA (prospecção,
  pipeline, roleplay de vendas, automações, analytics) para duas marcas irmãs:
  - **AtlasGR** (Revenue OS) — logística/risco de carga. Cor primária `#FF5618` (laranja).
  - **Total Trac** (Fleet OS) — telemetria de frota. Cor primária `#374898`/`#008FCE` (azul).
  A marca ativa troca em runtime (`src/contexts/BrandContext.tsx`, `data-brand` no `<html>`) e
  reescreve os tokens de cor via `document.documentElement.style.setProperty`.
- **Stack:** React 19 + TypeScript + Vite 6 + React Router 7 + Express/Prisma no backend.
  Tailwind CSS 4 **CSS-first** (sem `tailwind.config.*`, tudo via `@theme` em
  `src/styles/globals.css`). Framer Motion para animação. `@dnd-kit`/`@hello-pangea/dnd` para
  drag-and-drop (Kanban do CRM). `recharts` para gráficos. `lucide-react` para ícones.
  `@react-three/fiber` + `drei` + `three` já são dependências reais, usadas hoje só num widget de
  gamificação decorativo (`src/features/gamification/components/SpaceGame.tsx`) e no
  `AtlasOrb.tsx`.
- **Também é um app Android** via Capacitor (`android/`, `capacitor.config.ts`) — todo layout
  precisa funcionar em viewport de celular de verdade, não só "responsivo em teoria".
- **Público:** ferramenta de trabalho interna para times comerciais (SDR, closers, gestão). Não é
  um site de marketing/landing scrollytelling — a exceção são as telas pré-login
  (`WelcomeScreen.tsx`, `SelectionScreen.tsx`), que são telas de seleção de marca, não uma página
  de vendas.

## 2. Fontes de verdade que já existem — leia antes de inventar novas

Não recrie o que já existe. Nesta ordem:

1. **`src/styles/globals.css`** — único lugar onde tokens de design (`@theme`) são definidos.
   Sistema de cor "warm neutral": `--bg`, `--surface`, `--surface-2`, `--ink`, `--ink-2`, `--line`,
   `--brand`, `--brand-2`, `--warn`, `--ok`, `--soft`. Dark mode via classe `.dark`
   (`@custom-variant dark`). Dois tokens de radius (`--radius-card`, `--radius-card-lg`) e um de
   sombra (`--shadow-card`).
2. **`docs/BrandConstitution.md`** — paleta oficial, tipografia (Montserrat/Space Grotesk),
   diretrizes de marca em texto.
3. **`identidade-visual/atlasgr/` e `identidade-visual/totaltrac/`** — logos, ícones, tokens
   (`.css`/`.ts`/`.json`) e `preview.html` de cada marca. Abra o `preview.html` antes de supor uma
   cor de marca.
4. **`DESIGN_QA_CENTRAL_ATLASGR.md`** — auditoria de design já feita neste repo (scores por
   categoria, débito técnico visual conhecido, o que já foi corrigido e o que ainda falta). Antes
   de "descobrir" um problema de design, confira se ele já está documentado ali.
5. **`src/lib/motion.ts`** — variantes e hooks de animação já padronizados (`fadeInUp`,
   `staggerContainer`, `useTilt`, `useMagnetic`, easings `EASE_PREMIUM`/`SPRING_SOFT`). Reuse antes
   de inventar uma curva de easing nova.
6. **`src/components/ui/`** — primitivos existentes (`Button`, `Card`, `Badge`, `Dialog`, `Drawer`,
   `EmptyState`, `Skeleton`, `Pagination`, `Timeline`, `Toaster`). Componha a partir daqui.
7. **`.claude/PILOTS.md`** — registro curto de aprendizados por piloto de tela real. Consulte antes
   de reabrir uma investigação ou decisão já tomada num piloto anterior.

## 3. Como usar as skills em `.claude/skills/`

| Skill | Quando carregar |
|---|---|
| `frontend-design` | Sempre que for desenhar ou revisar qualquer tela, componente ou fluxo novo. |
| `ui-ux` | Decisões de composição, hierarquia, estados, fluxo, densidade de informação. |
| `design-system` | Antes de criar um token, variante de componente ou padrão visual novo — para não duplicar o que já existe (ver débito de tokens duplicados no DESIGN QA). |
| `motion-design` | Qualquer animação, transição, scroll reveal ou microinteração. |
| `accessibility` | Todo componente interativo, formulário, modal, navegação. Não opcional. |
| `performance` | Ao adicionar dependência, animação contínua, 3D, mídia externa, listas grandes, imagens. |
| `visual-qa` | Depois de qualquer mudança visual, antes de reportar como concluído. |

Essas skills são específicas deste repositório — elas apontam para arquivos reais, tokens reais e
débitos técnicos reais já mapeados, não para teoria genérica de design. `CLAUDE.md` define os
princípios (a constituição); cada skill define como avaliar, implementar e verificar esses
princípios na prática (o conhecimento operacional). Evite duplicar o mesmo parágrafo nos dois
lugares — se uma explicação detalhada já existe numa skill, referencie-a em vez de repeti-la aqui.

## 4. As 10 regras visuais (não-negociáveis)

1. **Evitar "AI slop"** — nada de composição genérica de gerador de landing page. Toda tela deve
   ter uma decisão de design identificável, não um template.
2. **Hero centralizada não é o padrão.** Antes de centralizar título+subtítulo+CTA, considere
   composição assimétrica, grid com conteúdo real, ou ancoragem lateral. (Nota: `WelcomeScreen.tsx`
   usa composição centralizada de propósito — é uma exceção justificada pelos critérios da seção 5,
   não o padrão a copiar em telas novas. Ver `.claude/PILOTS.md`, Piloto 001, para o raciocínio
   completo.)
3. **Sem gradiente azul/roxo genérico.** Este produto tem paleta própria (laranja AtlasGR / azul
   Total Trac, ambos definidos em tokens). Gradiente roxo/azul de "IA genérica" é proibido em
   qualquer tela nova.
4. **Sem três cards iguais só para preencher espaço.** Se o conteúdo não sustenta 3 itens
   simetricamente iguais, não force a grade. Densidade de informação real > simetria decorativa.
5. **Sombra, blur ou glassmorphism só com propósito.** `.glass-panel`/`.glass-card` já existem em
   `globals.css` — use-os com intenção (hierarquia, camada, foco), não como enfeite padrão em todo
   card novo.
6. **Sem animação gratuita.** Toda animação justifica sua existência: comunica estado, guia
   atenção, ou dá feedback. Se remover a animação não muda o entendimento da interface, remova a
   animação.
7. **3D não é decoração.** `@react-three/fiber`/`three` já existem no projeto — antes de usá-los
   em uma tela nova, pergunte se o 3D comunica algo que 2D não comunica. Ver `performance/SKILL.md`
   para o custo real disso.
8. **UX nunca é sacrificado por estética.** Legibilidade, previsibilidade e velocidade de tarefa
   vêm antes de qualquer escolha visual.
9. **Performance nunca é sacrificada por motion.** Ver `performance/SKILL.md`.
10. **Nunca quebrar funcionalidade existente para melhorar aparência.** Qualquer mudança visual
    precisa preservar o comportamento coberto por `tests/e2e/` (`crm.spec.ts`, `auth.spec.ts`,
    `contact-company-forms.spec.ts`, `command-palette.spec.ts`, `leads-crud.spec.ts`) e pelos testes
    de acessibilidade/visuais já existentes. Ver seção 6 para como isso se aplica a conteúdo e
    funcionalidade que não são cobertos por teste automatizado.

## 5. Regra de exceção justificada

As regras da seção 4 descrevem o **padrão default** deste produto, não uma proibição absoluta. Uma
regra formulada como "X não é o padrão" (regras #2, #4, #5, #6 principalmente) pode ser excepcionada
quando há justificativa real baseada em:

- objetivo da tela;
- fluxo (onde ela entra na jornada do usuário);
- quantidade de informação real disponível;
- contexto (ex.: tela antes da escolha de marca, estado único, gate institucional);
- hierarquia da informação;
- arquitetura já existente na vizinhança (telas do mesmo módulo/fluxo).

Nunca por preferência estética isolada ("acho mais bonito assim"). Ao usar uma exceção, explique
**por escrito** (na resposta ao usuário, ou em `.claude/PILOTS.md` se for um piloto) qual critério
acima se aplica e por que a exceção é melhor para aquele caso específico. Sem essa justificativa
explícita, a exceção não é válida — siga o padrão da regra.

Isso existe para que Design Engineering não vire um checklist mecânico: seguir a letra de uma regra
sem entender seu propósito pode produzir um resultado tão genérico quanto ignorá-la.

## 6. Preservação de conteúdo e funcionalidade

Antes de remover ou alterar texto, crédito, informação, link, ação, controle, mídia, elemento
institucional ou funcionalidade existente por parecer visualmente inadequado, classifique o que ele
é:

1. **Conteúdo** (texto, crédito, informação institucional)
2. **Regra de negócio**
3. **Requisito institucional**
4. **Funcionalidade** (algo que o usuário pode fazer/usar)
5. **Elemento puramente decorativo**

Só o item 5 pode ser removido livremente por motivo estético. Os itens 1-4 exigem preferir
**refinamento** (reestilizar, reposicionar, reduzir ênfase) a remoção. Remoção só é aceitável quando
estiver claramente dentro do escopo pedido pelo usuário ou for tecnicamente necessária — e mesmo
assim, documente o que foi removido e por quê. Mídia legada questionável (ex.: um recurso externo
sem uso claro) é documentada e discutida antes de ter seu comportamento alterado, nunca removida
silenciosamente só por parecer desnecessária — ver `performance/SKILL.md` para o caso concreto já
encontrado neste projeto.

## 7. Direção de arte — pense antes de implementar

Antes de escrever JSX/CSS para qualquer tela ou componente novo, responda (mentalmente ou em
comentário de PR) a estas perguntas, na ordem:

1. **Composição** — qual é o elemento dominante? O que o olho vê primeiro e por quê?
2. **Hierarquia** — a ordem visual corresponde à ordem de importância real da informação para o
   usuário comercial que vai usar isso no dia a dia?
3. **Tipografia** — a escala usa `font-sans`/`font-display` (token `--font-brand-sans`) ou está
   hardcoded? H1-H3 já têm tamanho/peso definidos em `@layer base` — reuse, não redefina.
4. **Escala e densidade** — este é um dashboard/CRM de uso repetido, não uma landing page. Prefira
   densidade de informação alta e espaçamento eficiente a espaço em branco decorativo excessivo.
5. **Contraste** — cores de texto sobre `--brand`/`--brand-2` já têm um problema documentado
   (DQA-19, resolvido com `--color-brand-active`) — não reintroduza texto de baixo contraste sobre
   cor sólida de marca.
6. **Ritmo visual e grid** — mantenha consistência com o grid já usado nas telas vizinhas do mesmo
   módulo antes de inventar um novo.
7. **Cor** — use os tokens (`bg-brand`, `text-ink-2`, `border-line` etc.), não hex cru. Se a tela
   precisa reagir à troca de marca AtlasGR↔Total Trac, use os tokens dinâmicos (`--brand`), não as
   classes estáticas `atlas-orange`/`totaltrack-blue` (que existem de propósito só onde as duas
   marcas devem aparecer lado a lado, como em `WelcomeScreen`/`SelectionScreen`). **Tema e marca são
   eixos independentes**: um token de tema (`bg-bg`, `text-ink`) resolve reatividade a claro/escuro,
   não automaticamente a marca. Superfícies pré-seleção de marca reagem a tema mas precisam manter
   as duas marcas com peso visual igual — ver `design-system/SKILL.md`.
8. **Estados** — todo componente interativo precisa de hover, focus-visible, active, disabled,
   loading e erro definidos antes de ser considerado pronto. Ver `ui-ux/SKILL.md`.
9. **Microinterações e movimento** — ver seção 8 e `motion-design/SKILL.md`.
10. **Responsividade** — ver `ui-ux/SKILL.md`; lembre que este app roda em Android real via
    Capacitor.

## 8. Motion — filosofia

**Framer Motion é a biblioteca de animação padrão deste projeto** (`src/lib/motion.ts`, com suporte
a `prefers-reduced-motion` via `useReducedMotion`/`MotionConfig`). GSAP e a expansão do uso de 3D
(`@react-three/fiber`) só entram com necessidade comprovada que Framer Motion/CSS não resolvem — os
critérios operacionais completos (e por que ainda não se aplicam hoje) estão em
`motion-design/SKILL.md` e `performance/SKILL.md`.

Princípio único que governa toda animação nova, contínua ou não: **antes de criar `repeat:
Infinity`, pulse, glow animado, scale contínuo, box-shadow animado ou parallax permanente, pergunte
"que informação ou estado esta animação comunica?"**. Se a resposta for "nenhuma", ela provavelmente
não deve existir — priorize animação de entrada/saída, mudança de estado, feedback e continuidade
espacial em vez de loop decorativo. `prefers-reduced-motion` é sempre respeitado.

## 9. Mídia, áudio e vídeo

Áudio, vídeo e mídia externa nunca carregam ou tocam automaticamente por conveniência estética — só
quando há necessidade real, e com controle do usuário. Recursos externos (CDN de terceiros, como o
áudio já existente em `WelcomeScreen.tsx`) custam rede e bateria mesmo mutados/pausados, e precisam
ser avaliados quanto a privacidade, disponibilidade, CSP e performance antes de adicionar um novo —
critérios operacionais completos em `performance/SKILL.md`. Mídia legada questionável é tratada como
qualquer outra funcionalidade existente (ver seção 6): documentada e discutida antes de ter seu
comportamento alterado, nunca removida silenciosamente por parecer desnecessária.

## 10. Acessibilidade — requisitos mínimos

Não negociável em nenhum componente novo ou editado:

- Navegável por teclado (Tab/Shift+Tab/Enter/Escape/setas onde fizer sentido).
- Foco visível (`:focus-visible` global já existe em `globals.css`; componentes com anel próprio
  devem manter contraste AA).
- Contraste de texto ≥ 4.5:1 (texto normal) / 3:1 (texto grande) — especialmente texto sobre cor
  sólida de marca, onde já houve bug real (DQA-19).
- Semântica HTML correta antes de `role`/`aria-*` — `<button>` para ação, `<a>` para navegação,
  landmarks (`<main>`, `<nav>`, `<header>`) na raiz de toda tela.
- Labels associados a todo input (`label-has-associated-control` é um débito conhecido — não
  aumente-o).
- Estados de erro, vazio e loading sempre visíveis e anunciáveis, não só visuais.
- `prefers-reduced-motion` respeitado em qualquer animação CSS ou Framer Motion nova.
- Ver `accessibility/SKILL.md` para o checklist completo e o débito já mapeado (`eslint.config.mjs`,
  `tests/e2e/accessibility.spec.ts`).

## 11. Performance — requisitos mínimos

- Não adicionar dependência nova sem justificar por que os primitivos/libs já presentes
  (`framer-motion`, `recharts`, `lucide-react`, `@dnd-kit`, `three`/`@react-three/fiber`) não
  resolvem.
- Lazy loading por rota/tab já é o padrão (`React.lazy` + `Suspense` em todos os módulos) — siga-o
  em qualquer tela nova.
- Nenhuma animação ou render 3D contínuo fora da viewport/tab ativa.
- Mídia (áudio/vídeo/imagens pesadas) segue a seção 9 — detalhamento operacional (rede, bateria,
  CSP, preload, local vs. externo) em `performance/SKILL.md`.
- Preservar performance mobile (Capacitor/Android) como requisito de primeira classe, não
  secundário ao desktop.

## 12. Processo obrigatório para qualquer tarefa de design/UI

1. **Audite antes de implementar**: leia os arquivos de "fontes de verdade" (seção 2) relevantes à
   tela/componente em questão.
2. **Verifique débito técnico conhecido**: consulte `DESIGN_QA_CENTRAL_ATLASGR.md` e
   `.claude/PILOTS.md` para não reintroduzir um problema já corrigido, nem "descobrir" de novo algo
   já documentado.
3. **Componha a partir do que existe**: tokens, primitivos `ui/`, variantes de `src/lib/motion.ts`.
4. **Implemente** seguindo as regras visuais (seção 4), a regra de exceção (seção 5), a preservação
   de conteúdo/funcionalidade (seção 6) e a direção de arte (seção 7).
5. **Verifique acessibilidade, motion, mídia e performance** antes de considerar pronto (seções
   8-11).
6. **QA visual**: siga `visual-qa/SKILL.md` — comandos de verificação, classificação de warnings, e
   amplitude de QA proporcional ao risco da mudança (um ajuste pontual não exige as mesmas
   combinações que uma mudança em autenticação, layout ou design system). Quando a suíte oficial não
   puder rodar por limitação real de ambiente, siga o protocolo dessa skill em vez de pular a
   verificação ou declarar sucesso sem tê-la feito.
7. **Registre o piloto**: se a tarefa for a primeira implementação real orientada por esta
   constituição num fluxo/tela ainda não coberto, adicione uma entrada curta em `.claude/PILOTS.md`.
   Não é necessário para ajustes pequenos em telas já pilotadas.

## 13. O que este arquivo não é

Esta constituição não é uma licença para redesenhar o app inteiro, trocar a biblioteca de
componentes, ou "modernizar" telas que não foram pedidas. Ela existe para que, quando uma mudança
visual for pedida, o resultado pareça parte deste produto — não um componente genérico colado por
cima dele.
