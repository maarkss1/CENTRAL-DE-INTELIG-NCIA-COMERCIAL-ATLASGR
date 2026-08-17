# CREATIVE SYSTEM 01 — AtlasGR Revenue OS

Primeira entrega obrigatória do `PROMPT MASTER 2.0` (Seção 53), construída sobre o
`PRODUCT_VISUAL_TRUTH_MAP.md`. Este documento é o sistema criativo reutilizável — toda peça futura
(filme, social, evento, apresentação) deriva daqui, não é reinventada peça a peça.

---

## A. Brand Narrative

**Marca:** AtlasGR Revenue OS
**Assinatura:** Inteligência & Aceleração Comercial B2B
**Big Idea:** Do Sinal à Ação
**Verdade estratégica:** toda operação comercial B2B gera sinais (leads, atividades, mudanças de
pipeline, comportamento) — o problema não é falta de dado, é não enxergar o que importa a tempo de
agir. O AtlasGR conecta Sinal → Contexto → Prioridade → Ação → Aprendizado → Decisão.

**Personalidade:** inteligente, madura, precisa, segura, silenciosamente poderosa, executiva.
**Território emocional:** controle (primário), clareza (secundário). Nunca ansiedade, caos visual
ou hype.
**O que o AtlasGR não é:** não é "mais um CRM", não é "IA que faz tudo sozinha", não é dashboard
por dashboard. É a camada operacional que conecta sinal, contexto, prioridade e execução —
a decisão continua sendo humana.

## B. Product Narrative

Arco de três territórios, mapeado a módulos reais confirmados no `PRODUCT_VISUAL_TRUTH_MAP.md`:

1. **DESCOBRIR** — `/app/prospect` (Prospecção: CNPJ, descoberta por critério, OCR),
   `/app/market-intelligence` (concorrência real, score, território). Mensagem: *Encontre onde
   existe movimento.*
2. **EXECUTAR** — `/app/crm` (Pipeline Kanban), `/app/crm360` (Cockpit), `/app/mesa-tratamento`
   (fila priorizada), `/app/cadence` (cadência de contato). Mensagem: *Transforme contexto em
   ação.*
3. **APRENDER E DECIDIR** — `/app/analytics`, `/app/winloss`, `/app/roleplay`,
   `/app/commercial_intelligence` (Revenue Command Center executivo). Mensagem: *Aprenda com a
   operação e decida melhor.*

Toda peça de produto deve responder: **que tela prova qual estágio da narrativa?** — usando
apenas a tabela D do Truth Map.

## C. Visual Language

- **Paleta de runtime** (não a do manual antigo): `#FF5618` primária, `#FF8008` accent,
  `#FFC500` destaque/warn, `#0F9D64` positivo. Bases: grafite/preto suave e branco, conforme tema
  claro/escuro real do produto (`--bg`/`--ink` tokens em `globals.css`).
- **Tipografia:** Montserrat — é o que o produto efetivamente renderiza (`--font-brand-sans`),
  não "Mont"/"Space Grotesk" do manual histórico. Usar Montserrat em toda peça para consistência
  entre produto e comunicação.
- **Tema padrão do produto é escuro** (`ThemeContext` default `'dark'`) — a menos que a peça exija
  o claro por motivo de leitura em determinado meio, priorizar dark mode real por ser o que a
  maioria dos usuários vê.
- **Nada de gradiente azul/roxo genérico, glassmorphism decorativo, holograma, cérebro digital,
  robô, HUD militar** — Seção 19 do briefing e Regra #3 do `CLAUDE.md` do repositório.
- Produto como protagonista: captura de tela real, zoom editorial, crop, foco seletivo — nunca
  reconstrução de UI "inspirada" no produto.

## D. Motion Language

Fonte de verdade: `src/lib/motion.ts` (Framer Motion), confirmada em uso real no app — não
inventar uma linguagem de motion paralela para o filme.

- Curvas: `EASE_PREMIUM`, `SPRING_SOFT`/`SPRING_SNAPPY` — física real do produto, controlada e
  precisa, nunca elástica ou exagerada.
- Padrões a replicar no motion da campanha: `staggerContainer`/`staggerItem` (cards organizando-se
  em sequência), `fadeInUp` com blur de entrada (informação ganhando foco), `pageTransition`
  (continuidade espacial entre módulos, não corte seco).
- `prefers-reduced-motion` é respeitado no produto real (`MotionConfig reducedMotion="user"`) —
  toda peça deve ter uma versão sem dependência de movimento para leitura (legendas, texto
  estático suficiente).
- Proibido: glitch, shake, distorção, rotação 3D gratuita, partículas aleatórias, parallax
  contínuo — nenhum desses existe no produto real.

## E. Sound Language

Segue a Seção 28-30 do briefing: sinal (sons discretos, notificação suave) → contexto (elementos
se organizando) → prioridade (redução de ruído, foco) → ação (feedback preciso, clique/confirmação
curta) → aprendizado (textura evolui) → decisão (resolução musical, assinatura sonora).

