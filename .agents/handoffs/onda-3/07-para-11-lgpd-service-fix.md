# HandOff: Fix LGPD Service TypeScript Errors

- **De**: 07 (IA e Automações)
- **Para**: 11 (Marca e Ativos Institucionais)
- **Onda**: 3
- **Status**: aberto
- **Prioridade**: bloqueador

## Problema
Compilação TypeScript falha no arquivo `src/features/lgpd/lgpd.service.ts` com erros de propriedades inexistentes (`status`, `leads`, `whatsAppMessages`).

## Arquivo(s) envolvido(s)
- `src/features/lgpd/lgpd.service.ts`

## Alteração necessária
1. Corrigir o tipo usado ao criar mensagens WhatsApp para incluir a propriedade `status` ou remover uso incorreto.
2. Atualizar a definição de `Contact` (ou interface equivalente) para que contenha as propriedades `leads` e `whatsAppMessages`, ou adaptar o código para usar os campos corretos.
3. Garantir que todas as chamadas estejam tipadas corretamente e que o projeto compile sem erros.

## Teste esperado
- Executar `npx tsc --noEmit` e `npm run lint`; nenhum erro de compilação deve aparecer.
- Todos os testes existentes permanecem aprovados.

## Contexto adicional
Esses erros surgiram após a integração da nova rota LGPD e impedem o merge na branch de integração. São bloqueadores críticos que precisam ser resolvidos antes de avançar.
