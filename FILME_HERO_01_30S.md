# FILME HERO 01 — DO SINAL À AÇÃO (Corte 30 segundos)

Roteiro e storyboard construídos sobre `CREATIVE_SYSTEM_01.md` e `PRODUCT_VISUAL_TRUTH_MAP.md`.
Toda cena de produto abaixo está rastreada na tabela D do Truth Map — nenhuma tela, número ou
funcionalidade nova foi inventada aqui.

## 1. Objetivo estratégico

Posicionar o AtlasGR Revenue OS como a camada de inteligência que conecta sinal, contexto,
prioridade e execução comercial — não "mais um CRM", não "IA que faz tudo sozinha". Público-alvo
deste corte: Diretores Comerciais, Heads de Vendas, Revenue Managers e CROs (público primário,
Seção 12 do briefing) vendo a peça no LinkedIn ou em contexto de apresentação comercial. Percepção
que queremos construir: *"eu consigo ver melhor o que está acontecendo na minha operação e onde
agir."*

## 2. Conceito criativo

**Do Sinal à Ação** (já estabelecido em `CREATIVE_SYSTEM_01.md`, Seção A). Este corte de 30s usa a
estrutura reduzida definida na Seção 35 do briefing para essa duração: **Problema → Contexto →
Produto → Ação → Marca**.

## 3. Insight

Toda operação comercial B2B já gera sinal suficiente — o gargalo real é decidir a tempo o que
importa. O AtlasGR não cria dado novo, ele torna o dado existente acionável.

## 4. Mensagem principal

**Inteligência que encontra o próximo movimento.**

## 5. Mensagens secundárias (usadas nesta peça, no máximo 2)

- Toda operação deixa sinais.
- Veja o que exige atenção.

## 6. Storytelling — estrutura dos 30s

| Beat | Tempo | Função narrativa |
|---|---|---|
| Problema | 0:00–0:04 | Sinais dispersos, sem direção |
| Contexto | 0:04–0:09 | A plataforma organiza os sinais |
| Produto | 0:09–0:20 | Descobrir → Priorizar → Executar, módulos reais em sequência |
| Ação | 0:20–0:26 | Execução concreta acontecendo |
| Marca | 0:26–0:30 | Assinatura e mensagem principal |

## 7. Roteiro completo

- **Duração:** 30 segundos
- **Formato:** 16:9 (master), com recortes para 1:1/4:5/9:16 na Seção 16 (Adaptações)
- **Objetivo:** ver Seção 1
- **Público:** ver Seção 1
- **Mensagem:** ver Seção 4
- **Produto mostrado:** `/app` (Painel Central), `/app/crm360` (Cockpit), `/app/prospect`
  (Prospecção), `/app/mesa-tratamento` (fila priorizada), `/app/crm` (Pipeline Kanban) — todas
  confirmadas na tabela D do Truth Map
- **Transição:** continuidade espacial entre módulos (padrão `pageTransition` de
  `src/lib/motion.ts`, sem corte seco) — ver Seção 11
- **Sound design:** ver Seção 12-13
- **CTA:** *Explore o Revenue OS*

## 8. Storyboard cena a cena

