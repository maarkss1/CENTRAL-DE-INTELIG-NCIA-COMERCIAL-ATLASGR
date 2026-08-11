- De: 06
- Para: 04
- Onda: 7
- Status: aberto
- Prioridade: normal
## Problema
É necessário adicionar um botão "Qualificar via Voz" na interface do CRM.
## Arquivo(s) envolvido(s)
src/features/crm/components/LeadDetailDrawer.tsx
## Alteração necessária
Injetar um botão "Qualificar via Voz" que faça uma requisição POST fetch para http://localhost:3000/api/webhooks/bland passando name, phone_number, e company.
## Teste esperado
Disparar a requisição POST com o payload correto.
## Contexto adicional
Fora do escopo do Agente 06. Favor implementar.
