- De: Agente 13 (Enxame Autônomo e Governança de Agentes)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 7
- Status: aberto
- Prioridade: normal

## Problema

Fechei a lacuna de "consentimento LGPD verificado antes de PII sair para provedor de IA externo"
(item 2 da minha missão da Onda 7) com um gate **por organização** — `hasPiiExternalConsent()` /
`assertPiiExternalConsent()` em `src/features/intelligence/services/guardrails.service.ts`, gated
por `AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS` (fail-closed, mesmo padrão de dois-fatores de
`SWARM_SCHEDULER_ORGANIZATIONS`/`SDR_COLD_CALL_ORGANIZATIONS`).

Isso é uma base legal **administrativa, no nível do tenant** — não existe hoje nenhum model/coluna
de "consentimento" ou "base legal" por titular (Contact) no schema (`prisma/schema.prisma`).
Confirmei com `grep -in "consent" prisma/schema.prisma` → zero resultados. `docs/lgpd-base-legal.md`
já documenta a base legal real usada pela AtlasGR para dado de prospect B2B como **Legítimo
Interesse (Art. 7º, IX)**, não consentimento individual explícito — então o gate que implementei é
deliberadamente uma autorização administrativa do tenant ("esta organização confirma que tem base
legal para processar dado pessoal de seus titulares via IA externa"), não um checkbox de opt-in por
pessoa.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` (seu, exclusivo — não editei)
- `src/features/intelligence/services/guardrails.service.ts` (meu — `hasPiiExternalConsent`/
  `assertPiiExternalConsent`, já integrado e testado)
- `src/config/env.ts` (`AI_PII_EXTERNAL_CONSENT_ORGANIZATIONS`)

## Alteração necessária (não bloqueadora)

Se a AtlasGR precisar, no futuro, de um controle mais granular (por titular/Contact, não só por
organização) — por exemplo, para atender um Contact que pediu para não ter dado processado por IA
mesmo que a organização como um todo esteja autorizada — o modelo correto seria um campo/relação em
`Contact` (ex.: `aiProcessingConsent: Boolean?` ou uma tabela `Consent` com `contactId`, `basis`,
`grantedAt`, `revokedAt`). Isso é decisão de schema/migração, fora do meu escopo desta onda.

## Teste esperado

Se o campo for criado: o ponto único de verificação (`guardrails.service.ts`) deve evoluir para
checar organização E titular antes de liberar, com teste equivalente aos que já existem em
`src/features/intelligence/services/__tests__/guardrails.service.test.ts` (bloco
`hasPiiExternalConsent`).

## Contexto adicional

Enquanto esse campo não existir, o gate por organização já é fail-closed e cobre os 3 pontos reais
onde PII de um titular real é buscada e processada por um provedor de IA externo
(`SDRQualificationAgent.run`, `OpsAgent.run` com `leadId`, `SDROutboundDraftAgent.draftEmailForLead`)
— ver `.agents/completion/02-mapa-plataforma.md` e o relatório da Onda 7 do Agente 13 para o
raciocínio completo de por que só esses 3 caminhos precisam do gate (BDR/CRM/Closer não têm
ferramenta que busque Contact real).