| # | Tempo | Visual | Produto/Tela (origem real) | Movimento | Copy na tela | Locução (opcional) | Som |
|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:04 | Fragmentos de informação isolados: recortes pequenos de tela flutuando sem conexão aparente — cada recorte é um crop real do Painel Central, não uma tela cheia | `/app` — `SinglePageDashboard.tsx` (KPIs ao vivo, agenda do dia) | Elementos entram espalhados, sem ordem, câmera parada | "Toda operação comercial deixa sinais." | "Toda operação comercial deixa sinais." | Sons discretos, pequenos eventos de notificação, fragmentados, sem ritmo definido |
| 2 | 0:04–0:09 | Os recortes começam a se aproximar e se organizar em uma composição única — revela o Cockpit CRM360 completo | `/app/crm360` — `CrmOverview.tsx` (KPIs consolidados por intenção: brand/success/warning/violet) | `staggerContainer`: cards entrando em sequência, convergindo para grid organizado | "Contexto transforma informação em direção." | "O AtlasGR conecta esse contexto." | Elemento musical começa a se organizar, batida entra suave |
| 3a | 0:09–0:13 | Zoom editorial em busca de empresa/lead — cursor real interagindo | `/app/prospect` — `ProspectingHub.tsx` (busca por CNPJ / descoberta por critério) | `fadeInUp` com blur de entrada — resultado ganhando foco | "Encontre onde existe movimento." | — | Redução de ruído começa |
| 3b | 0:13–0:16 | Fila de leads priorizada, cursor seleciona o próximo item da fila | `/app/mesa-tratamento` — `MesaTratamento.tsx` (`QueueList`/`CurrentLeadCard`) | Item em destaque ganha foco visual (escala sutil, sem exagero) | "Veja o que exige atenção." | — | Um elemento sonoro único ganha foco, resto do som recua |
| 3c | 0:16–0:20 | Pipeline Kanban, card de lead sendo arrastado de um estágio para o seguinte | `/app/crm` — `CrmBoard.tsx` (drag-and-drop real via `@dnd-kit`) | Drag-and-drop real capturado em tela, movimento físico e preciso (`SPRING_SNAPPY`) | "Contexto vira execução." | "Contexto certo, execução real." | Clique/feedback preciso ao soltar o card |
| 4 | 0:20–0:26 | Corte para tela cheia do Kanban com o card já no novo estágio, painel lateral de detalhe do lead abre (`LeadDetailDrawer`) | `/app/crm` — `CrmBoard.tsx` + `LeadDetailDrawer.tsx` | `Drawer` desliza lateralmente (`framer-motion`), confirmação de ação | "O próximo movimento, executado." | — | Confirmação curta, resolução rítmica |
| 5 | 0:26–0:30 | Fundo escuro/grafite, logotipo AtlasGR centralizado, assinatura abaixo | Tela de encerramento (assets de `identidade-visual/atlasgr/`, não é captura de produto) | Fade suave, sem movimento gratuito | "AtlasGR Revenue OS — Inteligência & Aceleração Comercial B2B — Explore o Revenue OS" | "Inteligência que encontra o próximo movimento." | Maior espaço, resolução musical, assinatura sonora AtlasGR (1-2s, a produzir) |

## 9. Produto utilizado (rotas reais)

`/app` → `/app/crm360` → `/app/prospect` → `/app/mesa-tratamento` → `/app/crm`. Todas confirmadas
implementadas na tabela B do Truth Map. Nenhuma tela do módulo `commercial_intelligence` (restrito
ADMIN/GESTOR) é necessária para este corte de 30s — fica reservada para o corte de 60/90s, onde o
estágio "Decisão" pede uma cena executiva mais forte.

## 10. Direção de arte

Segue `CREATIVE_SYSTEM_01.md` Seção C integralmente: paleta de runtime (`#FF5618`/`#FF8008`/
`#FFC500`), Montserrat, tema escuro (padrão real do produto). Cena 1 usa fundo neutro escuro para
os recortes flutuarem — não inventar um "espaço" ou "grid infinito" genérico, apenas espaçamento
generoso entre os crops reais.

## 11. Motion Design

Toda transição entre módulos usa o padrão real de `src/lib/motion.ts`: `staggerContainer`/
`staggerItem` na cena 2, `fadeInUp` com blur na cena 3a, drag-and-drop nativo capturado (não
recriado em After Effects) na cena 3c, `Drawer` real na cena 4. Nenhum movimento inventado fora do
que o produto já executa — o motion da campanha é literalmente o motion do produto, capturado.

## 12. Sound Design

Segue a progressão da Seção E do Creative System: sinal (disperso) → contexto (organizando) →
prioridade (foco, redução de ruído) → ação (clique/confirmação) → decisão (resolução + assinatura
sonora). A assinatura sonora de 1-2s ainda não existe como asset — precisa ser produzida junto com
esta peça (não pode ser derivada do código).

## 13. Trilha

Electronic minimal / corporate modern, percussão discreta, síntese limpa, sem letra. Build
progressivo alinhado aos 5 beats — não pode ter clímax antes do beat "Ação" (0:20).

