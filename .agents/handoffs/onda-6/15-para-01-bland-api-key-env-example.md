- De: Agente 15 (Segurança Aplicada e Rotação de Segredos)
- Para: Agente 01 (Plataforma, Segurança e Dados — dono de `.env.example`)
- Onda: 6
- Status: aberto
- Prioridade: normal

## Problema
`BLAND_API_KEY` é lida em `src/features/integrations/birth-voice/birthVoice.service.ts`
(`process.env.BLAND_API_KEY`, usada como credencial quando `config.baseUrl` contém `bland.ai`),
mas **não está listada em `.env.example`**. Quem provisiona um ambiente novo (ou executa o runbook
de rotação `docs/security/runbooks/ROTATE_BLAND_AI_KEY.md`) não tem como descobrir que essa env
existe sem ler o código-fonte da integração.

## Arquivo(s) envolvido(s)
- `.env.example` — fora do meu escopo (propriedade do Agente 01 para o contrato de segredos do
  projeto, conforme meu próprio prompt: "leia `.env.example` — o contrato do que é segredo neste
  projeto").
- Referência de uso: `src/features/integrations/birth-voice/birthVoice.service.ts`.

## Alteração necessária
Adicionar a `.env.example` uma linha `BLAND_API_KEY=` (sem valor, com comentário curto explicando
o propósito — "chave da API Bland AI, usada para autenticar chamadas quando o baseUrl da conexão de
voz for bland.ai"), seguindo o padrão já usado nas outras entradas do arquivo (ex.: comentário
acima de `BITRIX24_WEBHOOK_URL`).

## Teste esperado
`.env.example` passa a listar `BLAND_API_KEY` junto das demais credenciais de integração; nenhum
valor real incluído.

## Contexto adicional
Encontrado durante a auditoria de segurança da Onda 6, ao escrever o runbook de rotação da chave
Bland AI. Não é bloqueador de release — é lacuna de documentação de contrato de ambiente.
