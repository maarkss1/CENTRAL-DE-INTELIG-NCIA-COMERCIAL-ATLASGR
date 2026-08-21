- De: 18
- Para: 12
- Onda: 8
- Status: resolvido
- Prioridade: alto

## Resolução
Validado o schema da resposta usando Zod (`birthVoiceResponseSchema`). Agora se a API externa renomear ou remover campos retornará um payload inválido ao invés de prosseguir com undefined.

## Problema
`src/features/integrations/birth-voice/birthVoice.service.ts:146` faz
`const rawData = (await response.json()) as any;` sobre a resposta da API externa do provedor
Birth Voices Hub/Bland AI, e em seguida acessa `rawData.call_id || rawData.sessionId` e
`rawData.status` sem nenhuma validação de forma. É um cast de corpo de resposta HTTP de um
provedor externo — exatamente o tipo de limite de contrato que esconde drift do typecheck: se o
provedor renomear ou remover um desses campos, o código continua compilando e passa a produzir
`sessionId`/`callSid` inválidos ou `undefined`, usados depois para rastrear a ligação automática do
SDR de voz, sem nenhum sinal em tempo de compilação nem de execução.

## Arquivo(s) envolvido(s)
- `src/features/integrations/birth-voice/birthVoice.service.ts:146`

## Alteração necessária
Definir uma interface (`BirthVoiceCallResponse` ou nome equivalente) com os campos realmente
usados (`call_id`, `sessionId`, `status`, e qualquer outro consumido logo depois no mesmo método) e
usar `response.json() as BirthVoiceCallResponse` — ou, melhor ainda, validar com um schema Zod
mínimo antes de acessar os campos (mesmo padrão já usado em outros pontos de integração externa do
projeto, ex. webhooks) para que um payload inesperado do provedor gere um erro tratável em vez de
um valor `undefined` silencioso propagado adiante.

## Teste esperado
- `npx tsc --noEmit` sem erros novos.
- Se houver teste de `tests/unit/features/integrations/birth-voice/**` cobrindo este método,
  adicionar um caso onde a resposta do provedor não tem `call_id`/`sessionId` — hoje isso
  provavelmente já "funciona" silenciosamente com `undefined`; depois da correção, deve falhar de
  forma visível/tratável em vez de propagar um id inválido.

## Contexto adicional
Classificado como risco **alto** porque é um cast de resposta de provedor externo de voz (não
interno), e alimenta o rastreamento de uma ligação automática real — um shape inesperado aqui tem
efeito em produção (chamada telefônica), não só em uma métrica de dashboard.
