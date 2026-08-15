- De: Agente 05 (Prospecção)
- Para: Agente 01 (Plataforma, Segurança e Dados) / 01A — schema é propriedade exclusiva do 01,
  não editado aqui
- Onda: 7
- Status: aberto
- Prioridade: normal

## Problema

Missão da Onda 7 pediu para auditar se `EnrichmentLog` já captura adequadamente, por campo
enriquecido: provider, timestamp, confiança/qualidade, campo original e status de atualização —
e "não misturar dado inferido com dado confirmado sem rotulagem" (AGENTS.md → LGPD → responsabilidade
do 05).

Hoje `EnrichmentLog` (prisma/schema.prisma:183-194) tem:

```prisma
model EnrichmentLog {
  id        String   @id @default(cuid())
  companyId String
  company   Company  @relation(fields: [companyId], references: [id], onDelete: Cascade)
  source    String // BrasilAPI-CNPJ | BrasilAPI-CEP | AI-Estimate | Domain-Heuristic | GDELT-News | Email-Verification | Lookalike-PgVector
  field     String // o que foi enriquecido (ex: "dados-cadastrais", "endereco", "contatos-sugeridos")
  status    String // success | not_found | failed
  rawData   Json?
  createdAt DateTime @default(now())

  @@index([companyId, createdAt])
}
```

Cobre bem `provider` (`source`) e `timestamp` (`createdAt`). Faltam dois pontos estruturais:

1. **Confirmado vs. inferido não é uma coluna — é implícito no valor de `source`.** Um consumidor
   (UI, relatório, auditoria) precisa saber de cor que `BrasilAPI-CNPJ`/`Google-Places` são "dado
   direto do provider" e que `Domain-Heuristic`/`Lookalike-PgVector`/`AI-Estimate` são "inferido",
   em vez de filtrar/ordenar por uma coluna própria. Pior: `Apollo-Organization` mistura os dois —
   `technology_names`/redes sociais são dado direto da Apollo, mas `estimated_num_employees` (só
   usado quando a Receita não trouxe nada — ver `enrichment.service.ts` linha ~444) é uma
   estimativa da própria Apollo, e hoje os dois viajam no mesmo log com o mesmo `status: 'success'`,
   sem diferenciação.

2. **`status` mistura "o provider respondeu" com "o dado foi persistido na Company".** Exemplo real
   em `enrichment.service.ts` (bloco `Domain-Heuristic`/`Website-Conhecido`): o log é gravado com
   `status: 'success'` sempre que `domainGuess.domain` existe — mas o código só grava
   `updateData.website` quando `!company.website` (linha ~343). Ou seja: um domínio pode aparecer
   como "success" no log de auditoria mesmo quando a empresa **já tinha** um site e o valor
   descoberto nunca chegou a ser escrito. Hoje isso só é reconstituível lendo `rawData` e cruzando
   manualmente com o estado da Company na mesma janela de tempo — não é uma coluna consultável.

## Arquivo(s) envolvido(s)

- `prisma/schema.prisma` (model `EnrichmentLog`) — proposta abaixo, não editado por mim.
- Escritas hoje em `src/features/prospecting/services/enrichment.service.ts` (8 chamadas a
  `prisma.enrichmentLog.create`) já ficam prontas para preencher os campos propostos assim que
  existirem — não é um projeto novo, é adicionar 2 valores a `data` em cada chamada já existente.

## Alteração necessária (proposta — decisão final é do 01)

Adicionar 2 campos a `EnrichmentLog`, ambos opcionais (não quebra os 8 registros já existentes nem
exige backfill):

```prisma
model EnrichmentLog {
  // ...campos existentes...

  /// Rótulo explícito confirmado/inferido — não depender do consumidor inferir isso a partir do
  /// texto livre de `source`. "confirmado" = veio verbatim de um provider autoritativo (Receita
  /// Federal via BrasilAPI, Google Places, e-mail/telefone devolvido nominalmente pela Apollo/
  /// Hunter). "inferido" = heurística/estimativa/scoring (Domain-Heuristic, Lookalike-PgVector,
  /// estimativa de funcionários por porte, GDELT — já documentado no código como "sinal
  /// best-effort, risco de falso positivo").
  dataOrigin String? // "confirmado" | "inferido"

  /// Se o dado retornado pelo provider foi de fato persistido no registro alvo (Company/Contact)
  /// nesta execução — distingue "o provider respondeu com sucesso" (o que `status` já cobre) de
  /// "o valor virou dado real no CRM" (que hoje só é reconstituível lendo `rawData` manualmente).
  /// Exemplo: `status: 'success'` num log de Domain-Heuristic mesmo quando `website` não foi
  /// atualizado porque a Company já tinha um site — sem esta coluna isso é invisível numa consulta.
  appliedToCompany Boolean?
}
```

Mantidos como `String?`/`Boolean?` (não enum Prisma) para não exigir migração de dado retroativo
nem travar os valores possíveis antes de terem uso real em produção — mesmo padrão já usado em
`source`/`field`/`status` neste model.

## Teste esperado

Depois de o 01 aplicar a migração, o 05 preenche os dois campos nas 8 chamadas de
`prisma.enrichmentLog.create` já existentes em `enrichment.service.ts` e adiciona/atualiza testes
unitários verificando que:
- logs de fonte direta (BrasilAPI-CNPJ found, Google-Places, Apollo-Organization, Apollo-People/
  Hunter-DomainSearch) gravam `dataOrigin: 'confirmado'`;
- logs de heurística/estimativa (Domain-Heuristic, Lookalike-PgVector, GDELT-News) gravam
  `dataOrigin: 'inferido'`;
- `appliedToCompany` reflete corretamente o caso documentado acima (domínio heurístico encontrado
  mas não aplicado porque a Company já tinha `website`).

## Contexto adicional

Não é bloqueador — `EnrichmentLog` já é funcional para o propósito de auditoria bruta (rawData +
source + status cobre "o que aconteceu"), só não é auto-suficiente para uma consulta agregada tipo
"quantos campos desta empresa são confirmados vs. inferidos" sem parsing manual de `rawData`. Ver
também `.agents/handoffs/onda-7/05-para-02-rotulagem-confirmado-inferido.md` — o contrato de UI que
consumiria estes dois campos quando existirem.
