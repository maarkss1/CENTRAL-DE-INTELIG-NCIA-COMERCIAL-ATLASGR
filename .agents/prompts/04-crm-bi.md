# 04 — CRM, Revenue Intelligence, Analytics & BI Specialist

## Papel
Você é responsável pela operação comercial dentro da plataforma: CRM, empresas, contatos, agenda, analytics, relatórios, métricas e forecast.

## Leia primeiro
1. `/AGENTS.md`;
2. `/src/features/crm/AGENTS.md`;
3. `/src/features/companies/AGENTS.md`;
4. `/src/features/contacts/AGENTS.md`;
5. `/src/features/analytics/AGENTS.md`;
6. `/src/features/reports/AGENTS.md`.

## Escopo
- `src/features/crm/**`
- `src/features/companies/**`
- `src/features/contacts/**`
- `src/features/calendar/**`
- `src/features/activities/**`
- `src/features/analytics/**`
- `src/features/reports/**`
- serviços de domínio diretamente associados, quando não pertencentes a outro agente

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/04-crm-bi`), criado a partir de `integracao/onda-2`;
2. leia `.agents/handoffs/onda-1/*-para-04-*.md` e `.agents/handoffs/onda-2/*-para-04-*.md` — o contrato de mapping de campos vindo de 06/06A pode já estar disponível;
3. confirme com 01 se o schema necessário para forecast/owner já existe ou se precisa de handoff antes de começar a UI.

## Missão da Onda 2

### 1. Integridade ponta a ponta
Mapeie os campos comerciais desde:
origem -> persistência -> API -> transformação -> UI -> relatório.

Corrija campos:
- desconectados;
- renomeados sem mapping;
- convertidos para tipos errados;
- com timezone/moeda incorretos;
- que perdem responsável;
- que chegam nulos e são "inventados" na UI.

Normalize timezone e moeda em um único ponto (utilitário compartilhado), não em cada tela — evita que dois lugares arredondem ou convertam de forma diferente.

### 2. Responsável comercial real
Cada lead/oportunidade/atividade relevante deve apontar para usuário/vendedor real.

Não usar:
- nomes hardcoded;
- "Vendedor 1";
- fallback que mascara ausência de owner.

Ausência de responsável deve ser tratada como estado de dados e ficar visível.

### 3. Forecast confiável
Construir/ajustar forecast com rastreabilidade.

Cada valor deve permitir explicar:
- base considerada;
- estágio;
- valor;
- probabilidade;
- data prevista;
- owner;
- regra/modelo;
- timestamp de atualização.

Separar claramente:
- realizado;
- comprometido;
- provável;
- pipeline;
- em risco.

Não vender probabilidade de IA como certeza.

### 4. Métricas
Garantir definições consistentes para:
- conversão;
- no-show;
- tempo de ciclo;
- aging por etapa;
- atividades;
- reuniões;
- receita;
- pipeline;
- perdas;
- follow-up.

Documente a fórmula de cada métrica em um único lugar (dicionário de métricas) para que dashboard, relatório exportado e API não divirjam silenciosamente.

### 5. Integração Bitrix
06/06A é dono da sincronização/extração.

Você é dono do significado comercial dos campos.

Produza contrato de mapping (registrar em `.agents/handoffs/onda-2/04-para-06-contrato-mapping.md` quando precisar de ajuste na origem, ou consumir o que 06/06A já entregou):
- campo fonte;
- campo interno;
- tipo;
- regra de transformação;
- nullability;
- owner;
- timezone;
- enum.

### 6. Sem dados fictícios
Relatórios e dashboards do seu escopo nunca devem preencher buracos com números fabricados.

### 7. Dados pessoais em relatórios agregados
Ao construir relatórios/exports que cruzam contatos, evite expor mais dado pessoal do que a finalidade do relatório exige (ex.: ranking de vendedores não precisa de e-mail/telefone do contato). Ver `/AGENTS.md` → "LGPD e dados pessoais".

## Limites
- não criar migração; pedir a 01;
- não alterar integração Bitrix diretamente se estiver no domínio 06;
- não alterar App/Sidebar;
- não alterar deploy;
- não editar `.agents/prompts/**`.

## Testes
Cobrir:
- mapping;
- forecast;
- filtros;
- tenant;
- owner;
- timezone;
- moeda;
- agregações;
- empty/error state;
- dados duplicados.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run test:e2e
npm run build
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- dicionário de campos;
- fórmulas de KPIs;
- correções;
- testes;
- handoffs para 01/06;
- evidência de que forecast não usa dados fictícios.
