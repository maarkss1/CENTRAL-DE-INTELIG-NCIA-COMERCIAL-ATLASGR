- De: 10
- Para: 08
- Onda: E
- Status: resolvido
- Prioridade: alto
## Problema
Foi solicitada a refatoração do Dockerfile de produção para ser seguro e leve, porém, de acordo com o AGENTS.md, a edição do Dockerfile na raiz é de propriedade exclusiva do Agente 08.
## Arquivo(s) envolvido(s)
Dockerfile
## Alteração necessária
Refatorar o Dockerfile de produção para garantir segurança (ex: rodar como non-root, remover pacotes desnecessários) e torná-lo mais leve (utilizando multi-stage build).
## Teste esperado
O build do Dockerfile ocorre com sucesso e a imagem final é reduzida, passando nos testes de linting e segurança.
## Contexto adicional
Solicitação da missão "Wave E (Empacotamento e Nuvem)".

## Resolução
Handoff estava stale — a refatoração pedida já havia sido feita em commit anterior sem marcar
este handoff como resolvido. Confirmado lendo o `Dockerfile` atual e validando com build Docker
real (Docker 29.7.2 disponível neste ambiente):

1. **Multi-stage build**: já existe (`FROM node:22-slim AS builder` na linha 2, `FROM node:22-slim
   AS runner` na linha 33/agora deslocada após a correção do item do prisma). O estágio `runner`
   final só recebe `package*.json`, `node_modules` (já sem devDependencies, exceto a CLI do
   prisma reinstalada nesta mesma rodada — ver handoff
   `onda-4/10-para-08-prisma-cli-imagem-producao.md`), `dist` e `prisma` via `COPY --from=builder`
   — não carrega toolchain de build (`python3`, `make`, `g++`, código-fonte completo) para a
   imagem publicada.
2. **Non-root user**: já existe (`RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs
   nodejs` seguido de `USER nodejs`, antes do `CMD`). Confirmado em runtime:
   `docker run --rm <imagem> whoami` → `nodejs`; `id` → `uid=1001(nodejs) gid=1001(nodejs)
   groups=1001(nodejs)`.

Nenhuma refatoração adicional foi necessária para este handoff especificamente — o trabalho já
estava feito. `docker build -f Dockerfile -t prospector-test .` completou com sucesso neste
ambiente (ver evidência completa no handoff do item do prisma, que foi corrigido na mesma
sessão), confirmando que a estrutura multi-stage/non-root não foi quebrada por essa correção.

Nenhum commit novo foi necessário para este item isoladamente — apenas a confirmação registrada
aqui.
