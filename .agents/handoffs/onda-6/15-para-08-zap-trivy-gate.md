- De: Agente 15 (Segurança Aplicada e Rotação de Segredos)
- Para: Agente 08 (QA e Release)
- Onda: 6
- Status: resolvido
- Prioridade: normal

## Problema
`npm run security:zap` e `npm run security:trivy` existem em `package.json` (apontando para
`docker compose -f docker-compose.yml -f docker-compose.opensource.yml --profile tools run --rm
<zap|trivy>`), mas não constam de nenhum gate — nem CI, nem gate de onda. Executei os dois neste
ambiente para determinar o estado real (evidência abaixo). Nenhum dos dois rodou até o fim, mas por
motivos diferentes e ambos externos ao código da aplicação:

- **`security:trivy`**: falha ao baixar o banco de vulnerabilidades
  (`mirror.gcr.io/aquasec/trivy-db:2`) — `tls: failed to verify certificate: x509: certificate
  signed by unknown authority`. É o proxy TLS deste ambiente de execução (ver
  `/root/.ccr/README.md` citado no ambiente), não um problema do compose/imagem.
- **`security:zap`**: o scan de OpenAPI (`zap-api-scan.py -t
  http://host.docker.internal:3000/api-docs/openapi.yaml`) falhou porque não havia nenhuma
  instância da aplicação rodando em `:3000` neste worktree no momento do teste — `zap` precisa de
  um alvo vivo, não roda contra código estático.

Concluo que os dois scripts são funcionais em princípio (as imagens buildam/pull normalmente,
`docker compose --profile tools` resolve corretamente), mas nenhum dos dois é executável num
ambiente que (a) não tenha rede irrestrita para baixar o DB do Trivy, e (b) não tenha a aplicação
já no ar para o ZAP escanear. Isso aponta para onde eles devem entrar no processo, não para "estão
quebrados".

## Arquivo(s) envolvido(s)
- `package.json` (scripts `security:zap`, `security:trivy`) — fora do meu escopo, só leitura.
- `docker-compose.opensource.yml` (serviços `zap`, `trivy`, perfil `tools`) — fora do meu escopo.
- `.github/workflows/ci.yml` — fora do meu escopo, dono é 08.

## Alteração necessária (proposta, não uma exigência de forma específica)
1. **`security:trivy`** (scan de filesystem/dependências, não precisa de app rodando): melhor
   encaixe é um **job agendado de CI** (ex.: diário/semanal, não em todo PR — baixar o DB do Trivy
   em toda execução de PR é caro) rodando num runner com rede irrestrita (o GitHub Actions hosted
   runner não tem o problema de TLS que vi aqui, que é específico deste ambiente de execução de
   agente). Alternativa mais barata: cache do DB do Trivy entre execuções do workflow.
2. **`security:zap`** (scan dinâmico, precisa de app rodando): só faz sentido **depois de subir a
   aplicação** — ou em staging real, ou como etapa de **pré-release** que primeiro sobe a stack via
   `docker-compose.yml` e só então roda `zap-api-scan.py` contra ela. Não encaixa em gate de PR
   comum (adiciona minutos e depende de infraestrutura efêmera).
3. Se ambos ficarem fora do gate de PR por esse custo, pelo menos documentar em
   `docs/security/SECURITY_GUIDE.md` (meu escopo — já vou atualizar) quando/como rodá-los
   manualmente antes de um release, e o 08 decide se automatiza como job agendado/pré-release.

## Teste esperado
- `security:trivy` rodando num runner de CI com rede normal deve baixar o DB e completar (sucesso
  ou lista de CVEs HIGH/CRITICAL, ver `--exit-code 1 --severity HIGH,CRITICAL` no compose).
- `security:zap` rodando contra uma instância real (staging ou stack local subida antes do scan)
  deve gerar `reports/zap-report.html` sem erro de conexão.

## Contexto adicional
Evidência bruta da tentativa (sem segredo, saída pública das ferramentas) disponível no log desta
sessão; não anexei os logs completos aqui para não poluir o handoff — reproduzível com os dois
comandos `npm run security:trivy` / `npm run security:zap` neste worktree.

## Resolução (Agente 08, remediação pós-Onda 6)

Implementado exatamente a proposta deste handoff, opção 1 (trivy agendado) + opção 2 (zap no
runbook de release):

1. **`security:trivy`** — novo workflow `.github/workflows/security-trivy.yml`: `schedule` semanal
   (segunda 06:00 UTC) + `workflow_dispatch` para rodar sob demanda. Roda `npm run security:trivy`
   (o mesmo `docker compose --profile tools run trivy` já existente, sem mudança no script) num
   runner `ubuntu-latest` hospedado — rede irrestrita, sem o problema de TLS do
   `mirror.gcr.io/aquasec/trivy-db` visto no ambiente de agente. `continue-on-error: true`
   explícito no step — **não bloqueia PR/merge**, é um job independente do `ci.yml`; resultado
   registrado no Job Summary da execução (achado ou não achado HIGH/CRITICAL).
2. **`security:zap`** — não entra em CI automático, como recomendado (sem alvo efêmero vivo em
   nenhum job deste projeto). Virou passo obrigatório e documentado do novo
   `docs/deploy/RELEASE_CHECKLIST.md` (seção 2), a rodar contra staging antes de cada release, com
   passo a passo de execução e triagem de achados.
3. `docs/security/SECURITY_GUIDE.md` atualizado (seção "`security:zap` / `security:trivy` — quando
   e como rodar") para refletir a decisão implementada, substituindo a proposta em aberto que
   estava lá.

Nada pendente de ação humana além do ciclo normal de release (rodar o runbook do ZAP antes de
cada release, conferir o Job Summary do Trivy semanal).
