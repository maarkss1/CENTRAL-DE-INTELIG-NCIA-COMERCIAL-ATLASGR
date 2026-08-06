# Deploy no Render

Este projeto usa variáveis de ambiente para ativar integrações pagas e webhooks externos. O arquivo `render.yaml` mantém somente a lista de chaves necessárias para o Render; os valores sensíveis devem ser cadastrados no dashboard do Render como secrets, nunca versionados no Git.

## Variáveis obrigatórias para produção

| Variável | Onde obter | Observação |
| --- | --- | --- |
| `DATABASE_URL` | Banco PostgreSQL do Render | Preenchida automaticamente pelo blueprint. |
| `BETTER_AUTH_URL` | URL pública do serviço Render | Exemplo: `https://prospector-atlas.onrender.com`. |
| `PUBLIC_BASE_URL` | URL pública do serviço Render | Use o mesmo host público para callbacks/webhooks. |
| `ALLOWED_ORIGINS` | Domínios permitidos | Separe múltiplas origens por vírgula. |
| `BETTER_AUTH_SECRET` | Gerado pelo Render | O blueprint usa `generateValue: true`. |

## Chaves de prospecção e IA

Para habilitar Apollo, Google Places/Maps e Hunter em produção, mantenha `PROSPECTING_PROVIDER_MODE=hybrid` e cadastre os secrets abaixo no Render:

| Variável | Plataforma |
| --- | --- |
| `APOLLO_API_KEY` | Apollo |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform / Places API |
| `HUNTER_API_KEY` | Hunter |
| `GROQ_API_KEY` | Groq |

## Bitrix24

| Variável | Plataforma |
| --- | --- |
| `BITRIX24_WEBHOOK_URL` | Webhook de entrada Bitrix24 |
| `BIRTH_VOICES_WEBHOOK_SECRET` | Segredo compartilhado para webhooks assinados, quando a integração de voz estiver ativa |

O webhook de saída do Bitrix24 deve apontar para a URL pública do Render, não para IP local. Use a base `PUBLIC_BASE_URL` do serviço publicado e o caminho esperado pela integração que receberá o evento.

## Passo a passo no Render

1. Importe este repositório como Blueprint no Render para aplicar `render.yaml`.
2. Abra o serviço `prospector-atlas` em **Environment**.
3. Preencha os campos marcados com `sync: false` usando os valores reais das plataformas.
4. Faça deploy/redeploy do serviço para reiniciar a aplicação com as novas variáveis.
5. Depois do deploy, teste a busca de prospecção com um termo simples e valide os callbacks do Bitrix24 usando a URL pública do Render.
