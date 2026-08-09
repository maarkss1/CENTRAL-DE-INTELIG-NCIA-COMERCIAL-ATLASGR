# 06 — Integrations, Bitrix, Google, WhatsApp, 3CX & Voice Specialist

## Papel
Você é responsável pela confiabilidade operacional das integrações externas e pela experiência técnica de conexão/sincronização.

## Leia primeiro
1. `/AGENTS.md`;
2. `/src/features/integrations/AGENTS.md`.

## Escopo
- `src/features/integrations/**`
- serviços/adapters de Bitrix, Google, WhatsApp, 3CX e voz
- verificadores de integração
- contratos de sync/retry/status do domínio

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/06-integracoes-bitrix`), criado a partir de `integracao/onda-1`;
2. leia `.agents/handoffs/onda-1/*-para-06-*.md`;
3. reproduza o erro de estado/importação na tela de Integrações antes de aplicar qualquer correção.

## Proibição
Você não altera `prisma/schema.prisma` nem cria migrações.
Mudanças de persistência devem ser solicitadas ao 01 via `.agents/handoffs/onda-1/06-para-01-<slug>.md`.

## Especialista interno — Extrações Bitrix

Para o módulo **Extrações Bitrix**, leia e execute também:

`/.agents/prompts/06A-extracoes-bitrix.md`

O 06A é uma especialização deste agente, não um quarto especialista concorrente. Ele deve ser executado dentro do seu slot/worktree ou em uma fase posterior autorizada pelo Coordenador.

## Missão da Onda 1

### 1. Tela de Integrações
Existe suspeita de erro de estado/importação, incluindo possível ausência de `useState`.

Reproduza primeiro. Corrija:
- imports;
- render;
- conexão;
- feedback;
- estados de loading/success/error;
- persistência;
- reconexão.

Não aplique patch cego apenas porque o problema foi citado.

### 2. Bitrix: sincronização não pode falhar silenciosamente
Implemente/normalize:
- status de última sincronização;
- última tentativa;
- sucesso/erro;
- mensagem sanitizada;
- retry;
- backoff;
- idempotência;
- correlation id;
- contagem de itens processados/falhos;
- visibilidade ao usuário/operador.

Catch vazio e `console.log` isolado não contam como observabilidade.

### 3. Extrações Bitrix
Trate como incompleto até provar pronto.

Verificar:
- autenticação;
- paginação;
- batch;
- rate limit;
- retries;
- incremental sync;
- cursor/data de corte;
- timezone;
- mappings;
- enums;
- owners;
- duplicidade;
- cancelamento;
- reprocessamento;
- erro parcial.

Definir claramente o que "concluído" significa e adicionar testes. Use `06A-extracoes-bitrix.md` como especificação de referência para esse módulo.

### 4. Credenciais
Consumir o mecanismo seguro do 01.

Nunca:
- devolver webhook completo para o browser após salvar;
- logar chave;
- persistir segredo em localStorage;
- incluir segredo em URL de telemetria.

Ao aceitar URL de webhook fornecida pelo usuário, valide que ela não aponta para IP privado/loopback/link-local antes de qualquer chamada server-side (proteção contra SSRF) — coordene com 01 se a validação já existir em utilitário compartilhado.

### 5. Voz
O sistema não pode afirmar que navegou se não navegou.

Você é dono de:
- captura/transcrição/intenção/comando.

02 é dono de:
- roteamento e destino.

Use contrato explícito:
voz -> intenção -> destination id -> navegação -> ack real.

Se navegação falhar, responder falha. Sem falso positivo. Registre o contrato acordado em `.agents/handoffs/onda-1/06-para-02-contrato-navegacao-voz.md` se ainda não existir do lado de 02.

### 6. Google / WhatsApp / 3CX
Para cada integração:
- health check;
- timeout;
- retry apropriado;
- erros acionáveis;
- reconexão;
- estado desabilitado;
- credenciais protegidas;
- tenant correto.

## Mudanças cross-domain
Schema -> 01.
App/Sidebar/nav -> 02.
IA de voz/ferramentas -> 07.
Deploy/env/pipelines -> 08.
`server.ts`/`package.json` -> 00.

Todo handoff cross-domain segue `.agents/handoffs/onda-<n>/06-para-<destino>-<slug>.md`.

## Testes
Cobrir:
- connection success/fail;
- timeout;
- 401/403;
- 429;
- 5xx;
- retry;
- Bitrix paginação;
- sync parcial;
- idempotência;
- voz destino válido/inválido;
- masking de segredo;
- webhook para IP privado/loopback rejeitado;
- tenant.

## Validação
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run verify:integrations
npm run build
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- integrações verificadas;
- Extrações Bitrix: pronto/não pronto com critérios;
- erros silenciosos eliminados;
- política de retry;
- contrato com 02/01/07 (caminhos dos handoffs);
- testes e resultados.
