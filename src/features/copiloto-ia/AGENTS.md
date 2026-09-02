# AGENTS.md — Copiloto Comercial IA (fundação)

## Dono
Quem implementa cada onda seguinte do pacote `atlasgr_copiloto_ai_pack` (ver
`.claude/PILOTS.md` para o registro do piloto que criou esta fundação e
`C:\Users\Marks\Desktop\ATLASGR_COPILOTO_IA_AGENTES_PROMPTS_EXTENSAO_CHROME` para o pacote de
especificação original — agentes, prompts e roadmap por onda).

## O que é
Fundação de dados/domínio/RBAC (Onda 1 do roadmap do pacote) para captura e estruturação de
conversas comerciais com transcrição real e consentimento auditável (Google Meet, ligação) — não
existe ainda captura de mídia real (extensão Chrome), transcrição, inteligência de conversação nem
writeback no Bitrix; isso é Onda 2 em diante. NÃO substitui `ConversationSignal`
(`src/features/intelligence`), que lê janelas de `WhatsAppMessage`/e-mail já persistidas sem
transcrição bruta nem consentimento de gravação — são modelos complementares, não duplicados.

## Pode alterar
- domínio/regras/persistência deste módulo (`domain/`, `application/`, `infra/`, `presentation/`,
  `routes/`) e seus testes.

## Não pode
- Não criar/editar migration diretamente sem que `prisma/schema.prisma` já reflita a mudança
  proposta — qualquer novo campo/model deste módulo segue o mesmo processo usado para os 6 models
  atuais (`CopilotoConversation`, `CopilotoTranscriptSegment`, `CopilotoInsight`,
  `CopilotoCrmFieldSuggestion`, `CopilotoDealHealthSnapshot`, `CopilotoConsentRecord`): schema +
  migration versionada em `prisma/migrations/`, nunca `prisma db push`.
- Não remover a policy de RLS das 6 tabelas (`prisma/migrations/20260902130000_copiloto_ia_rls`) —
  é a camada real de isolamento de tenant, não o filtro em `where` (ver `/AGENTS.md`, "Separação
  visual não é prova de isolamento").
- Não implementar writeback real no Bitrix a partir de `CopilotoCrmFieldSuggestion.status =
  APPROVED` sem antes resolver o mapeamento `semantic_field -> UF_CRM_*` real do portal do tenant
  (ver `docs/BITRIX_FIELD_MAPPING.md` do pacote) — nunca assumir um código `UF_CRM_*` fixo.
- Não iniciar captura (`startCapture`/`CAPTURING`) sem `consentStatus` em `GRANTED`/`NOT_REQUIRED`
  — regra estrutural em `CopilotoIaUseCases.startCapture`, não remover essa checagem.
- Não afrouxar `COPILOTO_IA_ROLES` (`src/lib/auth/authorization.ts`) sem decisão humana explícita.

## Coordenação
- Siga `/AGENTS.md` para conflitos e handoffs.
- RBAC: `COPILOTO_IA_ROLES`/`canAccessCopilotoIa` vivem em `src/lib/auth/authorization.ts` (fonte
  única de RBAC do repositório — não duplicar a hierarquia aqui).
- DI: repositório/use cases/controller registrados em `src/shared/di/setup.ts`; rota montada em
  `src/bootstrap/routes.ts` (`/api/copiloto-ia`, com `authenticateToken` + `requireTenant` +
  `requireRole` no mount central, e de novo no próprio router — defesa em profundidade, mesmo
  padrão de `commercial-intelligence`).
- Auditoria: consentimento e aprovação/rejeição de sugestão de campo de CRM chamam
  `AuditService.log` explicitamente (`entity: 'COPILOTO_IA_CONSENT'` /
  `'COPILOTO_IA_CRM_FIELD_SUGGESTION'`) — qualquer nova mutação sensível (PII, decisão humana sobre
  writeback) deve seguir o mesmo padrão.

## Definição de pronto local
- `npx tsc --noEmit`, `npm run lint` sem erro novo neste módulo.
- testes de `application/__tests__/` (regras de negócio puras: máquina de estados, gate de
  consentimento, validação de evidência) e RBAC ponta-a-ponta
  (`tests/integration/rbac-e2e-copiloto-ia.test.ts`, mesmo padrão de
  `rbac-e2e-commercial-intelligence.test.ts`: sessão real via Better Auth, 2 organizações,
  isolamento cross-tenant).

## Gate mínimo
- `npx tsc --noEmit`
- `npm run lint`
- `src/features/copiloto-ia/application/__tests__/**`
- `tests/integration/rbac-e2e-copiloto-ia.test.ts`
- `npm run build`

Não registrar sucesso sem executar o teste correspondente.
