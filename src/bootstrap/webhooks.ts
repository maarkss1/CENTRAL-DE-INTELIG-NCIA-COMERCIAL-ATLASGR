import type { Express } from 'express';
import { emailReplyWebhookRoutes } from '../features/integrations/email/emailReply.webhook.js';
import { signatureStatusWebhookRoutes } from '../features/integrations/signature/signatureStatus.webhook.js';
import { birthVoiceWebhookRoutes } from '../features/integrations/birth-voice/birthVoice.webhook.js';
import { voiceResultWebhookRoutes } from '../features/integrations/birth-voice/voiceResult.webhook.js';
import { bitrixWebhookRoutes } from '../features/integrations/bitrix/bitrix.webhook.js';
import { threecxWebhookRouter } from '../features/integrations/threecx/threecx.routes.js';
import { crm360PublicRoutes } from '../features/crm360/routes/crm360Public.routes.js';

/**
 * Monta as rotas que precisam ficar ANTES do `express.json()` global (webhooks cuja autenticidade
 * depende de assinatura calculada sobre os bytes crus do corpo, ou que usam parser próprio) e a
 * visualização pública de proposta comercial. Ordem entre si não é significativa — todas são
 * independentes — mas o conjunto inteiro precisa ser montado antes do parser JSON em server.ts.
 */
export function mountPreJsonWebhooks(app: Express): void {
  // Montado ANTES do express.json(): a autenticidade deste webhook é provada por uma assinatura
  // HMAC calculada sobre os bytes crus do corpo, que o parser global consumiria. Quem chama é o
  // Birth Voices Hub, não um usuário logado, por isso não passa por authenticateToken.
  app.use('/api/integrations/birth-voice', birthVoiceWebhookRoutes);
  app.use('/api/integrations/3cx/webhook', threecxWebhookRouter);

  // Webhook de resultado de chamadas de voz da Bland AI. O handler vive em
  // voiceResult.webhook.ts: o inline anterior tinha segredo com fallback hardcoded, busca de
  // lead cross-tenant sem RLS, nenhuma idempotência e req.body undefined (montado antes do
  // express.json() global sem parser próprio) — ver o comentário no topo daquele arquivo.
  app.use('/api/webhooks/voice-result', voiceResultWebhookRoutes);
  // Webhook de e-mail de ENTRADA (CYC-003, onda 26) — stub de transporte: nenhum provedor real de
  // inbound-parse plugado ainda, ver comentário no topo de emailReply.webhook.ts. Mesmo padrão de
  // montagem pré-express.json() dos webhooks acima (assinatura HMAC sobre o corpo cru).
  app.use('/api/webhooks/email', emailReplyWebhookRoutes);
  app.use('/api/webhooks/signature', signatureStatusWebhookRoutes);
  // Webhook de ENTRADA do Bitrix24 ("исходящий вебхук"): autenticidade provada por um segredo
  // por conexão (auth.application_token) comparado dentro da própria rota, não por header HMAC
  // — é o modelo de autenticação real que o Bitrix24 usa pra esse tipo de webhook (ver
  // bitrix.webhook.ts). Parser próprio (urlencoded, não json) porque o Bitrix envia form-encoded.
  app.use('/api/integrations/bitrix', bitrixWebhookRoutes);

  // CYC-005 (onda 25): visualização pública de proposta comercial. Quem abre o link é o
  // cliente/lead, sem conta no sistema — não passa por authenticateToken. O publicToken (uuid,
  // não adivinhável) na URL é a credencial, mesmo modelo dos webhooks acima.
  app.use('/api/public/proposals', crm360PublicRoutes);
}
