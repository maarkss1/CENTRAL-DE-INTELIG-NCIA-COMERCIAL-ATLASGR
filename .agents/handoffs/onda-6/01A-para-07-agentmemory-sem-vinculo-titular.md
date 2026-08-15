- De: Agente 01A (Confiabilidade de Dados, RLS e Retenção)
- Para: Agente 07 (IA e Automações)
- Onda: 6
- Status: aberto
- Prioridade: normal

## Problema
Implementando a exclusão/anonimização de titular (item 4 da minha missão), encontrei um gap real:
`AgentMemory` (`prisma/schema.prisma`) não tem `contactId`/`leadId` — só `sessionId`, `agentType`,
`organizationId` e um blob `messages Json` com o histórico de conversa do agente de IA. Esse blob
**pode conter PII do titular em texto livre** (nome, telefone, o que a pessoa disse), mas não há
chave estruturada para localizar quais sessões pertencem a qual `Contact`, então
`eraseDataSubject` (`src/shared/services/dataSubjectErasure.service.ts`) não consegue alcançar essa
tabela de forma segura — varrer o conteúdo JSON de todas as sessões da organização procurando o
nome/telefone do titular teria alto risco de falso positivo/negativo, e não é algo que eu deveria
implementar sozinho sem entender melhor como `sessionId` se relaciona (ou não) com um Lead/Contact
no fluxo real do enxame de IA.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` → `model AgentMemory` (linha ~802).
- Quem grava: procurar por `agentMemory.create`/`prisma.agentMemory` no código do 07 (fora do meu
  escopo de leitura detalhada nesta onda).

## Alteração necessária
Avaliar com o Agente 07 (dono do domínio de IA/memória de agente):
1. `sessionId` tem alguma correlação determinística com `leadId`/`contactId` que eu não vi (ex.:
   `sessionId` é derivado do `leadId`)? Se sim, dá para adicionar essa correlação como índice
   auxiliar sem migrar o schema, e `eraseDataSubject` passaria a conseguir localizar as sessões.
2. Se não há correlação hoje, considerar adicionar `leadId`/`contactId` opcional ao schema
   (migração exclusiva do Agente 01, mas a decisão de QUAL correlação gravar é do 07, que conhece
   o fluxo real de criação de `AgentMemory`).
3. Enquanto isso não existe, documentar formalmente (LGPD) que `AgentMemory` é um destino de dado
   pessoal sem mecanismo de exclusão por titular — isso é exatamente o tipo de "novo destino de
   dado pessoal sem herdar retenção/auditoria da origem" que `/AGENTS.md` → "LGPD e dados pessoais"
   pede para nunca deixar como omissão.

## Teste esperado
Depois de resolvido: teste de integração provando que `eraseDataSubject` (ou uma função irmã)
consegue redigir/remover `AgentMemory` de um titular específico sem afetar sessões de outros
titulares na mesma organização.

## Contexto adicional
Não bloqueia a aprovação desta onda — o mecanismo de exclusão hoje cobre Contact, WhatsAppMessage,
ConversationSignal e TimelineEvent (provado com banco real, 9/9 checks OK) — mas é um gap real de
cobertura que a missão do 01A pedia para provar/tratar e que não tenho como fechar sozinho sem
entender melhor o modelo de sessão do 07.
