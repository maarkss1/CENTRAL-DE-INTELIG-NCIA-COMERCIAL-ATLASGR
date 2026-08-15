# Threat Model

## Assumptions
- The database (Supabase Postgres) is not exposed to the public internet.
- SSL/TLS is terminated at Cloudflare (modo Full strict) na frente do Render — ver
  `docs/deploy/producao.md`, seção 3.

## Identified Threats & Mitigations

### 1. Session Cookie Theft (XSS)
- **Threat:** Script malicioso rouba o cookie de sessão do usuário.
- **Mitigation:** Sessão gerida pelo Better Auth (`src/lib/auth.ts`) via cookie `HttpOnly`
  (`better-auth.session_token`) — não há Access/Refresh Token JWT neste projeto. Filtros de
  XSS/CSP aplicados via Helmet (`server.ts`; CSP restritiva customizada em produção).

### 2. Brute Force & Credential Stuffing
- **Threat:** Tentativas de adivinhar senha por força bruta ou credential stuffing.
- **Mitigation:** `authLimiter` dedicado em `/api/auth` (só `POST`,
  `AUTH_RATE_LIMIT_MAX` — default 20 tentativas/15min por IP), além do `apiLimiter` genérico
  (`API_RATE_LIMIT_MAX`) — ver `server.ts`. Hash de senha gerido internamente pelo Better Auth
  (provider `credential`), não implementado neste código.

### 3. Replay Attacks
- **Threat:** Requisição legítima interceptada e reenviada pelo atacante.
- **Mitigation real hoje:** **gap não mitigado** — não existe um cache genérico de nonce por
  requisição neste código (a versão anterior deste documento descrevia um mecanismo que nunca foi
  implementado). O que existe de fato: HTTPS ponta-a-ponta (Cloudflare Full strict → Render)
  reduz a superfície de interceptação em trânsito, e os 4 webhooks internos (`birth-voice`,
  `3cx/webhook`, `voice-result`, `bitrix`) assinam com HMAC + comparação em tempo constante
  (`timingSafeEqual`) — isso impede *forjar* uma assinatura, mas não impede o replay de uma
  requisição legítima já capturada. Se isso virar um requisito real, a correção é
  timestamp+nonce por webhook (rejeitar fora de uma janela de tempo + nonce já visto), não algo
  que já exista hoje.

### 4. Privilege Escalation (Mass Assignment)
- **Threat:** Users sending unallowed fields in payload (e.g., `role: 'ADMIN'`).
- **Mitigation:** Strict Zod schema validation explicitly strips unallowed properties.
