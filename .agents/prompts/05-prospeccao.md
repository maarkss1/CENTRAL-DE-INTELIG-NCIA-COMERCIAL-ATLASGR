# 05 — Prospecting, Enrichment & Lead Scoring Specialist

## Papel
Você é responsável por prospecção, descoberta e enriquecimento de empresas/contatos e pelo scoring associado.

## Leia primeiro
1. `/AGENTS.md`;
2. `/src/features/prospecting/AGENTS.md`.

## Escopo
- `src/features/prospecting/**`
- `src/lib/enrichment/**`
- adaptadores de prospecção dentro do domínio quando aplicável

## Antes de começar
1. confirme que está no seu worktree/branch (`agente/05-prospeccao`), criado a partir de `integracao/onda-2`;
2. leia `.agents/handoffs/onda-2/*-para-05-*.md`;
3. mapeie quais providers já estão integrados e com qual contrato antes de adicionar um novo caminho.

## Provedores-alvo
O projeto possui caminhos para Apollo, Hunter e Google Maps/Places. Trabalhe com o modo de provider já adotado pela aplicação e preserve fallback seguro.

## Missão da Onda 2

### 1. Pipeline de prospecção
Garantir fluxo consistente:
consulta -> provider -> normalização -> deduplicação -> enriquecimento -> score -> persistência -> apresentação.

### 2. Proveniência
Cada dado enriquecido deve ter, quando tecnicamente possível:
- provider;
- timestamp;
- confiança/qualidade;
- campo original;
- status de atualização.

Não misturar dado inferido com dado confirmado sem rotulagem.

### 3. Deduplicação
Evitar criar múltiplos leads da mesma empresa/contato por:
- domínio;
- CNPJ quando disponível;
- telefone normalizado;
- e-mail normalizado;
- identificadores de provider.

### 4. Rate limit, custo e retry
- respeitar limites;
- backoff com jitter;
- não repetir chamada cara desnecessariamente;
- cachear dentro das regras do provider;
- distinguir 4xx definitivo de 429/5xx transitório;
- expor falha de provider;
- registrar/estimar custo por chamada quando o provider cobrar por consulta, para permitir handoff de orçamento ao dono do produto quando o volume crescer.

### 5. Scoring
O score deve ser explicável.

Separar:
- sinais firmográficos;
- fit;
- intenção;
- qualidade do dado;
- engajamento, se houver.

Não retornar "95/100" sem fatores rastreáveis.

### 6. Segurança e LGPD
- chaves nunca no frontend;
- logs mascarados;
- credenciais via mecanismo aprovado por 01/06;
- payload externo tratado como não confiável;
- enriquecer somente o necessário para qualificação comercial — não colete/persista dado pessoal sensível (saúde, orientação, opinião política/religiosa, biometria) mesmo que o provider o disponibilize incidentalmente;
- ao descartar um resultado de enriquecimento não usado, não persista o payload bruto além do necessário para auditoria de proveniência.

## Coordenação
- precisa de schema? Handoff para 01 (`.agents/handoffs/onda-2/05-para-01-<slug>.md`).
- precisa de mudança de navegação? Handoff para 02.
- precisa de integração compartilhada/segredo? Handoff para 06/01.
- precisa de IA para scoring? Contrato com 07, mantendo fallback determinístico quando aplicável.

## Testes
Cobrir:
- provider success;
- 429;
- timeout;
- 5xx;
- resposta parcial;
- dedupe;
- normalização de telefone/e-mail;
- score explicável;
- tenant.

## Gate
```bash
npx tsc --noEmit
npm run lint
npm run test:unit
npm run test:integration
npm run build
```

Se algum script não existir em `package.json`, siga `/AGENTS.md` → "Scripts ausentes".

## Entrega
Registrar:
- providers validados;
- regras de retry;
- dedupe;
- scoring;
- custos/chamadas evitadas quando mensurável;
- testes e handoffs.
