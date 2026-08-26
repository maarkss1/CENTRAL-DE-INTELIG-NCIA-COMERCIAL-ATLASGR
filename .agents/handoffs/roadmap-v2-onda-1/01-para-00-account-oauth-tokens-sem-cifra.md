- De: 01 — Plataforma, Segurança e Dados
- Para: 00 — Coordenador (roteamento: correção pertence ao domínio normal do 01, mas fica fora do
  boundary de arquivos explicitamente autorizado para esta execução — `prisma/schema.prisma`,
  `prisma/migrations/**`, `src/lib/auth/`, `src/shared/` — porque os arquivos a alterar são
  `src/lib/prisma.ts` e `src/lib/crypto/secretFields.ts`, fora dessas quatro pastas)
- Onda: roadmap-v2-onda-1
- Status: aberto
- Prioridade: alto

## Problema

`Account.accessToken`/`Account.refreshToken`/`Account.idToken` (tabela `account`, gerida pelo
Better Auth via `prismaAdapter(prisma, ...)` em `src/lib/auth.ts`) são gravados em texto puro no
Postgres quando login social (Google/Microsoft OAuth) está habilitado
(`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ou `MICROSOFT_CLIENT_ID`/`MICROSOFT_CLIENT_SECRET`
configurados — `src/lib/auth.ts` linhas 14–31). Isso é exatamente o mesmo padrão de risco já
identificado e corrigido para `GoogleWorkspaceConnection.accessToken`/`refreshToken` e
`BitrixConnection.webhookUrl`/`webhookSecret` (ver comentário no topo de
`src/lib/crypto/secretFields.ts`: "bloqueador do AGENTS.md: 'Credenciais armazenadas sem proteção
adequada'"), mas a tabela `Account` do Better Auth nunca foi incluída no mapa `ENCRYPTED_FIELDS` de
`src/lib/prisma.ts`.

## Causa raiz

`ENCRYPTED_FIELDS` em `src/lib/prisma.ts` (linhas 18–23) lista `GoogleWorkspaceConnection`,
`BitrixConnection` e `ThreeCXConnection`, mas não `Account` — a tabela do Better Auth foi
adicionada ao schema/fluxo de auth depois (ou em paralelo) à correção de criptografia de campo, e
ninguém atualizou a lista para cobri-la. Como `auth` usa `prismaAdapter(prisma, ...)` sobre o MESMO
client Prisma estendido (`export const prisma = basePrisma.$extends({...})` em `src/lib/prisma.ts`
linha ~80), a extensão `encryptSensitiveFields`/`decryptSensitiveResult` já intercepta toda
operação `account.*` — só falta adicionar a entrada ao mapa, o mecanismo de cifra em si (AES-256-GCM,
`src/lib/crypto/secretFields.ts`) já existe e é reutilizável sem mudança de schema.

## Arquivo(s) envolvido(s)

- `src/lib/prisma.ts` (adicionar `Account: ['accessToken', 'refreshToken', 'idToken']` a
  `ENCRYPTED_FIELDS`)
- `src/lib/crypto/secretFields.ts` (nenhuma mudança funcional esperada — só referenciado, mecanismo
  já genérico)
- Possível teste de regressão em `src/lib/__tests__/` ou onde já existe cobertura de
  `ENCRYPTED_FIELDS` para os models atuais (não localizado dentro do meu escopo desta execução —
  confirmar se já existe suíte cobrindo esse mapa antes de escrever uma nova).

## Alteração necessária

Adicionar `Account` ao `ENCRYPTED_FIELDS` em `src/lib/prisma.ts`, cobrindo `accessToken`,
`refreshToken` e `idToken`. Não cobre `Account.password` (hash da credencial e-mail/senha,
gerenciado internamente pelo Better Auth com seu próprio algoritmo de hashing — já não é texto
puro, então não é o mesmo problema; conferir se o Better Auth realmente hasheia antes de mexer
nesse campo). Rodar migration de backfill não é necessário (a extensão cifra apenas em escrita
futura; registros antigos em texto puro continuam legíveis pelo `decryptField` — que já trata valor
sem o prefixo `enc:v1:` como legado em texto puro, ver `secretFields.ts` linha 63–67), mas
recomenda-se registrar essa decisão explicitamente já que dados históricos ficam sem cifra até
serem regravados (refresh do token).

## Teste esperado

- Teste unitário que grava/lê um `Account` via `prisma.account.create`/`findUnique` e confirma que
  o valor persistido bruto (bypassando a extensão, leitura direta via `$queryRaw` ou client cru) tem
  o prefixo `enc:v1:`, e que o valor lido de volta pela API normal do Prisma é o texto puro original
  — mesmo padrão dos testes existentes para `GoogleWorkspaceConnection`/`BitrixConnection` (buscar
  em `src/lib/__tests__/` ou equivalente).
- Confirmar que o fluxo de login social (Google/Microsoft) do Better Auth continua funcionando após
  a mudança — não deveria quebrar porque a cifra é transparente na camada Prisma, mas o Better Auth
  eventualmente lê/escreve `Account` fora do fluxo de request padrão (refresh de token em
  background); vale rodar manualmente ou revisar o código do adapter.

## Contexto adicional

Não é uma vulnerabilidade explorável hoje neste ambiente (`GOOGLE_CLIENT_ID`/`MICROSOFT_CLIENT_ID`
vêm vazios em `.env.example`, então o provedor social só é registrado
condicionalmente — `src/lib/auth.ts` linhas 14–31 — quando configurado), mas é uma lacuna real e
concreta: se/quando login social for habilitado em produção, os tokens OAuth de terceiros (Google/
Microsoft) ficam protegidos só por RLS de tenant, sem a camada de criptografia de campo que este
mesmo repositório já decidiu ser obrigatória para todo outro credential-like field. Encontrado
durante a auditoria fail-closed do Agente 01 na Onda 1 do Roadmap v2 (bloqueador "Credenciais
armazenadas sem proteção adequada" — `/AGENTS.md`); não corrigido diretamente nesta execução porque
`src/lib/prisma.ts` e `src/lib/crypto/secretFields.ts` estão fora do boundary de arquivos desta
missão (`prisma/schema.prisma`, `prisma/migrations/**`, `src/lib/auth/`, `src/shared/`).
