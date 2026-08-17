# Migração de Secrets para Infisical

Runbook de adoção do Infisical como gestor de segredos dedicado, decisão registrada em
`docs/architecture/12-REQUISITOS-ARQUITETURA.md` (seção "Follow-ups", item 3). Hoje os segredos
de produção vivem só como env vars no Render (`sync: false`) + criptografia de campo AES-256-GCM
para credenciais de integração persistidas no banco (`src/lib/crypto/secretFields.ts`) — isso
continua existindo depois da migração; o Infisical substitui **onde** as env vars são geridas e
rotacionadas, não a criptografia de campo.

## Abordagem escolhida: sync nativo Infisical → Render, sem mudança de código

Duas formas de integrar Infisical existem: (a) SDK do Infisical dentro da aplicação, buscando
segredo em runtime, ou (b) a integração nativa Infisical → Render, que sincroniza os segredos do
Infisical como env vars normais do serviço Render — exatamente o que `src/config/env.ts` (Zod) já
lê hoje via `process.env`. Escolhida a opção (b): **zero mudança de código nesta aplicação**,
menor superfície de risco, e mantém `env.ts` como única fonte de validação (fail-fast) que já
existe. Reavaliar a opção (a) só se um caso concreto exigir rotação de segredo *sem redeploy* —
não é um requisito hoje.

## O que só você pode fazer (fora do alcance deste agente)

Passos que exigem conta pessoal/pagamento e não podem ser executados por uma sessão de agente:

1. **Criar conta** em [infisical.com](https://infisical.com) (cloud, tier gratuito cobre o
   volume de segredos deste projeto) ou decidir por self-host se preferir manter tudo em
   infraestrutura própria.
2. **Criar um projeto** (ex.: `prospector-atlas`) com 3 ambientes: `development`, `staging`
   (se usado — ver `cd-homolog.yml`), `production` — espelhando os ambientes reais do Render.
3. **Importar os segredos atuais** para o ambiente `production` do Infisical. Lista completa em
   `.env.example` (raiz do repo) — os que têm valor real em produção hoje e precisam ser
   migrados (não os que só têm default público):
   - `DATABASE_URL`, `REDIS_URL`
   - `BETTER_AUTH_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` — **ver seção "Sequenciamento crítico"
     abaixo antes de tocar nestes dois**
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `MEILI_MASTER_KEY`
   - `BIRTH_VOICES_API_KEY`, `BIRTH_VOICES_WEBHOOK_SECRET`
   - `ATLASGR_WEBHOOK_SECRET`, `THREECX_WEBHOOK_SECRET`
   - Qualquer outra credencial de integração (SMTP, etc.) com valor real setado hoje no Render —
     conferir a lista real em Render → `prospector-atlas` → Environment antes de migrar, este
     documento pode estar incompleto se uma integração nova foi adicionada depois dele.
4. **Configurar a integração nativa Render** no Infisical (Infisical → Integrations → Render):
   autorizar acesso ao workspace Render, selecionar o serviço `prospector-atlas` e mapear o
   ambiente `production` do Infisical para o Environment do serviço.
5. **Convidar quem mais precisa de acesso** (equipe/gestores) no projeto Infisical, com o nível
   de permissão adequado — hoje o acesso a segredo é "quem tem acesso ao dashboard do Render",
   o Infisical permite granularidade por pessoa/segredo, mas exige configurar isso.

## Sequenciamento crítico — `BETTER_AUTH_SECRET` e `CREDENTIALS_ENCRYPTION_KEY`

Estes dois **não são seguros de rotacionar durante a migração** sem um passo extra:

- `BETTER_AUTH_SECRET` assina toda sessão ativa — trocar o valor invalida todas as sessões
  logadas no momento da troca (todo usuário precisa logar de novo). Aceitável fazer isso uma vez
  fora de horário comercial, mas **não é aceitável rotacionar sem avisar os usuários antes**.
- `CREDENTIALS_ENCRYPTION_KEY` cifra em repouso os tokens OAuth/webhook já salvos no banco
  (`GoogleWorkspaceConnection`, `BitrixConnection`, `ThreeCXConnection` — ver
  `src/lib/crypto/secretFields.ts`). Trocar o valor sem re-cifrar os registros existentes
  **quebra a decriptação de tudo que já está salvo** — as integrações já conectadas param de
  funcionar até serem reconectadas manualmente.

Para estes dois: **migrar o valor atual para o Infisical sem trocá-lo** (copiar, não gerar um
novo). Rotação de verdade desses dois segredos específicos é um projeto à parte, não parte desta
migração.

## Sequenciamento seguro (todos os outros segredos)

1. Importar o valor atual (sem trocar) para o Infisical.
2. Ativar o sync Infisical → Render — nesse momento o Render passa a receber o mesmo valor via
   Infisical, sem diferença de comportamento.
3. Confirmar no Render que a env var já vem do sync (badge/indicador de origem "Infisical" no
   dashboard do Render).
4. **Só depois de confirmado**, rotacionar o valor de fato (gerar credencial nova na integração
   de origem — Google Console, painel do Bitrix, etc.) direto pelo Infisical, deixando o sync
   propagar. Nesse ponto a rotação já ganha o benefício real do Infisical (histórico de rotação,
   auditoria de quem trocou o quê e quando).
5. Depois de todo segredo migrado e confirmado vindo do Infisical, remover o valor manual
   equivalente que ainda estiver setado direto no Render (evita ambiguidade sobre qual é a fonte
   de verdade).

## O que muda no código desta aplicação

Nada, na abordagem escolhida (sync nativo). `src/config/env.ts` continua lendo `process.env`
exatamente como hoje — o Infisical só passa a ser quem preenche essas env vars no Render, em vez
de alguém preenchendo manualmente no dashboard. Se no futuro a opção de SDK em runtime for
adotada, aí sim há mudança de código (nova dependência, inicialização de cliente Infisical antes
de `env.ts` resolver — reavaliar este documento nesse momento).

## Critério de conclusão

Migração considerada concluída quando: todo item da lista da seção 3 estiver sincronizado via
Infisical (não mais setado manualmente no Render), `BETTER_AUTH_SECRET`/
`CREDENTIALS_ENCRYPTION_KEY` migrados sem rotação, e pelo menos um segredo não-crítico
(ex.: `MEILI_MASTER_KEY`) já rotacionado de ponta a ponta pelo fluxo do Infisical como prova de
que o processo funciona.