Música: electronic minimal, corporate modern, rhythmic ambient, percussão discreta, síntese limpa.
Proibido: dubstep, EDM, trailer épico, motivacional genérico, piano emocional clichê.

Assinatura sonora de 1-2s ainda não existe — é um asset a produzir junto com a primeira peça
audiovisual (não pode ser deduzida do código, é uma decisão de produção nova).

## F. Product Capture Language

Protocolo obrigatório antes de qualquer captura, por cena, seguindo Seção 42 do briefing:

1. Confirmar a cena na tabela D do `PRODUCT_VISUAL_TRUTH_MAP.md`.
2. Ambiente de demonstração com dados criados para a gravação — nunca produção, nunca os e-mails
   reais de `scripts/seed-team.ts`.
3. Tema: escuro por padrão (ver Visual Language), confirmar antes de gravar.
4. Limpar notificações, evitar loading/skeleton/erro em cena (corrigir antes de gravar, nunca
   esconder na edição).
5. Interação real: cursor, filtro, drag-and-drop, expansão — nunca só scroll.
6. Registrar rota e componente exato usado (essa tabela existe justamente para isso).
7. Módulo `commercial_intelligence` exige sessão ADMIN/GESTOR real — planejar a captura com
   usuário de teste com esse papel.
8. `propostas` é iframe de app estático — testar a transição visual antes de decidir se entra numa
   sequência editada com outras telas nativas.

## G. Copy System

Mensagem principal: **Inteligência que encontra o próximo movimento.**

Mensagens secundárias (usar no máximo 2-3 por peça, nunca todas):
Mais contexto para decidir · Mais clareza para agir · Transforme sinais em ação comercial ·
Encontre. Priorize. Execute. · Toda operação deixa sinais. · Veja o que exige atenção. ·
Contexto antes da ação.

Regras de tom: 3-8 palavras por linha na tela, frases executivas e diretas, zero hipérbole
("revolucione", "10x", "o futuro chegou"), zero promessa impossível ("elimina erros", "prevê
exatamente sua receita"). Preferir "ajuda a priorizar", "organiza sinais", "orienta decisões".

## H. CTA System

Padrão: *Conheça o AtlasGR Revenue OS* · *Veja o próximo movimento* · *Explore o Revenue OS* ·
*Transforme sinais em ação*. Nunca urgência artificial ("compre agora", "não perca").

## I. Film Architecture

Biblioteca com 5 camadas, todas derivadas do mesmo arco (Seção 23-24 do briefing):

- **Hero** (60-90s): arco completo Sinal→Contexto→Prioridade→Ação→Aprendizado→Decisão.
- **Produto** (45-60s): como os módulos se conectam (Descobrir→Executar→Aprender/Decidir).
- **Pilares** (15-30s): um por território (Descobrir / Executar / Aprender / Decidir).
- **Módulo** (10-30s): um módulo real por peça (ex.: Comercial Inteligente, Prospecção, Market
  Intelligence, Roleplay) — sempre citando a rota real usada.
- **Microconteúdo** (6-15s): uma ideia, um recorte de tela, uma linha de copy.

Peças curtas usam a forma reduzida **Sinal → Contexto/Prioridade → Ação**, mas pertencem ao mesmo
universo Do Sinal à Ação.

## J. Social Architecture

- **LinkedIn:** 16:9 / 1:1 / 4:5, tom executivo, pode ter texto de apoio maior.
- **Reels/Shorts:** 9:16, hook nos primeiros 2s, ritmo mais direto, legível sem áudio.
- **Stories:** 9:16, safe area rigorosa (topo/base reservados para UI do app do usuário).

Thumbnails: um foco, poucas palavras, produto reconhecível, sem clickbait/setas/círculos
vermelhos.

## K. Event Architecture

16:9, leitura à distância — tipografia maior, menos texto por frame que o padrão social, contraste
alto (o app roda majoritariamente em dark mode, o que já ajuda em telão escuro).

## L. Presentation Architecture

16:9, storytelling consultivo — pode usar o arco completo (seis estágios) com mais tempo de
respiração entre eles que um filme, já que é apresentado com narração ao vivo.

---

## Checklist de conformidade desta entrega

- [x] Nenhuma interface inventada — toda cena referenciada existe na tabela D do Truth Map.
- [x] Nenhum dado inventado — paleta/tipografia validadas contra `globals.css`, não contra o
      manual histórico desatualizado.
- [x] Nenhum cliente/depoimento/número inventado — nenhum foi citado neste documento.
- [x] Identidade AtlasGR respeitada (paleta de runtime, Montserrat).
- [x] Conceito Do Sinal à Ação presente em toda camada (B, I, J).

## Próximo passo sugerido

Com o sistema criativo fechado, o próximo deliverable natural (Seção 53) é o **FILME HERO 01 — Do
Sinal à Ação**, nas 5 durações (90s/60s/30s/15s/6s), com roteiro + storyboard cena a cena. Isso é
um documento extenso por si só — confirmar com o time se seguimos direto para as 5 versões ou se
priorizamos uma duração primeiro (ex.: 30s, formato mais reaproveitável entre canais).
