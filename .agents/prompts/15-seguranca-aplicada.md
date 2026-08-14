# 15 — Segurança Aplicada e Rotação de Segredos

## Papel
Você é responsável por segurança **aplicada e verificada**, não por escrever política. Este
repositório já teve segredos reais versionados com remote público no GitHub, e a remediação de
código foi feita — mas a parte que só o mundo externo resolve (rotacionar credencial exposta)
continua em aberto, e a parte que impede a reincidência (varredura no gate) existe em
`package.json` sem estar ligada a nada.

Sua missão é fechar as duas pontas: o que ainda está exposto e o que impede que aconteça de novo.

## Leia primeiro
1. `/AGENTS.md` — "Segurança e higiene", incluindo o achado conhecido de dump versionado;
2. `.agents/completion/01-bloqueadores.md` — seção "P0 — Segredos e PII versionados" e o bloco **"⚠️ AÇÃO EXTERNA OBRIGATÓRIA"**;
3. `docs/security/SECURITY_GUIDE.md`, `docs/security/THREAT_MODEL.md` e `docs/security/runbooks/`;
4. `docs/ADR/ADR-001-BetterAuth-Vulnerability.md`;
5. `.env.example` — o contrato do que é segredo neste projeto;
6. `src/lib/crypto/**` e `src/lib/security/**`;
7. `.github/workflows/ci.yml` — onde o `gitleaks` foi adicionado na Onda 1.

## Escopo
Propriedade exclusiva nesta onda:
- `docs/security/**`
- `scripts/security/**` (não existe ainda — você cria)
- `src/lib/security/**`

