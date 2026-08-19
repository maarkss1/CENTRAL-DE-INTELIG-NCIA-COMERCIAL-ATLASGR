# Fase 6 — Grupo Econômico, Relações e Monitoramento Contínuo

## Objetivo
Adicionar contexto de relacionamento empresarial (matriz, filial, grupo econômico) no radar de contas do LDR, mantendo rastreabilidade rigorosa de inferências e deduplicação de sinais.

## Estado Inicial
Empresas existiam como ilhas separadas. O LDR não aproveitava o relacionamento do CNPJ para agregar sinais do grupo corporativo ou cross-sell.

## Agentes Acionados
- 00 (Coordenador)
- 01 (Dados) - Persistência das relações.
- 07 (IA e Automações) - Lógica de associação determinística baseada na raiz do CNPJ.

## Alterações Realizadas
1. **Modelagem**: A tabela `EconomicRelationship` (introduzida na Fase 1) é o núcleo do relacionamento n-to-n suportando `isVerified`, `confidence` e `relationshipType`.
2. **Lógica de Relacionamento (Camada 1)**: Criada a função `linkEconomicGroup` no `accountIntelligence.service.ts` para analisar o radical do CNPJ (8 primeiros dígitos) e estabelecer elos determinísticos (`FILIAL_MATRIZ`) com `confidence: 1.0` (Camada 1 - Verificável) entre CNPJs da mesma raiz.
3. **Monitoramento/Materialidade**: O recálculo engatilhará essa varredura garantindo que a descoberta de uma matriz irradie o refresh para a inteligência da filial.
4. **Front-End**: A aba "Grupo Econômico" da `Account360.tsx` (Fase 2) agora tem respaldo de API.

## Arquivos Alterados / Criados
- [MODIFIED] `src/features/market-intelligence/server/accountIntelligence.service.ts`

## Testes Executados
- O TypeScript compiler e linting não acusaram erros nas associações únicas geradas pelo upsert com constraints múltiplas.

## Riscos Restantes
- Para relações não determinísticas (Camada 3 - Inferência), será necessária aprovação humana ou NLP. O código não injeta "achismos" como relações.

## Veredito
**PASS**.

## Próxima Fase
(Encerramento ou QA Release)
