---
name: error-resilience
description: Use quando a API falha e o usuário não recebe feedback, quando uma operação bulk é reportada como "erro" mesmo tendo parcialmente funcionado, ou ao caçar catch(error){ console.error } sem retorno ao usuário, loading infinito, retry infinito ou optimistic update sem rollback. Classifica falhas em recoverable/retryable/fatal/partial em vez de tratar tudo como "deu erro".
---

# Error Resilience — Central de Inteligência Comercial ATLASGR

## Quando usar

Ative quando o sintoma for "a API falhou e nada aconteceu na tela", "o botão ficou travado", "um
erro de operação em lote não diz quantos itens falharam", ou ao revisar qualquer `catch` novo.
Também aciona como segunda opinião sempre que `functional-completeness`/`end-to-end-flow-validator`
chegam no elo "TRATA ERRO" da cadeia.

## Missão

Eliminar falhas silenciosas e garantir que todo erro tem um destino visível e uma ação de
recuperação — não apenas "logar e seguir como se nada tivesse acontecido".

## Antes de editar

Leia o padrão de erro já correto deste projeto antes de inventar um novo:

- **`src/shared/middlewares/errorHandler.ts`** já normaliza erro de forma consistente:
  `ZodError` → 400 + `details: issues`; `AppError` (classe própria, com `statusCode`/`details`) →
  status customizado; `Prisma.PrismaClientKnownRequestError` `P2002` → 409 "registro já existe",
  `P2025` → 404 "não encontrado"; qualquer outro erro → 500 com mensagem genérica em produção
  (`env.NODE_ENV === 'production'`) mas mensagem real fora dela. **Use `AppError` para erros de
  negócio novos em vez de `throw new Error()` genérico** — só assim o handler global classifica
  corretamente o status HTTP.
- **`src/lib/api.ts`** já lança `Error` com mensagem legível para timeout (`"A API demorou demais
  para responder..."`) e falha de rede (`"Não foi possível conectar ao servidor."`) — reuse essas
  mensagens/padrão em vez de propagar o erro cru do `fetch` pra UI.
- **AI gateway** (`src/lib/ai/gateway.ts`) já tem um circuit breaker real (Redis-backed, 3 falhas →
  30s cooldown, fallback in-memory se Redis cair) e sanitização de mensagem de erro do provedor
  antes de logar/expor — bom padrão de referência para qualquer integração externa nova que precise
  de resiliência.
- **Achado real já documentado, não redescobrir do zero, só confirmar estado atual**: `pushLeadToBitrix`
  (`src/features/integrations/bitrix/service/outboundSync.ts`) é fire-and-forget — o próprio
  código-fonte reconhecia isso como lacuna ("ainda não é visível NA TELA para o operador",
  `BITRIX24-LEAD-FLOW-AUDIT.md` P1-3). O schema já ganhou `bitrixSyncStatus`/`bitrixSyncError`/
  `bitrixSyncedAt` em `Lead` desde então — confirme se `LeadDetailDrawer.tsx` já expõe esse status
  antes de reportar isso como ainda quebrado.
- **Achado real de "erro disfarçado de sucesso"**: o pipeline Apollo órfão
  (`src/lib/enrichment/apollo.ts`) tem fallback de dado **mockado/fabricado** quando a API key não
  está configurada — pior que uma falha silenciosa, porque parece um sucesso real. Ao caçar falha
  silenciosa, procure também esse padrão inverso: sucesso fabricado quando a dependência real falta.

## Investigação

Procure em toda a aplicação (grep sistemático, não amostragem):

- `catch (error) { console.error(...) }` / `catch { }` sem re-throw, sem `AppError`, sem toast, sem
  atualização de estado de erro visível ao usuário.
- Promise disparada sem `await`/`.catch()` (fire-and-forget não intencional — diferente do
  fire-and-forget intencional documentado, como o push Bitrix, que pelo menos deveria ter um plano
  B declarado).
- Loading que nunca sai de `true` porque o `catch` não passa por um `finally`/não limpa o estado de
  loading.
- Botão que fica preso em `disabled` depois de uma submissão que falhou (o estado de "enviando"
  nunca reverte).
- `fetch`/chamada de integração externa sem timeout — toda chamada de rede deste projeto deveria ter
  um teto de tempo explícito (o padrão em `api.ts`/`gateway.ts`/serviços de integração já usa
  `AbortController`/wrappers de timeout — qualquer chamada nova sem isso é regressão).
- Retry infinito (sem teto de tentativas) — compare contra os padrões corretos já existentes
  (`client.ts` do Bitrix: `BITRIX_MAX_ATTEMPTS=4`; WhatsApp: `MAX_RECONNECT_ATTEMPTS=5`).
- Erro de API descartado silenciosamente na camada de hook (`useDatabase.ts`/hooks de feature) —
  `error` do estado existe mas nenhum componente o lê/exibe.
- Optimistic update sem rollback — estado local atualizado antes da confirmação do backend, sem
  reversão se a chamada falhar.
- Operação bulk parcialmente concluída relatada como sucesso total ou falha total, sem o número
  real de itens.
- Toast ausente onde o padrão do projeto (`src/lib/toast.ts`/`Toaster.tsx`, já usado em formulários
  de contato/empresa — ver `ui-ux/SKILL.md`) já existe e deveria ter sido reusado.
- Mensagem técnica exposta ao usuário (stack trace, mensagem de driver Postgres crua, erro de
  provedor de IA não sanitizado — comparar contra `sanitizeProviderMessage` do AI gateway como
  padrão correto).
