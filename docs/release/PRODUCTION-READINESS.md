# Production Readiness — Caminho Operacional de Solicitação de Titular (LGPD)

- **Autor:** Agente 08 (QA, Documentação, CI/CD, Deploy e Release Gatekeeper)
- **Onda:** 8 — Acabamento e Go-Live
- **Data:** 2026-08-15
- **Escopo deste documento:** item único da missão do Agente 08 na Onda 8 — "01 garante controle
  de acesso... e mecanismo técnico de exclusão/anonimização de dado pessoal mediante solicitação"
  (`.agents/completion/01-bloqueadores.md`) e a responsabilidade do 08 em `/AGENTS.md` → "LGPD e
  dados pessoais": *"08 garante, na checklist de release, que existe caminho operacional para
  atender solicitação de titular (acesso, correção, exclusão) e que isso está documentado."*
  Não é a checklist de release completa (versão/gates/rollback/observabilidade) — essa já existe,
  como placeholder desatualizado, em `docs/reports/RELATORIO_PRODUCTION_READINESS.md` (Onda 3) e
  não foi tocada aqui para não criar duplicata nem afirmar status que não foi reverificado nesta
  rodada.

## 1. Resumo executivo

A plataforma **já tem um mecanismo técnico real** — não apenas teórico — para atender os três
direitos do titular do Art. 18 da LGPD (acesso, correção, exclusão/anonimização), implementado
pelo Agente 01 ao longo das Ondas 1 e 6. Nesta rodada eu:

1. **Li o código real** de ponta a ponta (rotas, serviço, worker, script, testes) para confirmar o
   que existe de fato, não o que a documentação anterior afirma existir.
2. **Testei de ponta a ponta contra infraestrutura real** — Docker Desktop, ao contrário do que
   `.agents/runs/onda-8.md` registrava no início desta onda, **estava disponível** neste ambiente
   (containers `atlas_postgres`/`atlas_redis`/`atlas_meilisearch` já em execução, compartilhados
   entre worktrees). Aproveitei a janela para rodar o caminho completo contra Postgres real e um
   servidor HTTP real, não só testes unitários com mock.
3. **Encontrei uma lacuna real** (não mecanismo teórico, não mecanismo ausente): o caminho
   **existe e funciona**, mas **não é self-service para o time comercial nem para o titular** —
   depende de alguém com acesso técnico (API direta ou script de linha de comando) para acionar a
   exclusão/anonimização. Documentada na seção 5 como risco explícito, não maquiada.

**Decisão sobre este item:** não bloqueia release. O mecanismo técnico exigido pelo bloqueador
#13 de `/AGENTS.md` existe, é seguro (RBAC + isolamento de tenant comprovado sob RLS real) e foi
testado de ponta a ponta nesta rodada. A lacuna de self-service é um risco documentado de
prioridade **alta**, não um bloqueador de go-live — ver seção 5 e 6 para prazo/mitigação.

## 2. Mecanismos técnicos mapeados (lidos no código, não supostos)

| Direito (Art. 18 LGPD) | Mecanismo | Arquivo | Como se aciona hoje |
|---|---|---|---|
| **Acesso / Portabilidade** (Art. 18 II/V) | `GET /api/lgpd/titular/:contactId/export` | `src/features/lgpd/lgpd.routes.ts`, `src/features/lgpd/lgpd.service.ts` (`exportContactData`) | Chamada HTTP autenticada (qualquer papel do tenant — sem `requireRole` adicional além de `authenticateToken`/`requireTenant`), retorna JSON estruturado com todos os campos de PII do `Contact` + leads associados + contagem de mensagens WhatsApp |
| **Correção** (Art. 18 III) | `PUT /api/contacts/:id` | `src/features/contacts/routes/contact.routes.ts` (linha 23, `writeRoles = requireRole(['ADMIN','GESTOR','VENDEDOR'])`) | **Já é self-service**: é a mesma tela de edição de contato do CRM (`src/features/contacts/components/ContactForm.tsx`) que qualquer VENDEDOR/GESTOR/ADMIN já usa no dia a dia — não precisa de mecanismo novo, a correção de dado do titular é uma edição de contato comum |
| **Exclusão / Anonimização** (Art. 18 IV/VI) | `DELETE /api/lgpd/titular/:contactId` → `eraseDataSubject()` | `src/features/lgpd/lgpd.routes.ts` (`requireRole(['ADMIN','GESTOR'])`), `src/shared/services/dataSubjectErasure.service.ts` | Chamada HTTP autenticada como ADMIN/GESTOR, **ou** `npx tsx scripts/lgpd-erase-data-subject.ts <organizationId> <contactId>` via linha de comando no ambiente de deploy |
| **Exclusão automática por retenção** (complementar, não é pedido do titular) | Worker BullMQ diário (`0 3 * * *`) | `src/features/crm/jobs/autoAnonymizeDisqualified.worker.ts` | Automático — anonimiza leads em `Negocios_Perdidos` há mais de 90 dias sem interação, reaproveitando o mesmo `eraseDataSubject()` |

