---
name: performance
description: Use ao adicionar dependência, animação contínua, uso de 3D/Three.js, listas grandes, imagens, ou qualquer coisa que rode em toda tela do CRM. Cobre code splitting/lazy loading já em uso e o custo real de renderização 3D contínua neste app, que também roda como aplicativo Android via Capacitor.
---

# Performance — Central de Inteligência Comercial ATLASGR

## O que já está certo — não regrida

- **Lazy loading por rota/tab já é 100% do padrão**: todos os 22+ módulos de feature usam
  `React.lazy` + `Suspense`. Toda tela nova entra nesse padrão — nunca importe um módulo de feature
  inteiro estaticamente em `App.tsx`.
- **`vite.config.ts` já faz manual chunking** de `vendor-react`, `vendor-motion` (framer-motion),
  `vendor-icons` (lucide-react), `vendor-dnd` (`@dnd-kit`). Se uma dependência nova for grande e
  usada em poucas telas, considere se ela merece um chunk manual próprio em vez de inflar o bundle
  principal.
- Bundle mobile importa mais que no desktop: o app é empacotado via Capacitor para Android
  (`android/`), rodando em hardware mais restrito e rede potencialmente pior.

## Antes de adicionar uma dependência nova

Pergunte, nesta ordem: `framer-motion`, `recharts`, `lucide-react`, `@dnd-kit`/
`@hello-pangea/dnd`, `three`/`@react-three/fiber`/`drei` já resolvem isso? Este projeto já carrega
duas libs de drag-and-drop (`@dnd-kit` e `@hello-pangea/dnd`) coexistindo por histórico — não
adicione uma terceira. Da mesma forma, não adicione uma segunda lib de animação (GSAP, anime.js,
react-spring) quando `framer-motion` + `src/lib/motion.ts` já cobre o caso — ver
`motion-design/SKILL.md`.

## 3D (`@react-three/fiber`/`three`) — custo real, não é grátis

`three`/`@react-three/fiber`/`drei` já são dependências (usadas em
`src/features/gamification/components/SpaceGame.tsx` e `src/components/ui/AtlasOrb.tsx`). Antes de
expandir esse uso para telas novas:

- **Nunca renderize um `<Canvas>` r3f continuamente fora da viewport ou de uma aba/tab inativa.**
  Pause o `useFrame`/loop de render quando o componente não está visível (`IntersectionObserver` ou
  equivalente do `drei`) e quando a aba do navegador está em background
  (`document.visibilityState`).
- O chunk de `three` é pesado — garanta que qualquer `<Canvas>` novo está atrás de `React.lazy`,
  nunca no caminho crítico de carregamento de uma tela de trabalho (dashboard, CRM, formulários).
- Em mobile/Capacitor, renderização 3D contínua consome bateria e CPU de forma desproporcional —
  trate isso como custo real ao decidir se uma tela de trabalho "merece" um elemento 3D (ver regra
  visual #7 no `CLAUDE.md`: 3D não é decoração default).
- Se o 3D é puramente decorativo (como hoje), prefira reduzir a complexidade da cena (poucos
  polígonos, sem sombras dinâmicas caras) a adicionar fidelidade visual que ninguém vai notar numa
  tela de trabalho.

## Listas e tabelas

- `ContactList`/`CompanyList` já usam `Pagination` compartilhada — não implemente scroll infinito
  ou renderização de lista inteira sem paginação/virtualização em telas com potencialmente
  centenas/milhares de registros (leads, contatos, empresas).
- Anime `transform`/`opacity` em itens de lista, nunca propriedades de layout — o custo se
  multiplica pelo número de linhas visíveis (ver `motion-design/SKILL.md`).

## Imagens

- Logos/ícones de marca já existem otimizados em `identidade-visual/<marca>/` e `public/` — reuse
  em vez de reimportar/reprocessar.
- Imagens de usuário/conteúdo (avatares, anexos) devem usar `loading="lazy"` quando fora do
  viewport inicial.

## Checklist de saída

- [ ] Nenhuma dependência nova foi adicionada sem confirmar que as já presentes não resolvem.
- [ ] Tela nova entra no padrão `React.lazy`/`Suspense` por rota.
- [ ] Qualquer `<Canvas>` r3f pausa fora da viewport/aba inativa e está atrás de lazy loading.
- [ ] Lista/tabela grande usa paginação existente, não renderização total sem limite.
- [ ] `npm run build` não introduziu um chunk desproporcional sem necessidade (checar
      `manualChunks` em `vite.config.ts` se a dependência nova for grande).
