# Relatório de Onda: OS-Integracao

**Status:** Em Andamento
**Objetivo:** Integrar os componentes de infraestrutura e front-end fundacionais (construídos na onda anterior) nos módulos ativos do sistema.

## Equipe da Onda e Isolamento de Escopo (Worktrees)

Conforme governança, a concorrência exige propriedade disjunta. Os seguintes agentes atuarão simultaneamente sem sobreposição de arquivos:

### 1. Agente 02 — Produto e UX
**Missão:** Aplicar os novos componentes de interface nas rotas principais.
- `src/App.tsx` (Microinterações framer-motion e contexto PWA).
- `src/components/layout/*` (Substituir disparo de busca para o novo CommandPalette).
- `src/components/ui/*`

### 2. Agente 04 — CRM e BI
**Missão:** Refatorar as listas pesadas e dashboards.
- `src/features/companies/*` e `src/features/contacts/*` (Integrar `VirtualTable`).
- `src/features/document-editor/*` (Integrar `RichTextEditor`).
- `src/features/analytics/*` e dashboards (Integrar `ECharts`).

### 3. Agente 07 — IA e Automações
**Missão:** Ligar o sistema de memória persistente.
- `src/features/intelligence/*`
- `src/lib/ai/*` (Conectar o `mem0.ts` no `useAssistantChat` ou `agents`).

### 4. Agente 10 — Infraestrutura, Observabilidade e SRE
**Missão:** Amarrar os entrypoints do app para garantir observabilidade e PWA.
- `src/main.tsx` (Registrar Service Worker do Vite PWA).
- `server.ts` (Importar o tracker `otel.ts` e iniciar Sentry, com permissão especial aprovada).
- `vite.config.ts` (Ajustes finos de build, se necessário).

### 5. Agente 15 — Segurança Aplicada
**Missão:** Injetar os middlewares de segurança.
- `src/middleware/auth.ts` (ou similar)
- `src/lib/security/*`
- `infrastructure/opa/*` (Amarrar os testes do OPA no Express).

## Critério de Release (Gate)
```bash
npx tsc --noEmit
npm run lint
npm run build
```

---
*Coordenador (00) - Start da integração.*