O que `eraseDataSubject()` efetivamente apaga/mascara (não é um `DELETE` de linha, é anonimização
irreversível — decisão de design documentada no próprio arquivo, compatível com LGPD Art. 12, que
trata dado anonimizado como fora do escopo da lei):

- `Contact`: nome → `"[titular anonimizado — LGPD]"`, telefone/WhatsApp/e-mail/LinkedIn/data de
  nascimento/observações/`customFields` → nulos/vazios.
- `WhatsAppMessage.body` ligado ao contato → `null`.
- `ConversationSignal` (via `Lead.contactId`) → `summary`/`nextStep`/`objections`/`rawModelOutput`
  redigidos.
- `TimelineEvent` (via `Lead.contactId`) → `description` substituída por marcador de anonimização.
- Idempotente (rodar duas vezes não falha nem duplica efeito — `alreadyAnonymized: true` na
  segunda chamada).
- **Não apaga** `Lead`/negócio comercial em si (histórico comercial preservado, sem PII).

Gaps conhecidos e já documentados no próprio código-fonte (não descobertos agora, apenas
confirmados por leitura):
- `AgentMemory` (sessões de IA) **não é alcançável** por este mecanismo — não tem `contactId`
  estruturado, só `sessionId`/`organizationId`; pode conter PII em texto livre dentro do blob JSON
  de mensagens. Registrado em `.agents/handoffs/onda-6/01A-para-07-agentmemory-sem-vinculo-
  titular.md`.
- `AILog`/`EnrichmentLog` avaliados e considerados fora de escopo (telemetria sem PII de titular
  pessoa física, ou chave por `companyId` e não por titular).

## 3. O que foi testado de fato nesta rodada (evidência real) vs. o que ficou como gap

### 3.1 Testado de ponta a ponta contra infraestrutura real (não simulado)

Docker estava disponível neste ambiente ao longo desta execução (verificado com `docker ps`:
`atlas_postgres`, `atlas_redis`, `atlas_meilisearch` já rodando, compartilhados entre worktrees).
Usei essa janela para ir além do que a nota de `.agents/runs/onda-8.md` antecipava como possível.

**a) Testes automatizados executados nesta sessão:**
```bash
npx vitest run -c vitest.unit.config.ts tests/unit/features/lgpd/lgpd.routes.test.ts \
  src/shared/services/__tests__/dataSubjectErasure.unit.test.ts
# Test Files  2 passed (2) | Tests  10 passed (10)

npx dotenv-cli -e .env.test -- npx vitest run -c vitest.integration.config.ts \
  tests/integration/lgpd-erasure-cross-tenant.test.ts
# Test Files  1 passed (1) | Tests  1 passed (1)
```
O teste de integração roda contra **Postgres real com RLS real** (não bypass no caminho sob
teste): cria titulares em duas organizações, apaga o de `ORG_A` via `eraseDataSubject()`, e
comprova sob RLS real que `ORG_B` não enxerga nada de `ORG_A` (`Contact`, `WhatsAppMessage`,
`ConversationSignal`, `TimelineEvent`, lista de `Lead` — todos vazios/nulos quando lidos do
contexto de `ORG_B`). Também confirma idempotência na segunda chamada.

