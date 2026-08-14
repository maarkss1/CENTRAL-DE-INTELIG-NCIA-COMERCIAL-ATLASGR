# Deploy no Render

> Guia completo (Supabase + Render + Cloudflare + CI/CD + checklist): ver
> [`docs/deploy/producao.md`](producao.md). Este arquivo cobre só a parte específica do Render.

Este projeto usa variáveis de ambiente para ativar integrações pagas e webhooks externos. O arquivo `render.yaml` mantém somente a lista de chaves necessárias para o Render; os valores sensíveis devem ser cadastrados no dashboard do Render como secrets, nunca versionados no Git.

O banco **não** é mais provisionado pelo Render (sem bloco `databases:` no blueprint) — é um
projeto Supabase externo. Ver [`producao.md`](producao.md#1-banco-de-dados--supabase) para obter
a connection string.

## Variáveis obrigatórias para produção

| Variável | Onde obter | Observação |
| --- | --- | --- |
| `DATABASE_URL` | Session Pooler do Supabase | Ver `producao.md` seção 1.1. Não é mais preenchida automaticamente — o Render não provisiona mais o Postgres. |
| `DIRECT_URL` | Direct connection do Supabase | Opcional — só se `prisma migrate deploy` falhar via pooler. |
| `BETTER_AUTH_URL` | URL pública do serviço Render (ou domínio custom) | Exemplo: `https://prospector-atlas.onrender.com` ou `https://app.atlasgr.com.br`. |
| `PUBLIC_BASE_URL` | URL pública do serviço Render | Use o mesmo host público para callbacks/webhooks. |
| `ALLOWED_ORIGINS` | Domínios permitidos | Separe múltiplas origens por vírgula. |
| `BETTER_AUTH_SECRET` | Gerado pelo Render | O blueprint usa `generateValue: true`. |
| `STORAGE_*` | Supabase Storage → S3 Connection | Ver `producao.md` seção 1.2. Opcional — sem elas o storage de objetos fica inerte. |

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
3. Preencha os campos marcados com `sync: false` usando os valores reais das plataformas
   (inclui `DATABASE_URL` do Supabase agora — não é mais automático).
4. Faça deploy/redeploy do serviço para reiniciar a aplicação com as novas variáveis.
5. Depois do deploy, teste a busca de prospecção com um termo simples e valide os callbacks do Bitrix24 usando a URL pública do Render.

## Deploy automático a cada push

Com o serviço conectado ao GitHub (feito no passo 1), todo push na branch configurada dispara,
sem nenhum passo manual: `buildCommand` → `startCommand` (que roda `npx prisma migrate deploy &&
npm run start` — a instância antiga continua servindo tráfego até a nova passar no health check,
que só acontece depois da migração terminar) → health check em `healthCheckPath`
(`/health/ready`, checa conexão real com o banco) antes de rotear tráfego pra instância nova.
`preDeployCommand` (instância efêmera separada para a migração, zero-downtime "de verdade") só
existe em planos pagos do Render — enquanto o serviço estiver em `plan: free`, a migração roda
dentro do `startCommand`; ver comentário em `render.yaml` e `producao.md` seção 2.2 para o plano
de migração ao trocar para `plan: starter`. Detalhes e o gate de CI recomendado (branch protection
em `main`) em [`producao.md`](producao.md#23-gate-de-qualidade-antes-do-deploy).
