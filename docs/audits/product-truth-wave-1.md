# Onda 1 — Verdade do produto: auditoria de rotas e dados demonstrativos

Data: 2026-08-19.

## Legenda

- **real**: rota/tela consome backend, banco, provedor ou arquivo versionado identificado como fonte operacional.
- **parcial**: há dados reais, mas alguma etapa ainda depende de simulação, provedor opcional, stub de transporte ou lacuna operacional explícita.
- **stub**: contrato existe para integração futura e retorna resposta sintética/controlada.
- **demo**: conteúdo estático ou demonstrativo para explicar experiência, sem pretensão de dado operacional.
- **bloqueado**: rota protegida por papel, feature flag, credencial externa, ambiente ou dependência indisponível.

## Rotas de frontend (`src/App.tsx`)

| Rota | Status | Evidência/resumo |
| --- | --- | --- |
| `/`, `/app` | real | Dashboard consome `/api/analytics` e `/api/activities`; widgets agora exibem erro/offline sem fabricar zeros. |
| `/welcome`, `/select-brand`, `/login`, `/reset-password` | real | Fluxo de autenticação/entrada, sem métricas comerciais. |
| `/app/prospect` | parcial | Usa rotas de prospecção reais, mas descoberta depende de provedores externos/configuração por tenant. |
| `/app/crm`, `/app/crm360`, `/app/mesa-tratamento` | real | CRM, funil e mesa usam APIs autenticadas/tenantizadas. |
| `/app/intelligence`, `/app/topic_training`, `/app/reports` | parcial | IA operacional com fallback/erro por provedor e permissões; não deve ser lida como execução garantida sem credencial. |
| `/app/companies`, `/app/contacts`, `/app/activities`, `/app/calendar` | real | Cadastros e agenda usam endpoints CRUD reais. CompanyDetail foi corrigida para não preencher tecnologias fictícias. |
| `/app/cadence` | parcial | Cadência persiste entidades, mas e-mail/calendário/assinatura ainda têm trechos de transporte stub documentados. |
| `/app/chatbook`, `/app/roleplay`, `/app/qualification_matrix`, `/app/objections_matrix`, `/app/bitrix`, `/app/knowledge` | demo | Experiências de conteúdo/playbook/guia; devem permanecer rotuladas como material de apoio quando não conectadas a dados do tenant. |
| `/app/integrations` | parcial | Painéis conectam Bitrix/WhatsApp/Google/voz quando configurados; partes dependem de credenciais e webhooks externos. |
| `/app/analytics`, `/app/winloss`, `/app/commercial_intelligence` | real | Analytics e inteligência comercial consomem backend; `/app/commercial_intelligence` é bloqueada por papel permitido. |
| `/app/market-intelligence`, `/app/market-intelligence/accounts/:id`, `/app/market-intelligence/deck` | parcial | Inteligência de mercado usa datasets públicos/ETL; depende da atualização dos arquivos de fonte. |
| `/app/propostas`, `/app/usage`, `/app/editor`, `/app/notifications`, `/app/automations`, `/app/team`, `/app/settings` | real | Módulos administrativos/operacionais com backend próprio; `/app/team` bloqueia não-ADMIN. |
| `*` | bloqueado | Redirecionamento seguro para `/welcome` ou `/app`; não representa dado de produto. |

## Rotas de API (`server.ts` e `src/features/**/routes`)

| Grupo de rota | Status | Evidência/resumo |
| --- | --- | --- |
| `/api/auth`, `/api/auth-extra`, `/api/team`, `/api/feature-flags`, `/api/lgpd`, `/api/bug-reports` | real | Operação administrativa/autenticação com middleware de autenticação/tenant quando aplicável. |
| `/api/companies`, `/api/contacts`, `/api/leads`, `/api/activities`, `/api/leads/:leadId/notes`, `/api/crm`, `/api/mesa-tratamento` | real | CRUD/domínio comercial principal em Prisma/repositórios. |
| `/api/analytics`, `/api/commercial-intelligence`, `/api/usage`, `/api/notifications`, `/api/automations` | real | Agregações e operações executivas; sem fallback fabricado no widget ajustado nesta onda. |
| `/api/prospecting`, `/api/prospecting/tools` | parcial | Fluxos reais de descoberta/enriquecimento, porém qualidade/execução dependem de provedores como CNPJ, Places, Apollo/Hunter e credenciais. |
| `/api/intelligence`, `/api/agent`, `/api/prompts`, `/api/knowledge` | parcial | Persistem configurações/ações e chamam provedores de IA quando configurados; rotas de geração podem degradar por credencial/provedor. |
| `/api/bitrix`, `/api/integrations/bitrix`, `/api/google`, `/api/whatsapp`, `/api/integrations/birth-voice`, `/api/integrations/3cx`, webhooks correlatos | parcial | Integrações reais sob credenciais/webhooks; eventos externos podem ficar bloqueados por ambiente. |
| `/api/cadence` e webhooks `/api/webhooks/email`, `/api/webhooks/signature` | parcial/stub | Domínio persiste cadências, mas transporte de e-mail, Google Calendar e assinatura eletrônica tem stubs documentados até provedores finais. |
| `/api/market-intelligence` | parcial | Usa fontes públicas/arquivos de inteligência de mercado, condicionado à atualização do pipeline de dados. |
| `/api/public/proposals` | real/bloqueado | Visualização pública por token; bloqueia sem token válido. |
| `/api-docs` | real/bloqueado | Swagger apenas quando OpenAPI está disponível; fora disso a rota não deve prometer operação. |
| `/api/*` não mapeada | bloqueado | Fallback 404 explícito para evitar endpoints fantasma. |

## Correções feitas nesta onda

1. CompanyDetail não usa mais fallback visual com `React`, `AWS`, `Salesforce`, `HubSpot`, `Docker`, `Google Analytics`, `Shopify` e `PostgreSQL` quando `company.technologies` está vazio; a tela mostra aviso de ausência de detecção real.
2. LiveStatsWidget não converte falha/offline em zeros. Sem backend confirmado, exibe travessões, badge de indisponibilidade e mensagem de erro/reconexão.

## Pendências por status

- Rotas **parciais** devem manter cópia/labels de dependência externa ou stub enquanto não houver credencial/provedor real em produção.
- Rotas **demo** não podem aparecer como métricas reais; se forem promovidas a produto operacional, precisam de fonte, tenant, loading/empty/error e teste.