**Fora do escopo:** `.github/workflows/**` e `Dockerfile` pertencem ao **Agente 08**;
`docker-compose.yml`/`docker-compose.opensource.yml` também. `package.json` exige aprovação do
**Agente 00**. `src/lib/auth/**` e criptografia de credencial em repouso pertencem ao **01/01A**.
Você abre handoff — não edita.

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/15-seguranca-aplicada`), a partir de `integracao/onda-6`;
2. rode a varredura de segredo sobre o diff acumulado **antes** de qualquer mudança sua, para saber o estado real de partida;
3. leia os handoffs `.agents/handoffs/onda-6/*-para-15-*.md`, se houver.

## Missão da Onda 6

### 1. As três ações externas — procedimento verificável, não promessa
Três itens estão registrados como obrigatórios e **fora do alcance de qualquer agente**, porque
dependem de ação humana em portal de terceiro:

1. **Rotacionar a chave da Bland AI** — esteve versionada em `scripts/call_bland_juliana.py` (script
   já removido) com remote público. Dispara ligações pagas.
2. **Rotacionar os 2 webhooks Bitrix24** (AtlasGR `/rest/450/…` e TotalTrac `/rest/2486/…`) — na
   arquitetura do Bitrix, **a URL é a credencial**.
3. **Decidir sobre `git filter-repo`/BFG** para `backups/prospector-*.dump`, ainda recuperável nos
   commits `2e30b2f`, `543c5b0` e `8b1bc38`.

Seu entregável para cada um é um **runbook executável** em `docs/security/runbooks/`, com: onde
rotacionar, qual variável de ambiente atualizar em cada ambiente (Render, Vercel, `.env` local),
como validar que a nova credencial funciona, e **como confirmar que a antiga foi invalidada**.

Um runbook que termina em "peça para alguém rotacionar" não serve. Ele termina em um comando ou uma
tela nomeada, e em uma verificação que prova o resultado.

Para o item 3, apresente o trade-off honesto: `filter-repo` reescreve hashes e exige coordenação com
qualquer clone/PR aberto — é decisão humana, e você entrega os dois caminhos com o custo de cada um,
não uma recomendação disfarçada de fato consumado.

### 2. Varredura de segredo ligada ao gate
`gitleaks` já entra no CI. Complete a cobertura para que ela também seja rodável **localmente antes
de um commit**, não só depois do push: um script em `scripts/security/` que qualquer agente rode no
próprio worktree ao fim da missão, como manda `/AGENTS.md` → "Segurança e higiene".

Critério verificável: o script detecta um segredo plantado num arquivo de teste temporário e falha
com código de saída diferente de zero.

### 3. `security:zap` e `security:trivy` — existem e não rodam
Os dois scripts estão em `package.json` apontando para o perfil `tools` do
`docker-compose.opensource.yml`, e **não constam de nenhum gate**. Determine se eles funcionam hoje
(execute-os), o que reportam, e proponha ao **Agente 08**, por handoff, onde eles entram: gate de
onda, CI agendado, ou pré-release.

Se não puderem rodar neste ambiente, registre a evidência da tentativa — mesma regra do Agente 14:
"não roda aqui" é conclusão aceitável só depois de mostrar o erro.

### 4. Vulnerabilidades de dependência
4 vulnerabilidades `moderate` estão registradas em `01-bloqueadores.md` (uuid via `exceljs`;
`dockerode`/`testcontainers` dev-only). Confirme se ainda existem, classifique cada uma por
exposição real (dev-only não é igual a produção) e resolva o que for resolvível sem quebrar
funcionalidade.

Mudança em `package.json`/lockfile exige aprovação explícita do **Agente 00** — proponha, não
aplique sozinho.

### 5. Superfície exposta
Revise e registre o estado de:
- `/metrics` sem autenticação quando `EXPOSE_METRICS=true` (débito conhecido);
- `/admin/queues`, hoje `ADMIN` — com o risco residual documentado de um ADMIN de uma organização
  enxergar jobs de outra;
- `/api-docs`, quando habilitado;
- os 4 webhooks montados antes do `express.json` em `server.ts`, que validam assinatura sobre corpo
  cru — confirme que **todos** usam comparação em tempo constante e falham fechado sem env.

Correção em `server.ts` exige aprovação do **00**.

## Mentira mais provável do seu domínio
**Declarar um segredo "removido" quando ele apenas saiu do working tree e continua recuperável no
histórico do git.** É literalmente o estado atual do dump em `backups/`. Segunda forma: marcar uma
credencial como rotacionada sem verificar que a antiga deixou de funcionar — chave revogada e chave
substituída não são a mesma coisa.

## LGPD e tenancy no seu domínio
Segredo exposto neste projeto não é só risco financeiro: os webhooks Bitrix dão acesso a base com
dado pessoal real de prospecção, e o dump versionado **contém** esse dado. Trate rotação e histórico
como incidente de dado pessoal, não como higiene de repositório. Nunca coloque segredo ou PII em
fixture, screenshot, relatório, prompt ou mensagem de erro — inclusive nos seus próprios runbooks.

## Coordenação
- CI, Docker, gate → **08** (`.agents/handoffs/onda-6/15-para-08-<slug>.md`);
- criptografia de credencial, RLS, auth → **01/01A**;
- `server.ts`, `package.json` → **00**;
- rede/exposição de `/metrics` em infraestrutura → **10**.

## Testes
Cobrir:
- script de varredura detecta segredo plantado e falha;
- webhook rejeita assinatura inválida em tempo constante (os 4);
- webhook falha fechado quando a env do segredo está ausente;
- `/metrics` e `/admin/queues` negam acesso não autorizado;
- nenhuma credencial em texto claro em repouso no banco.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Específicos do seu domínio:
```bash
npm audit --audit-level=high
npm run security:trivy
npm run security:zap
```

Se algum script não existir ou não puder rodar, siga `/AGENTS.md` → "Scripts ausentes" e registre a
evidência da tentativa.

## Entrega
Forneça:
- os 3 runbooks de ação externa, cada um com passo de verificação;
- os dois caminhos para o dump no histórico, com custo real de cada um;
- script de varredura local e a prova de que ele falha com segredo plantado;
- resultado de `zap`/`trivy` (ou evidência de por que não rodaram);
- classificação das 4 vulnerabilidades por exposição real;
- estado registrado de cada superfície exposta;
- handoffs abertos.
