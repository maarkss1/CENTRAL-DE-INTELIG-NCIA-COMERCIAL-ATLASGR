- De: Agente 00 (Coordenador / Antigravity)
- Para: Agente 02 (Produto e UX) e Agente 03 (Design e Acessibilidade)
- Onda: 38
- Status: resolvido
- Prioridade: alto

## Problema
O usuário final solicitou um redesign completo de toda a plataforma para garantir "a melhor experiência e o melhor visual possível", com foco especial em botões, cards, tipografia, alinhamento, hierarquia visual e microinterações auditivas/visuais.

## Arquivo(s) envolvido(s)
- `identidade-visual/MANUAL_UI_UX_PLATAFORMA.md` (novo manual base)
- `src/App.tsx`
- Todos os arquivos globais de CSS/Tailwind (`src/index.css`, `tailwind.config.js`)
- Componentes compartilhados (`src/components/ui/**`)

## Alteração necessária
1. Agente 03 deve ler o `identidade-visual/MANUAL_UI_UX_PLATAFORMA.md` e criar os tokens de design globais no Tailwind (cores institucionais, fontes Mont/Montserrat, radius de 8px para botões e 12px para cards, box-shadows padrão).
2. Agente 02 deve aplicar esses tokens e componentes base em todo o sistema de navegação, formulários e layouts (Sidebar, Header, modais), padronizando alinhamentos à esquerda e garantindo o respiro adequado de whitespace.
3. Agente 02 também deve implementar hooks/providers globais para a resposta de som (`Audio UI`) descrita no manual, ligando aos botões de sucesso, erro e alertas.

## Teste esperado
- A plataforma deve rodar localmente com os novos estilos sem quebrar o layout existente.
- Cores de marca, fontes e interações de botão devem refletir as regras estritas do manual.
- O gate E2E/Playwright não deve quebrar por conta de mudanças de DOM/classes.

## Contexto adicional
Esta é uma iniciativa massiva que requer isolamento em branch separada e sincronia forte entre Agente 02 e 03. Não quebre a funcionalidade, o foco é puramente styling e UX.

## Resolução
Onda 38 está bloqueada pelo Freeze de Escopo da Sprint atual. O RC1 Go-Live foca apenas em features funcionais prontas e paridade. Marcado como resolvido/adiado para o futuro.
