---
name: frontend-design
description: Use ao criar ou revisar qualquer tela, componente ou fluxo visual novo neste projeto (CRM Central de Inteligência Comercial ATLASGR/Prospector). Evita interfaces genéricas de IA e garante que o resultado pareça desenhado para este produto específico, não um template.
---

# Frontend Design — Central de Inteligência Comercial ATLASGR

Inspirado no princípio do plugin oficial `frontend-design` da Anthropic (evitar estética genérica
de IA, fazer escolhas de design ousadas e específicas ao contexto), adaptado aos tokens, marcas e
convenções reais deste repositório. Se o plugin oficial estiver disponível no ambiente, ele pode
ser usado em conjunto — esta skill é o complemento específico do projeto, com as referências de
arquivo que o plugin genérico não tem.

## O sintoma de "AI slop" a evitar aqui, especificamente

Este projeto já tem exemplos reais do padrão a evitar — não como modelo a copiar, mas como
diagnóstico do que parece "gerado":

- `WelcomeScreen.tsx` **antes do Piloto 001** (ver `.claude/PILOTS.md`): hero centralizada com
  gradiente split laranja/azul + `blur-[120px]`, glow pulsante infinito (`repeat: Infinity`) e um
  crédito em gradiente arco-íris com emoji — o padrão "AI slop" desta seção, materializado. O
  piloto corrigiu a decoração sem propósito, mas **manteve a composição centralizada** — ela é uma
  exceção justificada (ver `CLAUDE.md` seção 5), não um erro. Use o antes/depois documentado em
  `.claude/PILOTS.md` como referência do que "genérico" parece na prática neste projeto — não como
  padrão a copiar (nem o "antes", nem literalmente o "depois": cada tela nova ainda precisa da
  própria direção de arte).
- Cards de métricas idênticos em grade 3x1 "porque preenchem a tela" — se você está prestes a
  criar 3 `Card` visualmente idênticos só para não deixar espaço vazio, pare: ou o conteúdo
  sustenta a repetição (ex.: 3 KPIs reais e distintos), ou a composição precisa de outra forma
  (lista, gráfico, comparação assimétrica).

## Usando uma exceção justificada (seção 5 do `CLAUDE.md`)

As regras desta skill (e as regras visuais #2/#4/#5/#6 do `CLAUDE.md`) descrevem o padrão default,
não uma proibição absoluta. Antes de excepcionar uma delas, responda: qual é o objetivo desta tela
especificamente, em que ponto do fluxo ela está, quanta informação real existe pra organizar, qual
o contexto (ex.: tela antes de qualquer escolha do usuário) e qual a hierarquia real da informação?
Se a resposta justifica a exceção, implemente-a e explique por quê. Se a única resposta for "acho
mais bonito", siga o padrão da regra.

## Antes de desenhar qualquer coisa nova

1. Abra a tela/módulo vizinho mais próximo no mesmo fluxo (`src/features/<feature>/components/`) e
   entenda o padrão de composição já em uso ali — este é um produto com 25+ módulos de feature;
   consistência entre eles importa mais do que uma tela isoladamente "bonita".
2. Liste os tokens que a tela vai consumir (`--bg`, `--surface`, `--ink`, `--brand`, `--line` etc.
   de `src/styles/globals.css`) antes de escrever uma cor hex.
3. Decida a composição pensando no usuário real: um vendedor/SDR usando isso várias vezes por dia,
   frequentemente denso em dados (pipeline, contatos, analytics) — não um visitante de landing page
   vendo a tela uma vez.
4. Verifique se o componente que você vai construir já existe em `src/components/ui/` sob outro
   nome antes de criar um novo primitivo.

## Checklist de saída (antes de considerar a tela pronta)

- [ ] A composição tem um motivo identificável, não é a disposição "padrão" de um gerador (hero
      centralizada + 3 cards + CTA).
- [ ] Nenhum gradiente azul/roxo genérico foi introduzido (paleta é laranja AtlasGR / azul
      Total Trac, via tokens).
- [ ] Cores vêm de tokens (`bg-brand`, `text-ink-2`...), não de hex/rgb cru, exceto onde já é
      padrão do projeto (ex.: `atlas-orange`/`totaltrack-blue` estáticos nas telas de
      pré-seleção de marca).
- [ ] Tipografia usa a escala existente (`font-sans`/`font-display`, H1-H3 de `@layer base`), sem
      redefinir tamanho/peso ad-hoc.
- [ ] Todo `.glass-panel`/blur/sombra tem propósito de hierarquia, não é decoração padrão.
- [ ] Componente foi composto a partir de `src/components/ui/`, não reimplementado do zero.
- [ ] Se alguma regra visual foi excepcionada, a justificativa (objetivo/fluxo/informação/
      contexto/hierarquia) está explícita na resposta ao usuário — não é uma exceção silenciosa.
- [ ] Nenhum texto, crédito, link, controle ou funcionalidade existente foi removido sem antes
      classificar o que ele é (conteúdo/regra de negócio/requisito institucional/funcionalidade/
      decorativo) — ver `CLAUDE.md` seção 6.
- [ ] Passou pelas skills `ui-ux`, `accessibility`, `motion-design` e `performance` relevantes ao
      caso, e por `visual-qa` antes de reportar como concluído.
