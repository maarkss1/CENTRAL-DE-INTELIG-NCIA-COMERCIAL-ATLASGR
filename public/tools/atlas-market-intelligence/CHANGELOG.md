# CHANGELOG - Atlas Market Intelligence

Todas as alterações relevantes devem ser classificadas como `CORRIGIDO`, `MELHORADO`, `NOVO`, `REMOVIDO`, `DADOS ATUALIZADOS` ou `METODOLOGIA ALTERADA`.

## Em desenvolvimento - National Market & Territory Intelligence

### CORRIGIDO

- preservado baseline anterior em branch dedicada antes das mudanças;
- corrigida a integração do Market Intelligence que dependia de iframe;
- corrigida a arquitetura que tentava carregar RNTRC bruto de grande volume no navegador;
- corrigida a semântica de decisão: ranking executivo permanece bloqueado quando os datasets mínimos não sustentam a recomendação;
- corrigido fechamento JSX preexistente em `OcrCapturePanel.tsx` que bloqueava typecheck da branch;
- incorporada correção validada do conflito ESLint 10 × `eslint-plugin-jsx-a11y` por alinhamento ao ESLint 9 suportado;
- corrigido mock preexistente do worker de sinal WhatsApp para efetivamente exercitar a fila;
- workflows de CI relevantes passaram a fixar GitHub Actions por SHA imutável;
- quality gate e Playwright alinhados a Node 22, compatível com dependências atuais.

### MELHORADO

- arquitetura separada em domínio, carregamento de dados, componentes e datasets derivados;
- governança de `OBSERVADO`, `ESTIMADO`, `PROXY`, `PREMISSA_EDITAVEL`, `NAO_DISPONIVEL`;
- confiança executiva incorporada ao contrato de dados;
- saúde dos dados passou a ser declarada no manifest;
- seller economics agora começa sem valores inventados;
- identidade visual da nova feature usa logo oficial Atlas, laranja `#FF5618`, grafite `#333333`, branco e amarelo secundário;
- metodologia consolidada distingue tamanho de mercado, demanda, White Space e prioridade territorial;
- documentação passou a exigir competência, hash e lineage.

### NOVO

- `AUDITORIA_ESTADO_ATUAL.md`;
- `ARQUITETURA.md`;
- `METODOLOGIA.md`;
- `DATA_LINEAGE.md`;
- `FONTES.md`;
- `DICIONARIO_DADOS.md`;
- feature React/TypeScript nativa `src/features/market-intelligence/`;
- Board View com bloqueio de decisão por governança;
- tela `Saúde dos Dados`;
- simulador inicial de custo/break-even do vendedor;
- contratos de dados para município, território, evidência, scores e manifest;
- testes unitários de White Space, score bounds e seller economics;
- `etl_rntrc_atlas.py` com descoberta do snapshot ANTT, cache, hash, join IBGE e agregado municipal;
- workflow de dados RNTRC que publica somente derivado compacto e metadata.

### REMOVIDO

- iframe como implementação da rota React de Market Intelligence;
- dependência operacional do carregamento automático de arquivo RNTRC bruto no navegador na nova arquitetura;
- valores comerciais default usados como se fossem plausíveis para decisão na nova feature.

### DADOS ATUALIZADOS

- aguardando conclusão do primeiro snapshot automatizado RNTRC na branch de desenvolvimento;
- frota oficial permanece bloqueada enquanto o recurso público localizado estiver vazio/incompatível com base nacional utilizável;
- CNPJ, MDF-e e risco ainda aguardam snapshot nacional processado na nova arquitetura;
- concorrência continua `PESQUISA_PARCIAL`.

### METODOLOGIA ALTERADA

- os 16 clusters antigos passaram formalmente a `HIPÓTESES DE TRIAGEM`, não vencedores;
- White Space requer `CENSO_COMPLETO`;
- Opportunity Score será publicado em versões bruta e ajustada por confiança;
- pesos históricos deixaram de ser aceitos cegamente e exigem análise de sensibilidade;
- normalização deve usar universo nacional/competência definida, não somente o arquivo importado no browser;
- município deve ser unido por código IBGE, não nome textual;
- RNTRC foi definido como estoque/presença e MDF-e como fluxo logístico real;
- risco estadual deve ser `PROXY_UF`;
- TAM/SAM/SOM e MRR exigem premissas econômicas explícitas.

## Histórico anterior

### v0.5

- camada Need/Risco;
- Opportunity Score v1 condicionado a dados;
- simulador por raio;
- importadores CSV no navegador.

### v0.4

- demanda combinada RNTRC + ICP;
- MDF-e;
- concorrência;
- White Space preliminar.

### v0.1

- triagem qualitativa de 16 clusters brasileiros;
- planilha explicitamente não adequada para decisão final de contratação.