- Erro externo não normalizado — erro de Bitrix/Google/Apollo/WhatsApp propagado com o formato do
  provedor em vez de mapeado para o formato de erro do produto (`{success:false, error}`).

## Classificação de falhas

- **Recoverable** — usuário pode tentar de novo manualmente (validação falhou, campo inválido);
  precisa de mensagem clara do que corrigir, não um retry automático.
- **Retryable** — sistema pode/deveria tentar de novo automaticamente (timeout de rede, 503/429 de
  integração externa) — com teto de tentativas e backoff, nunca infinito.
- **Fatal** — o fluxo precisa parar e ser sinalizado com clareza (erro de autenticação, dado
  corrompido, violação de integridade) — não deveria ter retry automático nem prosseguir
  silenciosamente.
- **Partial** — parte da operação ocorreu, parte não. Nunca reportar como sucesso total nem falha
  total.

## Operações bulk — sempre reportar os quatro números

Toda operação em lote (import de leads do Bitrix, export CSV, envio de mensagens em massa) deve
reportar, no mínimo:

```
total: N
sucesso: X
falha: Y
parcial: Z (itens que tiveram efeito colateral incompleto — ex.: lead criado mas enriquecimento
            falhou)
```

Nunca responder apenas `"Erro"` quando 9 de 10 registros foram processados com sucesso — isso é
literalmente o cenário que este documento pede para nunca acontecer. Ao encontrar uma operação bulk
que hoje só reporta sucesso/falha binário, isso é um achado `HIGH` a registrar (ver escala de
severidade de `release-readiness`).

## Processo de execução

1. Grep sistemático pelos padrões da seção "Investigação" no diretório/módulo em escopo — não é
   amostragem, é varredura completa do escopo perguntado.
2. Para cada ocorrência, classifique a falha (recoverable/retryable/fatal/partial) e verifique se o
   tratamento atual corresponde à classificação certa (ex.: um erro fatal sendo tratado como
   recoverable — usuário fica tentando de novo algo que nunca vai funcionar).
3. Confirme se existe um padrão correto já estabelecido no projeto para esse tipo de erro (toast,
   `AppError`, circuit breaker) antes de inventar um tratamento novo — reuse primeiro.
4. Corrija priorizando: (a) falha fatal sem sinalização nenhuma, (b) sucesso fabricado disfarçando
   falha real, (c) bulk sem contagem parcial, (d) o resto.

## Evidências necessárias

Cite `arquivo:linha` do `catch`/fluxo silencioso, e demonstre o comportamento real (reproduzir o
erro e mostrar que a UI não muda) sempre que possível — não apenas apontar o padrão de código como
suspeito.

## Regras de implementação

- Toda correção de erro segue o formato canônico do projeto: `AppError` no backend,
  `{success:false, error}` na resposta, toast (`src/lib/toast.ts`) no frontend onde já é o padrão.
- Retry ganha teto de tentativas e backoff, nunca é "infinito por omissão".
- Bulk ganha contagem `total/sucesso/falha/parcial` explícita na resposta e na UI.
- Não invente uma biblioteca de tratamento de erro nova — os primitivos já existem
  (`AppError`, `errorHandler`, `toast`, circuit breaker do AI gateway como referência de padrão).

## Validação

- Force o erro de verdade (payload inválido, timeout simulado, serviço externo indisponível) e
  confirme visualmente/via teste que o usuário recebe feedback real, não apenas leia o código e
  assuma que o `catch` funciona.
- Specs de integração relevantes, se existirem, para o caminho de erro específico.
- Para bulk, teste com um lote misto (alguns itens válidos, alguns inválidos) e confirme que a
  resposta reflete os quatro números corretamente.

## O que não fazer

- Não troque um `console.error` silencioso por um `alert()`/mensagem técnica crua — isso não é
  resiliência, é só mudar onde o erro aparece sem melhorar a experiência.
- Não adicione retry automático a um erro fatal (ex.: 401/403) — isso mascara o problema real e
  irrita o usuário com tentativas fadadas a falhar.
- Não "resolva" uma operação bulk parcialmente falha revertendo tudo (rollback total) sem que isso
  seja o comportamento de negócio esperado — parcial é um estado legítimo a comunicar, não
  necessariamente a evitar.
- Não normalize erro de integração externa de forma que perca informação útil para debug
  (`correlationId`, código de erro do provedor) — normalizar é sobre o formato exposto ao usuário,
  não sobre apagar o log estruturado interno.

## Quando parar e pedir aprovação de escopo/Git

Pare antes de mudar o comportamento de fire-and-forget de uma integração em produção (ex.: tornar o
push automático do Bitrix síncrono/bloqueante) sem confirmar com o usuário — isso pode ter
implicações de latência percebida que são decisão de produto, não só de resiliência técnica.

## Critérios de conclusão

- [ ] Toda falha silenciosa encontrada no escopo foi classificada
      (recoverable/retryable/fatal/partial) e corrigida de acordo com essa classificação.
- [ ] Nenhuma operação bulk no escopo reporta só sucesso/falha binário quando pode ter resultado
      parcial.
- [ ] Nenhum `catch` novo foi deixado sem caminho visível ao usuário (toast, mensagem de erro,
      estado de UI) ou log estruturado rastreável.
- [ ] Retry automático introduzido tem teto de tentativas e backoff.
- [ ] O comportamento foi confirmado forçando o erro de verdade, não só por leitura de código.
