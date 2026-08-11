- De: Agente 05 (Prospecção)
- Para: Agente 04 (CRM)
- Onda: G
- Status: aberto
- Prioridade: alto
## Problema
CRM precisa disparar mensagens do WhatsApp sob demanda para os contatos qualificados.
## Arquivo(s) envolvido(s)
- `src/features/prospecting/services/whatsapp.service.ts`
- Modificações necessárias nas rotas/serviços de CRM.
## Alteração necessária
Utilizar o `whatsappService.sendMessage(to, message)` disponível no módulo de prospecção para enviar mensagens de WhatsApp sob demanda.
## Teste esperado
Disparo de mensagem a partir de um Lead com número de celular válido via WhatsApp.
## Contexto adicional
O serviço `whatsappService` exportado precisa ser inicializado lendo o QR Code no terminal.