**b) Chamada HTTP real de ponta a ponta, contra servidor e banco reais**, feita manualmente nesta
sessão para verificar o caminho que um operador humano realmente percorreria (não só a unidade de
código):

1. Subi o servidor real (`npx dotenv-cli -e .env.test -- npx tsx server.ts`) contra o Postgres de
   teste, com as migrações já aplicadas (`npx prisma migrate deploy` — nenhuma pendente).
2. `POST /api/auth/sign-up/email` com e-mail `@atlasgr.com.br` → criou usuário real, primeiro da
   organização, papel `ADMIN` (fluxo real do Better Auth, mesmo caminho que `tests/e2e/helpers.ts`
   usa nos specs Playwright) → `200`.
3. Semeei um `Contact` real na organização criada (`Company` + `Contact` via Prisma, mesmo padrão
   do teste de integração).
4. `GET /api/lgpd/titular/:contactId/export` com o cookie de sessão real → `200`, JSON com os
   dados reais do titular.
5. `DELETE /api/lgpd/titular/:contactId` com o mesmo cookie (papel `ADMIN`) → `200`,
   `{"message":"Dados do titular anonimizados com sucesso.", ...}`.
6. `GET /api/lgpd/titular/:contactId/export` de novo → `200`, confirmando que o `Contact` já
   retorna anonimizado (`name: "[titular anonimizado — LGPD]"`, demais campos PII nulos) —
   fechando o ciclo acesso→exclusão→confirmação por acesso, contra dado real.
7. Rebaixei o mesmo usuário para `VISUALIZADOR` direto no banco e repeti o `DELETE` → `403`,
   `"Insufficient permissions. Required: ADMIN or GESTOR. Your role: VISUALIZADOR."` — confirma
   que o RBAC é avaliado a cada requisição (não fica em cache/JWT desatualizado) e bloqueia de
   verdade um papel sem permissão.
8. Também confirmei sem autenticação: `DELETE`/`GET` em `/api/lgpd/titular/*` sem cookie → `401`
   em ambos, confirmando que a rota está de fato protegida em produção, não só no teste.
9. **Limpeza:** removi todo o usuário/organização/contato de teste criados para esta verificação
   (via script descartável, não commitado) antes de encerrar — nenhum dado de teste ficou no
   banco compartilhado entre worktrees.

Isto é evidência de teste real, não apenas leitura de código: os três papéis (acesso, exclusão,
RBAC negativo) foram exercitados contra um servidor HTTP real, sessão de autenticação real e
banco Postgres real, na sequência que um operador executaria.

### 3.2 Não testado / gap explícito de teste

- **Não testei o script `scripts/lgpd-erase-data-subject.ts` isoladamente nesta rodada** (a função
  que ele chama, `eraseDataSubject()`, já foi exercitada duas vezes acima — via teste de
  integração e via rota HTTP real — então o risco residual é só o parsing de `argv`/saída do
  script em si, não a lógica de negócio). Não bloqueia decisão porque a função subjacente está
  coberta; registrado aqui por transparência.
- **Não testei o worker automático de 90 dias** (`autoAnonymizeDisqualified.worker.ts`) em
  execução real (exigiria esperar o cron ou disparar manualmente um job BullMQ e validar
  side-effects) — reaproveita a mesma `eraseDataSubject()` já validada, mas o agendamento em si
  (`upsertJobScheduler`) não foi exercitado nesta rodada.
- **Não testei um cenário de titular com PII espalhada em `AgentMemory`** — porque, como
  documentado na seção 2, esse caminho **não existe tecnicamente ainda** (gap conhecido, não
  falha de teste).

## 4. Quem executa hoje / processo operacional

