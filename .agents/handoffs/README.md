# .agents/handoffs/

Pasta de handoffs entre agentes. Qualquer agente pode criar o próprio arquivo aqui; ninguém edita o handoff criado por outro agente, exceto para atualizar o campo `Status` e acrescentar uma seção `## Resolução` quando for o destinatário que resolveu o item.

## Estrutura
```text
handoffs/
  onda-1/
    06-para-01-schema-extracoes-bitrix.md
    01-para-06-contrato-credenciais.md
  onda-2/
    05-para-01-schema-enrichment.md
  onda-3/
    08-para-03-contraste-dashboard.md
```

## Template de arquivo
```markdown
- De: <agente origem>
- Para: <agente destino>
- Onda: <n>
- Status: aberto | em-andamento | resolvido
- Prioridade: bloqueador | alto | normal

## Problema

## Arquivo(s) envolvido(s)

## Alteração necessária

## Teste esperado

## Contexto adicional

## Resolução
(preenchido pelo agente destino ao resolver)
```

Regra de aprovação de onda: nenhuma onda é aprovada pelo Coordenador com handoff `Prioridade: bloqueador` e `Status: aberto` dentro da pasta da própria onda. Ver `/AGENTS.md` → "Protocolo de handoff".
