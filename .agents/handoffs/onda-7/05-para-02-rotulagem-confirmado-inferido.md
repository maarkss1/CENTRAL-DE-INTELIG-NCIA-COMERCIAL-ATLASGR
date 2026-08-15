- De: Agente 05 (Prospecção)
- Para: Agente 02 (Produto e UX)
- Onda: 7
- Status: aberto
- Prioridade: normal

## Problema

Missão da Onda 7 pediu para documentar onde a UI mostraria "confirmado" vs "inferido" para dado
enriquecido — sem eu editar componente de UI (fora do meu escopo de arquivo desta tarefa). Este
handoff documenta o contrato de dado já disponível hoje e o que fica disponível assim que
`.agents/handoffs/onda-7/05-para-01-enrichmentlog-provenance-fields.md` for resolvido.

## Arquivo(s) envolvido(s)

Prováveis pontos de consumo (não alterados por mim):
- `src/features/prospecting/components/prospecting-hub/CandidateCard.tsx` (já lê
  `enrichment.apolloContacts`)
- `src/features/crm/components/LeadDetailDrawer.tsx` / tela de detalhe de empresa/contato, onde
  campos enriquecidos (endereço, e-mail, telefone, porte) já são exibidos hoje sem indicação de
  proveniência.

## Contrato de dado disponível hoje (sem esperar schema novo)

1. **`Contact.emailStatus`** (`String?`, valores `"verified" | "invalid" | "guessed"` — ver
   `src/features/prospecting/services/enrichment/domainGuess.ts::resolveEmailStatus`): já é
   granularidade **por e-mail individual**, pronta para virar badge "verificado" (confirmado) vs.
   "sugerido" (inferido) sem qualquer mudança de schema.
2. **`Contact.source`** (`"Apollo" | "Hunter"`): já indica o provider por contato.
3. **`Company.enrichmentSource`** (`String?`): resumo textual agregado (ex: "BrasilAPI/Receita
   Federal + Google + Apollo (firmographics)") — bom para um tooltip "de onde veio este
   enriquecimento", mas é texto livre, não estruturado por campo.
4. **`EnrichmentLog.source`/`field`/`status`/`rawData`**: granularidade por rodada de
   enriquecimento (não por campo individual da Company) — hoje só consultável via backend, sem
   rota que exponha isso à UI.

## O que falta para uma rotulagem "confirmado/inferido" completa e consultável

Ver `.agents/handoffs/onda-7/05-para-01-enrichmentlog-provenance-fields.md`: proponho
`EnrichmentLog.dataOrigin` ("confirmado"/"inferido") e `EnrichmentLog.appliedToCompany` (bool).
Depois de existirem, ainda falta:
- uma rota que exponha `EnrichmentLog` por `companyId` (hoje não existe nenhuma rota pública —
  `EnrichmentLog` só é escrito, nunca lido de volta pelo backend);
- decisão de produto/UX sobre onde esse badge aparece (por campo individual? só um resumo "X
  confirmados, Y inferidos" no card da empresa?) — isso é decisão do 02, não minha.

## Teste esperado

N/A — este handoff é informativo/contrato de dado, não pede uma correção específica agora. Quando o
02 (ou quem herdar a tela) decidir consumir isso, o teste esperado é: campos com
`dataOrigin: 'inferido'` (ex: e-mail adivinhado por heurística de domínio, funcionário estimado por
porte da Receita, lookalike score) nunca aparecem na UI com o mesmo peso visual/confiança que campos
`dataOrigin: 'confirmado'` (ex: CNPJ/razão social da Receita Federal, e-mail com MX verificado).

## Contexto adicional

Não bloqueador. Registrado para não perder o requisito de "rotulagem visível" da missão da Onda 7
entre as ondas — a parte que cabia ao 05 (proveniência no banco) está endereçada via o handoff para
01; a parte visual é decisão de produto do 02.
