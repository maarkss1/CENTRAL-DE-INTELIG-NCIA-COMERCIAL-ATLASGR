# Changelog — Melhorias nos Agentes

Resumo do que foi revisado e reforçado nesta versão do pacote de agentes. Nenhuma regra de segurança/qualidade pré-existente foi enfraquecida — tudo abaixo é adição ou tornou algo implícito em explícito.

## 1. Isolamento de execução (git worktree/branch)
O pacote original descrevia "3 especialistas simultâneos" sem definir como eles evitariam escrever no mesmo checkout ao mesmo tempo — risco real de corrupção de working tree. Agora `/AGENTS.md`, `EXECUCAO-ONDAS.md` e o prompt `00-coordenador.md` definem: branch de integração por onda (`integracao/onda-<n>`), branch por especialista (`agente/<numero>-<slug>`), worktree dedicado quando o ambiente suportar, gate rodado na branch de integração (não só em cada branch isolada) e fallback para execução em série quando não houver suporte a worktrees.

## 2. Protocolo de handoff formalizado
"Produza um handoff" virou um formato de arquivo concreto em `.agents/handoffs/onda-<n>/<de>-para-<para>-<slug>.md`, com campos obrigatórios (status, prioridade, problema, arquivo, alteração esperada, teste esperado) e regra de bloqueio de onda quando um handoff `bloqueador` continua `aberto`. Pasta `.agents/handoffs/` e `.agents/runs/` criadas com README explicando o protocolo.

## 3. Scripts ausentes
Nenhum agente tinha instrução para o caso comum de um script de gate (`verify:integrations`, `verify:ai`, etc.) não existir ainda em `package.json`. Agora há uma regra única em `/AGENTS.md`, referenciada por todos os prompts: registrar a ausência explicitamente em vez de pular silenciosamente ou travar sem explicação.

## 4. LGPD e dados pessoais
Nova seção dedicada em `/AGENTS.md`, com responsabilidade explícita distribuída entre 01 (exclusão/anonimização, criptografia), 04 (minimização em relatórios), 05 (proveniência, não coletar dado sensível desnecessário), 06/06A (retenção/expurgo de histórico de extração, isolamento de exportação), 07 (consentimento antes de enviar dado pessoal a IA, generalizando o padrão que já existia em 06A) e 08 (checklist de release cobrindo caminho operacional para atender titular). Isso não existia no pacote original apesar de o produto lidar com dados pessoais reais de leads/contatos.

## 5. Reforços de segurança específicos
- Proteção básica contra SSRF ao validar URLs de webhook fornecidas por usuário (01, 06, 06A).
- Rate limiting explícito em login/reset de senha (01).
- Resposta de acesso negado uniforme entre "não existe" e "existe em outro tenant" (01).
- Limite de custo/uso por tenant para chamadas de IA, evitando consumo descontrolado (07).
- Exigência de confirmação humana para tool de alto impacto/irreversível chamada por um agente de IA (07).
- Varredura de segredo versionado (`gitleaks`/`trufflehog` ou equivalente) sobre o diff acumulado antes de aprovar onda/release (00, 08, `/AGENTS.md`).

## 6. Seções "Leia primeiro" e "Antes de começar" padronizadas
Todos os 10 prompts agora começam com uma lista explícita de arquivos a ler (root + `AGENTS.md` locais relevantes) e um checklist de pré-voo (confirmar worktree/branch correto, checar handoffs pendentes endereçados a si, mapear o que já existe antes de criar algo novo). Antes, isso existia de forma completa só no 06A e de forma parcial em 01/02.

## 7. 06A — Extrações Bitrix
Mantido como especificação de referência (é o módulo mais detalhado e crítico), mas reestruturado para não repetir literalmente o que já está em `/AGENTS.md` e `06-integracoes-bitrix.md` — agora referencia essas regras em vez de duplicá-las, reduzindo risco de as três cópias divergirem ao longo do tempo. Adicionadas: retenção/expurgo de histórico como dado pessoal, teste de webhook para IP privado/loopback, e explicitação de que seu fluxo de consentimento de IA é o padrão a ser replicado pelo Agente 07 em outros pontos do Hub.

## 8. Pequenos reforços por agente
- **02**: regra explícita sobre copy de estado (empty/error específicos, nunca genéricos).
- **03**: uso de ferramenta automatizada de a11y como ponto de partida (não substituto de teste manual de teclado), reaproveitamento explícito dos tokens de marca já definidos em 06A.
- **04**: normalização de moeda em ponto único, dicionário de métricas único, cuidado com dado pessoal em relatórios agregados.
- **05**: registro/estimativa de custo por chamada de provider, proibição de persistir dado pessoal sensível incidental.
- **08**: cobertura de rollback executável e checklist de LGPD na release readiness.

## 10. Três agentes novos, a partir do repositório real
Ao instalar o pacote no repositório de fato (`C:\...\CENTRAL-DE-INTELIGENCIA-COMECIAL-ATLASGR`), foram encontradas pastas reais sem nenhum dono no pacote original:
- `android/` + `capacitor.config.ts` (app mobile via Capacitor) → novo **Agente 09 — Mobile**.
- `k8s/`, `argocd/`, `charts/`, `infrastructure/`, `docker/` (antes tudo dentro do já sobrecarregado Agente 08) → novo **Agente 10 — Infraestrutura, Observabilidade e SRE**, com escopo retirado de 08 (08 mantém apenas CI, `Dockerfile`/`docker-compose.yml` da raiz, testes, docs e a decisão de release).
- `identidade-visual/`, `public/brand`, `documentacao-aplicacao/` → novo **Agente 11 — Marca e Ativos Institucionais**.

Esses três novos agentes rodam em uma **Onda 4 — Extensões**, em paralelo entre si (respeitando o limite de 3 especialistas simultâneos), depois da Onda 3 — mas o Coordenador pode antecipá-la, já que nenhum dos três depende de bloqueador das Ondas 1–3.

## 11. Achado de segurança real encontrado durante a instalação
`backups/prospector-*.dump` (dump de banco, ~166KB) está commitado no git deste repositório — confirmado via `git ls-files` — violando diretamente a regra "nunca commitar dump/backup de banco" que já existia em `/AGENTS.md`. Isso virou bloqueador prioritário #14, ganhou um `backups/AGENTS.md` de aviso permanente, e uma recomendação de remediação em três passos em `/AGENTS.md` → "Segurança e higiene" (destrackear + `.gitignore`, avaliar rotação de credencial, decidir sobre reescrita de histórico). Nenhuma reescrita de histórico foi executada automaticamente — é decisão do dono do repositório.

## 9. O que não foi alterado
Os ~40 arquivos `AGENTS.md` locais (`prisma/`, `src/features/*/`, `src/lib/*/`, `tests/`, `.github/`, `k8s/`, `argocd/`, `charts/`, `infrastructure/`, `docs/`, `server/ai/`, `src/components/*/`, `src/styles/`, `src/shared/`) já seguiam um template curto e consistente e continuam válidos como estavam — eles apontam para `/AGENTS.md` para conflitos/handoffs, que agora tem o protocolo detalhado. `scripts/gerar-versao-limpa.ps1` não foi tocado.