Não há, no repositório, um processo de intake documentado (ex.: e-mail de um Encarregado/DPO,
formulário público, endereço de contato) para receber pedidos de titulares externos — isso é uma
decisão de negócio/operação fora do escopo de código, e não encontrei nenhum documento no repo
que já defina isso (busquei por "encarregado"/"DPO"/canal de privacidade em `docs/`). Como
`/AGENTS.md` → "Regra de autonomia" trata decisões de processo de negócio como fora do que um
agente decide sozinho, não vou inventar um responsável — isso vai para a seção 5 como risco.

O que existe, tecnicamente, hoje:
- **Acesso/portabilidade**: qualquer usuário autenticado do tenant (qualquer papel) pode chamar
  `GET /api/lgpd/titular/:contactId/export` — operacionalmente, isso significa que **qualquer
  pessoa do time comercial com login no CRM** pode extrair os dados de um titular para responder
  a um pedido de acesso, desde que saiba o `contactId` (hoje só via chamada de API direta —
  Postman/curl/similar — não há botão na UI).
- **Correção**: **self-service real** — qualquer VENDEDOR/GESTOR/ADMIN corrige o dado do titular
  editando o contato normalmente na tela de Contatos do CRM (`ContactForm.tsx`). Nenhuma ação
  nova necessária.
- **Exclusão/anonimização**: só ADMIN/GESTOR, e só via chamada de API direta ou script de linha
  de comando executado por alguém com acesso ao ambiente de deploy/terminal (tipicamente alguém
  técnico — dev ou infra), não pela UI do CRM.

## 5. Riscos / lacunas explícitas (não maquiadas como resolvidas)

| # | Risco | Severidade | Situação |
|---|---|---|---|
| R1 | **Sem self-service via UI** para exclusão/anonimização — depende de alguém com acesso técnico (API direta ou terminal) para acionar `DELETE /api/lgpd/titular/:contactId` ou o script. Um ADMIN/GESTOR de negócio (não-técnico) não consegue, sozinho, atender um pedido de exclusão de titular sem pedir ajuda a alguém com acesso a Postman/terminal. | **Alto** | Aberto — mecanismo técnico correto existe, mas operação real depende de intermediário técnico |
| R2 | **Sem canal de intake documentado** para o titular enviar o pedido (e-mail de DPO, formulário) e sem prazo de atendimento formalmente definido em nenhum documento do repositório (busquei; não encontrei) | **Alto** | Aberto — decisão de negócio/operação, não de código; nenhum agente deve inventar um responsável ou prazo sem essa decisão |
| R3 | `GET /api/lgpd/titular/:contactId/export` não tem `requireRole` adicional (qualquer papel autenticado do tenant, inclusive VISUALIZADOR, pode exportar PII completa de qualquer titular do tenant) — pode ser aceitável (é leitura, dentro do próprio tenant, já sob RLS) mas vale revisão de negócio: talvez devesse exigir papel mínimo como a exclusão exige | Médio | Aberto — comportamento intencional ou descuido, não fica claro no código; recomendo confirmar com o 01/00 |
| R4 | `AgentMemory` (histórico de conversas de IA) não é alcançado pelo mecanismo de exclusão — pode reter PII de titular em texto livre indefinidamente | Médio | Gap conhecido, já documentado em handoff da Onda 6 (`.agents/handoffs/onda-6/01A-para-07-agentmemory-sem-vinculo-titular.md`), não resolvido |
| R5 | Nenhuma ação de acesso/exclusão de titular é persistida em `AuditLog` — fica só em log estruturado (`logger.info`), não em uma trilha de auditoria consultável no banco | Médio | Débito já mapeado em `docs/compliance/COMPLIANCE_MATRIX.md` ("Auditoria e LGPD ❌ Ausente") — não descoberto agora, apenas confirmado que segue sem correção |
| R6 | Worker automático de 90 dias não foi exercitado em execução real nesta rodada | Baixo | Ver seção 3.2 — risco de teste, não de mecanismo (a função subjacente já foi validada duas vezes) |

Nenhum destes riscos invalida o mecanismo técnico em si — o bloqueador #13 de `/AGENTS.md`
("tratamento de dados pessoais sem... meio de exclusão") está coberto tecnicamente e testado. O
que falta é **processo operacional em torno do mecanismo** (R1/R2), não o mecanismo.

