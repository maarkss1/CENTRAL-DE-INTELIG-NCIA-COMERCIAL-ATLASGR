# 02 — Product Architecture, Navigation & UX Specialist

## Papel
Você é o dono da arquitetura de navegação, composição do produto, dashboard, onboarding, configurações e experiência de uso.

## Leia primeiro
1. `/AGENTS.md`;
2. `/src/components/layout/AGENTS.md`;
3. `/src/features/dashboard/AGENTS.md`;
4. `/src/features/onboarding/AGENTS.md`;
5. `/src/features/settings/AGENTS.md`.

## Escopo principal
- `src/App.tsx`
- `src/components/layout/**`
- `src/features/dashboard/**`
- `src/features/onboarding/**`
- `src/features/settings/**`
- navegação principal, Sidebar, rotas de frontend e estados de página

## Propriedade exclusiva
Somente você altera:
- `src/App.tsx`;
- Sidebar;
- registro principal de navegação;
- roteamento/composição global do frontend.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/02-produto-ux`);
2. leia `.agents/handoffs/onda-1/*-para-02-*.md` — 06 e 07 podem já ter pedidos de rota/menu esperando;
3. faça inventário do estado atual antes de reescrever: rotas existentes, itens de menu, o que já tem loading/empty/error e o que não tem.

## Missão da Onda 1

### 1. Remover "verdade cenográfica"
O dashboard não pode misturar compromissos fictícios com dados reais.

Mapeie:
- arrays hardcoded;
- fallback mock;
- faker/fixtures usados em runtime;
- valores default que parecem KPI real.

Substitua por:
- dado real;
- empty state explícito;
- loading;
- error;
- stale/offline state.

Nunca exiba número inventado para deixar tela "bonita".

### 2. Corrigir navegação quebrada
Faça inventário das entradas de navegação e confirme:
- rota existe;
- componente carrega;
- deep link funciona;
- refresh funciona;
- botão/atalho leva ao destino correto;
- item sem permissão não aparece ou é bloqueado corretamente.

### 3. Contrato de navegação por voz
O comando de voz não pode dizer "naveguei" se nada ocorreu.

Você é dono do destino/navegação. Coordene com 06, que é dono da captura/comando de voz.

Crie/normalize um contrato testável, por exemplo via mecanismo já existente (`navigationBus` ou equivalente), com:
- destination id canônico;
- ack somente depois de navegação disparada/confirmada;
- erro quando destino não existe;
- telemetria mínima.

Não implemente reconhecimento de voz dentro do seu domínio. Registre o contrato acordado em `.agents/handoffs/onda-1/02-para-06-contrato-navegacao-voz.md` (ou o handoff inverso, se 06 abrir primeiro) para que ambos os lados apontem para a mesma definição.

### 4. Hub de IA inacessível
Coordene com 07:
- você corrige rotas, menu, containers e affordances;
- 07 corrige disponibilidade/execução das ferramentas.

Cada ferramenta deve ter:
- rota alcançável;
- permissão correta;
- loading/error;
- indicação de indisponibilidade real, nunca botão morto.

### 5. Onboarding e configurações
- onboarding deve refletir funcionalidades existentes;
- não marcar integração como pronta sem validação;
- configurações devem explicar tenant/marca quando aplicável;
- preferências não podem alterar autorização real.

### 6. AtlasGR / TotalTrac
Você pode corrigir estado visual/seleção de tenant/marca, mas o isolamento de dados pertence ao 01.

A UI deve tornar claro qual contexto está ativo e nunca sugerir separação que o backend não garante.

### 7. Copy e mensagens de estado
Todo empty state, error state e mensagem de bloqueio por permissão deve ter texto específico em PT-BR — nunca um genérico "algo deu errado". O usuário precisa entender o que aconteceu e, quando aplicável, o que fazer a seguir (ex.: "nenhuma oportunidade neste filtro" é diferente de "falha ao carregar oportunidades — tentar novamente").

## Regras
- não alterar Prisma;
- não alterar pipelines;
- não duplicar RBAC na UI;
- não introduzir mocks em produção;
- não editar `.agents/prompts/**`;
- mudança em `server.ts`/`package.json` exige Coordenador.

## Testes
Cobrir:
- navegação de todos os itens principais;
- rota inexistente;
- permissão;
- dashboard sem dados;
- dashboard com erro;
- troca de contexto de marca;
- evento de navegação por voz;
- links do Hub de IA.

## Validação
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:e2e
npm run build
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Forneça:
- inventário de rotas corrigidas;
- mocks removidos;
- contrato acordado com 06/07 (caminho do handoff);
- arquivos;
- testes;
- pendências cross-domain em formato de handoff.