## 14. Locução

Opcional — a peça deve funcionar 100% sem áudio (Seção 27, acessibilidade). Quando usada, texto
conforme coluna "Locução" da tabela de storyboard, lido em tom executivo, direto, sem hipérbole.

## 15. CTA

**Explore o Revenue OS** — aparece só na cena 5, junto à assinatura de marca.

## 16. Adaptações

| Canal | Formato | Ajuste específico |
|---|---|---|
| LinkedIn | 16:9 / 1:1 / 4:5 | Master 16:9 funciona direto; para 1:1/4:5, recompor cena 1 e 2 para crops centralizados (os recortes de tela já são pequenos, favorece corte quadrado) |
| Reels/Shorts | 9:16 | Priorizar cenas 3b/3c (Mesa de Tratamento → Kanban) nos primeiros 2s como hook, já que é a cena com movimento mais imediato; comprimir beat 1 para 2s |
| Stories | 9:16 | Mesma base do Reels, respeitar safe area (topo/base ~14% reservados) |
| Site | 16:9 responsivo | Pode rodar sem áudio por padrão (autoplay mudo) — copy na tela já carrega a mensagem sozinha |
| Eventos | 16:9 | Aumentar tamanho de copy on-screen para leitura à distância; reduzir texto por frame (usar só a mensagem principal, cortar secundárias) |
| Apresentação comercial | 16:9 | Pode ganhar 5-8s extra de respiração entre beats se apresentada com narração ao vivo — não é obrigatório manter os 30s exatos neste contexto |

## 17. Plano de produção

**Capturas necessárias** (todas em ambiente de demonstração, dados criados para a gravação — ver
checklist do Truth Map):
1. Painel Central (`/app`) — estado limpo, sem notificação pendente, com agenda do dia preenchida.
2. Cockpit CRM360 (`/app/crm360`) — KPIs com dado de demonstração plausível, sem número inventado
   na pós-produção.
3. Prospecção (`/app/prospect`) — fluxo de busca por CNPJ com resultado real retornado.
4. Mesa de Tratamento (`/app/mesa-tratamento`) — fila com 3-5 leads de demonstração, seleção do
   próximo item.
5. Pipeline Kanban (`/app/crm`) — um card sendo arrastado entre dois estágios reais do funil,
   `LeadDetailDrawer` abrindo em seguida.

**Assets:** logotipo AtlasGR (`identidade-visual/atlasgr/`), fonte Montserrat (arquivo web já no
repo), tokens de cor de `globals.css`.

**Gravação:** tela em alta resolução (mínimo 1920×1080 nativo para permitir crop em 9:16/1:1 sem
perda), cursor visível, tema escuro ativo, seguindo o protocolo de captura da Seção F do Creative
System.

**Edição:** cortes seguindo a tabela de storyboard; transições reaproveitando o motion nativo
capturado em vez de recriar em pós-produção sempre que possível.

**Motion adicional (pós-produção):** apenas os elementos que não existem nativamente na UI — a
composição de "recortes flutuantes" da cena 1 (o produto não faz isso sozinho) e a tela de
encerramento com logotipo (cena 5).

**Áudio:** trilha + sound design conforme Seções 12-13, produção de assinatura sonora nova.

## 18. Checklist de conformidade

- [x] Nenhuma interface inventada — 5 telas, todas na tabela D do Truth Map.
- [x] Nenhum dado inventado — nenhuma métrica numérica específica aparece na peça; KPIs mostrados
      genericamente, sem forjar número.
- [x] Nenhum cliente/depoimento/case inventado.
- [x] Nenhuma funcionalidade inventada — Gamificação, AtlasOrb, SpaceGame não aparecem (não são
      prova real de valor, ver Truth Map Seção B).
- [x] Identidade AtlasGR respeitada — paleta de runtime, Montserrat, tema escuro real.
- [x] Conceito Do Sinal à Ação presente estrutural e literalmente (beats 1→5).
- [ ] **Pendente de produção real:** todas as 5 capturas de tela listadas na Seção 17 ainda
      precisam ser gravadas em ambiente de demonstração — este documento é roteiro/storyboard, não
      substitui a captura real.
