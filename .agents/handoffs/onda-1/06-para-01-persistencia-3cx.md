- De: Agente 06 (Integrações, Bitrix, Google, WhatsApp, 3CX e Voz)
- Para: Agente 01 (Plataforma, Segurança e Dados)
- Onda: 1
- Status: aberto
- Prioridade: alto

## Problema

`src/features/integrations/threecx/threecx.service.ts` guarda TODAS as conexões 3CX PABX (URL do
PABX, ramal, `apiKey`/`apiSecret`) num `Map` **em memória** (`memory3CXStore`, linhas 25-34), não
no banco — diferente de Bitrix (`BitrixConnection`) e Google (`GoogleWorkspaceConnection`), que já
têm modelo Prisma próprio. Comentário no próprio código já reconhece isso como um fallback
provisório: "Em-memória / fallback store para configurações 3CX quando não há migration
customizada".

Consequência real:
- toda conexão 3CX de toda organização é perdida a cada restart/redeploy do processo, sem aviso
  nenhum ao usuário — a tela volta a mostrar "Não conectado" e o vendedor precisa reconectar do
  zero;
- em qualquer deploy com mais de uma instância do servidor, `GET /connections`, `/test` e `/call`
  respondem de forma diferente dependendo de qual instância atende a requisição, já que cada
  processo tem seu próprio `Map` isolado.

Isto não é uma migração que eu (06) posso criar — `prisma/schema.prisma` e `prisma/migrations/**`
são propriedade exclusiva do Agente 01.

## Arquivo(s) envolvido(s)
- `prisma/schema.prisma` — falta um modelo (ex.: `ThreeCXConnection`), no mesmo padrão de
  `BitrixConnection`/`GoogleWorkspaceConnection` (organizationId, RLS, timestamps).
- `src/features/integrations/threecx/threecx.service.ts` — `memory3CXStore` e as funções
  `get3CXConnectionsForOrg`/`save3CXConnectionForOrg`/`delete3CXConnectionForOrg` (linhas 24-58)
  precisam trocar de `Map` para `prisma.threeCXConnection.*` depois que o modelo existir.

## Alteração necessária
1. Criar `ThreeCXConnection` em `prisma/schema.prisma`: `id`, `organizationId` (+ relação e
   índice, como `BitrixConnection`), `label`, `pbxUrl`, `extension`, `apiKey`/`apiSecret`
   (avaliar se estes dois precisam do mesmo tratamento de criptografia em repouso já aplicado a
   `BitrixConnection.webhookUrl`/`GoogleWorkspaceConnection.accessToken` — ver
   `src/lib/crypto/secretFields.ts` e a extensão em `src/lib/prisma.ts` — provavelmente sim, é
   credencial de PABX), `autoDialEnabled`, `createdAt`/`updatedAt`.
2. Gerar migração.
3. Eu assumo a troca do `Map` para o Prisma real assim que o modelo existir (é código dentro do
   meu escopo, `src/features/integrations/**`), a menos que você prefira fazer os dois juntos.

## Teste esperado
Depois da migração: `list3CXConnections`/`connect3CX`/`disconnect3CX` sobrevivendo a um restart do
processo (ou, em teste, a uma nova instância de Prisma Client) — o mesmo tipo de cobertura que já
existe para Bitrix/Google.

## Contexto adicional
Achado relacionado, já corrigido por mim nesta rodada (não depende deste handoff): `make3CXCall`
não fazia NENHUMA chamada de rede real ao PABX — fabricava sucesso incondicionalmente, inclusive
gravando no CRM uma Activity afirmando "Chamada iniciada via 3CX PABX" mesmo com o PABX
inalcançável. Corrigido para tentar uma chamada HTTP real (mesmo padrão de `test3CXConnection`,
que já era honesto) e só reportar sucesso quando o PABX responde `ok`. **Ressalva**: o contrato
exato da API de Call Control (`POST /api/v1/calls`, `{from, to}`) não pôde ser validado contra um
servidor 3CX real nesta auditoria — se estiver errado, a chamada falha honestamente (erro visível
ao usuário) em vez de mentir, mas o endpoint/payload reais precisam ser confirmados com a
documentação do PABX do cliente antes de confiar nisto em produção. `process3CXWebhook`
(linhas ~202) também só loga o payload recebido sem persistir/associar a nenhum `organizationId`
— eventos de chamada vindos do PABX (ex.: chamada atendida, encerrada) são descartados; não mexi
nisso porque não conheço o formato real do payload do webhook o suficiente pra implementar direito
sem adivinhar — registrado aqui como pendência conhecida, não como "resolvido".
