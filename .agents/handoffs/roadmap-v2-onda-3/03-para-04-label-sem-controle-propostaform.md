- De: 03 — Design e Acessibilidade
- Para: 04 — CRM e BI
- Onda: roadmap-v2-onda-3
- Status: aberto
- Prioridade: normal

## Problema

`<Label>Itens *</Label>` em `PropostaForm.tsx` não está associado a nenhum controle de formulário
(`jsx-a11y/label-has-associated-control`, achado real ao rodar `npx eslint src` durante a auditoria
de acessibilidade da Onda 3 — não aparece na varredura de `src/components/ui`/`src/styles`, que é o
escopo do Agente 03, porque o primitivo `Label.tsx` em si não tem esse bug: o problema é de uso, não
do componente). É o único uso de `<Label>` em todo o repositório sem `htmlFor` correspondente (39
outras ocorrências já associam corretamente) — rotula visualmente a seção "Itens" de um `useFieldArray`
(lista dinâmica de itens da proposta), não um único `<input>`/`<select>`, então `htmlFor` não é o
fix certo aqui.

## Arquivo(s) envolvido(s)

`src/features/crm360/components/PropostaForm.tsx`, linha 262 (`<Label>Itens *</Label>`, dentro da
seção que renderiza `fields.map(...)` de `useFieldArray`).

## Alteração necessária

Trocar o padrão `<Label>` (pensado para rotular 1 controle via `htmlFor`) por um agrupamento
semântico real: `<fieldset>` envolvendo o bloco de itens + `<legend>Itens *</legend>` (estilizado
para não parecer um `<legend>` padrão do navegador, se necessário) — é o padrão HTML correto para
"nome de um grupo de campos", não uma associação label↔control 1:1. Alternativa mais leve, se
`<fieldset>` conflitar com o layout flex atual: manter o `<span>`/texto visual como está, mas
adicionar `role="group"` + `aria-labelledby` apontando pro texto no container que envolve a lista de
itens.

## Teste esperado

`npx eslint src/features/crm360` sem o warning `jsx-a11y/label-has-associated-control` nessa linha;
confirmação manual (leitor de tela ou inspeção da árvore de acessibilidade) de que o grupo "Itens *"
é anunciado ao focar o primeiro campo da lista.

## Contexto adicional

Não é bloqueador — é `warn` no `eslint.config.mjs` atual (débito conhecido, comentado no próprio
config), não quebra o gate. Fora do escopo do Agente 03 nesta onda porque o arquivo pertence a
`src/features/crm360/` (fora de `src/components/ui/`/`src/styles/`), e o próprio `Label.tsx` (owned
by 03) não precisa de mudança — ele é intencionalmente genérico (usado 40x no repo, exige `htmlFor`
por instância, não pelo componente).