## 6. O que falta para isso ser self-service (recomendações, não implementadas nesta rodada)

Fora do escopo de código desta rodada (edição de `docs/release/**` apenas) — registrado como
recomendação para handoff, não implementado:

1. **UI mínima administrativa** (ex.: uma tela em Configurações/Team, visível só para
   ADMIN/GESTOR) com um campo de busca de contato + botão "Anonimizar dados deste titular (LGPD)"
   chamando o endpoint já existente — não precisa de mecanismo novo no backend, só uma superfície
   de UI para o que já existe. Dono provável: Agente 02 (Produto/UX) para o componente, ou 01 se
   preferir manter perto do domínio de dados.
2. **Definir e documentar** (decisão de negócio, não de código): canal de intake do pedido do
   titular e prazo de atendimento — LGPD não fixa um prazo numérico universal como o GDPR (30
   dias), mas a ANPD espera "prazo razoável"; prática comum no mercado brasileiro é comprometer-se
   com um prazo explícito (frequentemente 15 dias, por analogia ao CDC Art. 43 §3º) — decisão a
   ser tomada pelo dono do produto/negócio, não inventada aqui.
3. **Restringir ou justificar por escrito** o acesso amplo de `GET .../export` (R3 acima).
4. **Cobrir `AgentMemory`** no mecanismo de exclusão (R4) — decisão técnica de como localizar
   sessões de um titular sem varredura cara; provável dono: 01/01A.
5. **Persistir em `AuditLog`** as chamadas de acesso/exclusão de titular (R5) — já é um item mais
   amplo de dívida de auditoria documentado no Compliance Matrix, não específico deste item.

## 7. Ambiente e limitações desta verificação

- Docker Desktop **estava disponível** durante esta execução (ao contrário do que
  `.agents/runs/onda-8.md` registrava no início da onda) — usado para rodar teste de integração
  real e o ciclo HTTP completo descritos na seção 3.1.
- `npx tsc --noEmit`: **limpo** nesta rodada (a primeira execução apontou erros em
  `src/features/integrations/bitrix/service/extraction.ts` por `PrismaClient` desatualizado no
  worktree — resolvido rodando `npx prisma generate`; não é um defeito de código, é um artefato
  de worktree novo sem client gerado. Fora do meu domínio de edição, não fiz mudança de código,
  só regenerei o client local).
- `npm run lint`: **0 erros, 101 warnings** — débito de acessibilidade/`any` já conhecido e
  documentado (`label-has-associated-control`, `no-explicit-any`), nenhum novo, nenhum no escopo
  deste item.
- `npm run build`: **sucesso** (avisos de chunk grande pré-existentes, não relacionados a este
  item).
- `npm run test:unit`/`test:integration` completos (toda a suíte, não só os arquivos de LGPD) não
  foram executados nesta rodada — rodei apenas os testes diretamente relevantes ao item da minha
  missão (LGPD) mais os três gates obrigatórios (`tsc`, `lint`, `build`), conforme instrução desta
  rodada. A suíte completa é responsabilidade do gate de integração da onda, coordenado pelo
  Agente 00 ao mesclar as branches dos 7 especialistas.

## 8. Decisão sobre este item

**Mecanismo técnico de exclusão/anonimização de dado pessoal mediante solicitação: presente,
testado e funcional.** Cobre o bloqueador #13 de `/AGENTS.md` na dimensão técnica.

**Processo operacional em torno dele: incompleto** — funciona, mas não é self-service e não tem
canal de intake/prazo documentado (R1/R2). Recomendo ao Coordenador registrar R1/R2 como item de
prioridade alta para a Onda 9 ou para decisão de produto antes do go-live comercial pleno, sem
necessariamente bloquear o release técnico desta onda — a plataforma já teria, hoje, como atender
um pedido real de titular (por um caminho tecnicamente correto, ainda que não ergonômico), o que é
o requisito mínimo do bloqueador #13.
