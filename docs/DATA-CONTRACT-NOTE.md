# Contrato de dados canônico — Note

P2 (Arquitetura e Manutenção), item 4: "Documentar contratos frontend/backend por feature
crítica". Nota é um recurso pequeno, mas é o primeiro fluxo de escrita que um SDR/closer usa no
drawer do Lead — e a auditoria feita para fechar o gap de Clean Architecture desta feature (ver
`docs/ADR/ADR-002-Clean-Architecture.md`, seção "Atualização — 2026-08-21") descobriu uma
divergência real de contrato ativa em produção, corrigida nesta mesma rodada.

## Camadas

| Camada | Arquivo |
|---|---|
| Prisma | `prisma/schema.prisma`, `model Note` |
| Domain | `src/features/notes/domain/Note.ts` |
| Repository | `src/features/notes/infra/PrismaNoteRepository.ts` |
| Use Cases | `src/features/notes/application/NoteUseCases.ts` |
| Controller/Rotas | `src/features/notes/presentation/NoteController.ts`, `src/features/notes/routes/note.routes.ts` |
| DTO/API | `noteSchema` (`src/lib/zod.ts`), `docs/openapi.yaml` (`NoteInput`/`Note`/`NoteResponse`/`NoteListResponse`) |
| UI (consumidor real) | `src/features/crm/components/LeadDetailDrawer.tsx` |
| UI (helper não usado) | `src/lib/db.ts` (`leadsDB.addNote`) — ver "Achado" abaixo |
| Tipo de UI | `src/types/index.ts` (`interface Note`) |

## Rotas

Montadas em `server.ts:427` como `app.use('/api/leads/:leadId/notes', authenticateToken,
requireTenant, noteRoutes)`.

| Método | Path | Papéis | Handler |
|---|---|---|---|
| GET | `/api/leads/:leadId/notes` | qualquer autenticado | `NoteController.getNotesByLead` → `NoteUseCases.findNotesByLead` |
| POST | `/api/leads/:leadId/notes` | ADMIN, GESTOR, CLOSER, SDR | `validateRequest(noteSchema)` → `NoteController.createNote` → `NoteUseCases.createNote` |
| DELETE | `/api/leads/:leadId/notes/:noteId` | ADMIN, GESTOR | `NoteController.deleteNote` → `NoteUseCases.deleteNote` |

Resposta sempre no envelope `{ success: boolean, data? }`, exceto DELETE (`204`, sem corpo) — igual
ao padrão das demais 8 features Clean Architecture já registradas em
`src/shared/di/setup.ts`.

## Campo a campo

| Campo | Prisma | Domain/Repository | `noteSchema` (POST) | UI (`types/index.ts`) | Observação |
|---|---|---|---|---|---|
| `id` | `String @id @default(cuid())` | idem | gerado pelo servidor (não aceito no body) | `string` | — |
| `content` | `String` | idem | obrigatório, `min(1)` | `string` | — |
| `author` | `String` | idem | **obrigatório**, `min(1)` | `string` | Ver achado abaixo — era enviado só por um caminho |
| `leadId` | FK obrigatória (`onDelete: Cascade`) | idem | vem do path (`:leadId`), não do body | `string` | Repositório sempre confirma `leadId` pertence à `organizationId` do usuário autenticado antes de ler/escrever (`verifyLead`) |
| `createdAt`/`updatedAt` | `DateTime` (auto) | idem | gerado pelo servidor | `string` (serializado) | — |
| `organizationId` | não é coluna própria de `Note` — isolamento é via `Lead.organizationId` | `verifyLead(organizationId, leadId)` | vem de `req.user.organizationId` (`AuthRequest`), nunca do body | não exposto na UI | Multi-tenant garantido pelo relacionamento com `Lead`, não por uma FK direta em `Note` |

## Achado real desta sprint — `author` nunca chegava ao backend pelo caminho de UI usado

`LeadDetailDrawer.tsx` (o único lugar que realmente adiciona notas no produto — o painel de
detalhe do Lead do board de CRM) chamava:

```ts
await api.post<Note>(`/api/leads/${lead.id}/notes`, { content: noteText.trim() });
```

— sem `author`. Como `noteSchema` exige `author` (`min(1)`, igual documentado em
`docs/openapi.yaml:NoteInput`), toda submissão real do formulário de nota no CRM retornava
`400 Bad Request` (`ZodError: "Autor é obrigatório"`) via `validateRequest`/`errorHandler`.
`src/lib/db.ts` já tinha um helper (`leadsDB.addNote(leadId, content, author)`) com o contrato
certo — mas nenhum componente da aplicação o chamava; ficou como código morto ao lado do bug real.

**Corrigido nesta rodada**: `LeadDetailDrawer.tsx` agora lê `currentUser?.name` de
`useAuth()` (`src/contexts/AuthContext.tsx`) e envia `author` no corpo da requisição, com o mesmo
fallback (`|| 'Usuário'`) já usado em outras telas do produto (`AppTopbar.tsx`,
`SinglePageDashboard.tsx`) para o caso raro de `currentUser` ainda não ter carregado.

Este é o tipo de divergência que `docs/DATA-CONTRACT-LEAD.md` já registrou para vários campos do
`Lead` (contrato correto na doc/Zod/OpenAPI, mas um consumidor de UI específico não seguindo o
contrato) — aqui a causa raiz era simples o bastante para corrigir na mesma rodada em vez de
registrar como pendência.

## Pendência não corrigida nesta rodada

- Não existe teste automatizado (unitário de componente, nem e2e) cobrindo
  `LeadDetailDrawer.tsx:handleAddNote` — o bug acima não foi pego por nenhuma suíte existente.
  Adicionar um teste de componente ou um passo no fluxo e2e de CRM (`tests/e2e/crm.spec.ts`) que
  efetivamente submeta o formulário de nota fecharia essa lacuna; não foi feito aqui por exigir
  Postgres/e2e real, que este ambiente de execução não tinha disponível (ver
  `docs/architecture/METRICAS-QUALIDADE.md`).
