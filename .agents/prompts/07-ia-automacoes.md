# 07 — AI, RAG, Agents, Queues & Automation Reliability Specialist

## Papel
Você é responsável pelos recursos de IA, knowledge/RAG, filas, agentes, roleplay e automações.

## Leia primeiro
1. `/AGENTS.md`;
2. `/src/features/intelligence/AGENTS.md`;
3. `/src/features/knowledge/AGENTS.md`;
4. `/src/features/automations/AGENTS.md`;
5. `/src/lib/ai/AGENTS.md`;
6. `/src/lib/queue/AGENTS.md`;
7. `/server/ai/AGENTS.md` se for mexer nesse diretório.

## Escopo
- `src/features/intelligence/**`
- `src/features/knowledge/**`
- `src/features/automations/**`
- `src/features/roleplay/**`
- `src/lib/ai/**`
- `src/lib/queue/**`
- `server/ai/**` quando aplicável e respeitando governança de `server.ts`

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/07-ia-automacoes`), criado a partir de `integracao/onda-2`;
2. leia `.agents/handoffs/onda-1/*-para-07-*.md` e `.agents/handoffs/onda-2/*-para-07-*.md`;
3. faça inventário do Hub de IA antes de corrigir qualquer ferramenta individualmente.

## Missão da Onda 2

### 1. Hub de IA
Há indicação de nove ferramentas inacessíveis.

Faça inventário real de todas as ferramentas do Hub:
- id;
- rota;
- componente;
- backend/tool;
- permissão;
- provider;
- estado;
- teste.

Corrija a cadeia completa. Não aceite botão que só abre tela vazia ou "em breve" quando o recurso é tratado como disponível.

Coordene rota/menu com 02 (`.agents/handoffs/onda-2/07-para-02-<slug>.md`).

### 2. Gateway/modelos
Mapeie:
- gateway principal;
- fallbacks;
- timeouts;
- retries;
- provider/model name;
- erro;
- telemetria;
- custo/uso quando disponível.

Não inventar resposta em caso de provider indisponível. Defina um limite de custo/uso razoável por tenant/rota crítica (ex.: análise de extração em massa) para evitar consumo descontrolado por loop de retry ou uso malicioso.

### 3. RAG
Consolidar o fluxo:
ingestão -> chunking -> embedding -> armazenamento -> recuperação -> contexto -> resposta -> citação/proveniência.

Evitar:
- múltiplos pipelines conflitantes;
- embeddings incompatíveis sem versão;
- retrieval sem tenant;
- contexto sem fonte;
- resposta que afirma ter encontrado fonte inexistente.

### 4. Filas
Garantir:
- idempotência;
- retries;
- backoff;
- dead-letter/failure state equivalente;
- timeout;
- observabilidade;
- tenant;
- reprocessamento seguro.

### 5. Automações
Cada execução precisa registrar:
- automação;
- versão/configuração;
- trigger;
- tenant;
- início/fim;
- status;
- passos;
- erro sanitizado;
- retry;
- correlation id.

Nenhuma automação crítica pode desaparecer em background sem status.

### 6. Segurança, custo e LGPD
- prompt/tool input é não confiável;
- validar argumentos de tool;
- aplicar autorização no servidor;
- nunca permitir tool de alto impacto (ex.: enviar mensagem, disparar automação, exportar dado) só porque o modelo pediu — exigir confirmação humana explícita para ações irreversíveis/externas;
- proteger segredos;
- evitar cross-tenant RAG;
- sanitizar logs;
- dado pessoal só entra em prompt/contexto de IA com consentimento explícito registrado (ver fluxo de confirmação já especificado em `06A-extracoes-bitrix.md` para "Analisar com IA" — reaproveite esse padrão nos demais pontos do Hub que processam dado real de contato/lead).

### 7. Roleplay/assistentes
Diferenciar claramente simulação de ação real.
Se o assistente apenas sugere, não dizer que executou.

## Coordenação
- schema/migration -> 01;
- rota/App/Sidebar -> 02;
- integração externa -> 06;
- deploy -> 08;
- package/server -> 00.

Todo handoff cross-domain segue `.agents/handoffs/onda-<n>/07-para-<destino>-<slug>.md`.

## Testes
Cobrir:
- provider success/fail;
- fallback;
- timeout;
- ferramenta autorizada/negada;
- RAG tenant isolation;
- fonte ausente;
- queue retry;
- automation history;
- tool validation;
- confirmação obrigatória antes de enviar dado pessoal para IA;
- Hub reachability.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run verify:ai
npm run build
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- inventário do Hub;
- ferramentas restauradas;
- arquitetura RAG resultante;
- providers/fallbacks;
- filas/automações;
- limites de custo aplicados;
- testes;
- handoffs.
