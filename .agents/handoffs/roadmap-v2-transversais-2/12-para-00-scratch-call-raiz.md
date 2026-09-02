- De: Agente 12 (Voz e Telefonia — Birthub Voices/3CX)
- Para: Agente 00 (Coordenador)
- Onda: roadmap-v2-transversais-2
- Status: resolvido (parcial — ver Resolução)
- Prioridade: normal

## Problema

Durante a auditoria de `src/features/integrations/birth-voice/birthVoice.service.ts` (onde
`process.env.BLAND_API_KEY` é lido) encontrei `scratch_call.ts`, um script solto na **raiz do
repositório** (fora de qualquer um dos três caminhos sob minha propriedade nesta onda), versionado
no git desde 2026-08-21 (commit `9a186bc`, junto de um commit não relacionado
"feat(ui): implement design system components and refactor forms").

O arquivo é um script de teste manual/debug que:
- dispara uma chamada real via Bland AI (`https://api.bland.ai/v1/calls`) usando
  `process.env.BLAND_API_KEY` fora de qualquer contexto de organização/tenant;
- contém um número de telefone (`+5516982220000`) e um nome de contato/empresa
  (`Jhonatan` / `Nova Geração`) hardcoded no corpo do script — não dá para confirmar, sem contexto
  adicional, se são dados reais de um lead de prospecção ou valores de teste inventados, mas o
  padrão (nome próprio + empresa real com grafia específica) é consistente com dado de lead real,
  não um placeholder óbvio como "Fulano"/"Empresa Teste".

Não editei nem apaguei o arquivo — está fora dos três caminhos que tenho autorização para tocar
nesta onda (`src/features/integrations/birth-voice/`, `src/features/integrations/threecx/`,
`src/hooks/use3CXIntegration.ts`), e a decisão de remover/reescrever histórico de um arquivo já
versionado é explicitamente decisão humana/Coordenador conforme `/AGENTS.md` → "Segurança e
higiene" (mesmo tratamento já dado ao caso do dump em `backups/`).

## Arquivo(s) envolvido(s)
- `scratch_call.ts` (raiz do repositório, sem dono explícito na "Propriedade exclusiva de
  arquivos" de `/AGENTS.md`).

## Alteração necessária
Uma das duas, a critério do Coordenador/usuário:
1. Se os dados forem reais (nome/empresa de um lead de prospecção real): tratar como o mesmo tipo
   de achado do dump em `backups/**` — decidir se vale remover do working tree e/ou considerar
   reescrita de histórico (`git filter-repo`/BFG), respeitando LGPD (minimização/não-duplicação de
   dado pessoal fora dos destinos governados).
2. Se forem dados de teste/fictícios: mesmo assim, um script solto na raiz que dispara chamadas
   reais via Bland AI usando uma credencial de produção fora de qualquer service/rota testado não
   deveria continuar versionado — mover para local apropriado (ex.: `scripts/` com um `.gitignore`,
   ou remover) é decisão de quem é dono da raiz do repositório/estrutura de scripts, que não está
   listado nas pastas de minha propriedade.

## Teste esperado
Nenhum — é uma decisão de triagem/governança, não uma correção de código.

## Contexto adicional
Não é um bloqueador da minha auditoria (a integração de voz em si — `birthVoice.service.ts`,
`callSuppression.service.ts`, webhooks — está com opt-out, fail-closed de webhook e classificação
honesta de resultado corretamente implementados; ver relatório desta onda). Acho que vale
revisão porque combina dois sinais do "Segurança e higiene"/LGPD de `/AGENTS.md`: possível dado
pessoal de lead fora de um destino governado, e um caminho de disparo de chamada real que não
passa por nenhuma das travas (`isSuppressed`, janela de discagem, `SDR_COLD_CALL_*`) que
`birthVoice.service.ts`/`coldCall.service.ts` exigem para qualquer ligação de produção.

## Resolução (Coordenador, 00)
Removido do working tree (`git rm scratch_call.ts`) — script solto na raiz sem dono, disparando
chamada real de produção sem nenhuma das travas de opt-out/tenant/janela que o resto do domínio de
voz exige, exatamente o padrão de risco descrito acima. Nenhum outro arquivo do repositório o
referenciava (`grep` confirmou).

**Não resolvido, decisão humana explícita conforme `/AGENTS.md` → "Segurança e higiene"**: o
conteúdo permanece recuperável no histórico do git (commit `9a186bc`, 2026-08-21), incluindo o
nome/telefone/empresa hardcoded que podem ser dado real de um lead. Reescrever histórico
(`git filter-repo`/BFG) para remover isso definitivamente exige coordenação com o dono do
repositório (reescreve hashes de commit, afeta qualquer PR/branch que dependa desse histórico) —
mesma ressalva já registrada para o caso do dump em `backups/**`. Fica pendente como decisão do
usuário, não resolvida automaticamente por este ciclo.
