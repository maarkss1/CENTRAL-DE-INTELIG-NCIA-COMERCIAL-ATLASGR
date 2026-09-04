import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { env } from '../config/env.js';

// Sem isto, esquecer de definir ALLOWED_ORIGINS em produção fazia o servidor subir "com sucesso"
// mas só aceitando as origens de localhost do fallback abaixo — todo tráfego do frontend real de
// produção era rejeitado por CORS, uma falha silenciosa e difícil de diagnosticar (o deploy parece
// saudável nos logs). Falhar rápido aqui torna o erro óbvio no boot em vez de um mistério em runtime.
export const ALLOWED_ORIGINS = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean)
  : ['http://localhost:3005', 'http://localhost:3000', 'http://localhost:5173'];

/**
 * Encerra o processo imediatamente se ALLOWED_ORIGINS não estiver configurada em produção.
 * Deve rodar antes de qualquer outra etapa de bootstrap — falha rápido no boot em vez de deixar
 * a aplicação subir "saudável" enquanto rejeita todo tráfego real por CORS.
 */
export function assertAllowedOriginsConfigured(): void {
  if (env.NODE_ENV === 'production' && !env.ALLOWED_ORIGINS) {
    console.error('FATAL ERROR: ALLOWED_ORIGINS não está definida em produção. Encerrando.');
    process.exit(1);
  }
}

/**
 * Monta os middlewares de segurança de borda: trust proxy, cabeçalhos HTTP (Helmet), CORS e
 * compressão de resposta. Devem ser os primeiros middlewares aplicados — antes de rate limiting,
 * webhooks ou qualquer rota — porque protegem/afetam toda requisição que entra no processo.
 */
export function applySecurityMiddleware(app: Express): void {
  // CORREÇÃO: TRUST_PROXY definido em env.ts mas nunca aplicado aqui — sem isso
  // o rate limiter usava o IP do proxy reverso (sempre o mesmo) em vez do IP real
  // do cliente, tornando o limite ineficaz em produção atrás de um load balancer.
  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);

    // Better Auth resolve IP do cliente lendo x-forwarded-for por conta própria
    // (@better-auth/core/utils/ip.ts, getIp) — não reaproveita req.ip do Express, e sem
    // `advanced.ipAddress.trustedProxies` configurado, um header com mais de um IP é tratado como
    // não confiável (devolve null): warning real de produção ("Rate limiting could not determine
    // a client IP..."), degradando o rate limit de login para um único bucket compartilhado entre
    // TODOS os clientes (issues #157/#158).
    //
    // `trustedProxies` exigiria o IP/CIDR exato do(s) proxy(s) do Render, não publicado de forma
    // estável — e reaproveitar `req.ip` do Express (`trust proxy: 1`) foi tentado e descartado
    // nesta rodada: `trust proxy: N` conta hops a partir do socket que conecta na aplicação, não
    // a partir do cliente (verificado lendo express/lib/utils.js#compileTrust + o pacote
    // `forwarded`) — com uma cadeia de mais de 1 proxy à frente da aplicação, `req.ip` resolve
    // para o penúltimo hop (outro proxy), não para o cliente real, então usá-lo aqui só trocaria
    // "não resolve" por "resolve errado com confiança".
    //
    // Em vez disso, aplicamos a convenção universal do próprio cabeçalho X-Forwarded-For (RFC
    // 7239/de-facto desde sempre: cada proxy ANEXA ao final, o valor mais à ESQUERDA é sempre o
    // cliente original) — `TRUST_PROXY=true` já é a declaração explícita do operador de que esta
    // aplicação roda atrás de proxy(s) legítimo(s) que seguem essa convenção (mesma confiança que
    // já habilita `trust proxy` no Express), então tomamos o primeiro valor da lista para
    // qualquer rota, sem precisar conhecer a contagem exata de hops nem o CIDR do proxy.
    app.use((req, _res, next) => {
      const forwarded = req.headers['x-forwarded-for'];
      const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
      if (raw?.includes(',')) {
        const client = raw.split(',')[0]?.trim();
        if (client) req.headers['x-forwarded-for'] = client;
      }
      next();
    });
  }

  // Helmet adiciona cabeçalhos HTTP de segurança (X-Frame-Options, HSTS, etc.)
  // CSP customizada (em vez do default implícito do Helmet) cobrindo os recursos
  // externos conhecidos da aplicação: Google Fonts, Font Awesome (cdnjs), áudio
  // ambiente do Welcome Screen (Pixabay) e o redirecionamento de login social do
  // Google via better-auth. Script-src permanece estrito ('self' apenas) — é o
  // vetor que a CSP existe para mitigar; style-src mantém 'unsafe-inline' porque
  // React aplica estilos inline via atributo `style` de forma extensiva no app.
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: [
                  "'self'",
                  "'unsafe-inline'",
                  'https://fonts.googleapis.com',
                  'https://cdnjs.cloudflare.com',
                ],
                fontSrc: [
                  "'self'",
                  'https://fonts.gstatic.com',
                  'https://cdnjs.cloudflare.com',
                  'data:',
                ],
                imgSrc: ["'self'", 'data:', 'https:'],
                mediaSrc: ["'self'", 'https://cdn.pixabay.com'],
                connectSrc: ["'self'"],
                frameSrc: ["'self'", 'https://accounts.google.com'],
                formAction: ["'self'", 'https://accounts.google.com'],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
              },
            }
          : false,
    }),
  );

  // CORS — permite qualquer origem em ambiente de desenvolvimento
  app.use(
    cors({
      origin: (origin, callback) => {
        // Permitir requests sem origin (Postman, curl, apps mobile)
        if (!origin) return callback(null, true);
        // Permitir todas as origens localmente para acesso na rede
        if (env.NODE_ENV !== 'production') return callback(null, true);
        // CORREÇÃO: `origin.endsWith('.railway.app')` liberava CORS com credentials:true (cookies
        // de sessão) pra QUALQUER subdomínio railway.app, não só o desta aplicação — qualquer
        // outro app hospedado no Railway podia fazer requisições autenticadas contra esta API.
        // O domínio real de produção (ex: seu-app.up.railway.app) deve estar listado explicitamente
        // em ALLOWED_ORIGINS, igual a qualquer outra origem.
        if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
        callback(new Error(`CORS policy: origin ${origin} not allowed`));
      },
      credentials: true, // Necessário para Better Auth (cookies de sessão)
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    }),
  );

  // Compressão gzip/brotli — reduz tamanho de resposta até 70%
  app.use(compression());
}
