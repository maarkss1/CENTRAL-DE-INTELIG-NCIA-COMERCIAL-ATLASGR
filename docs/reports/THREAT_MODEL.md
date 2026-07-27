# Threat Model

## Assumptions
- The database is not exposed to the public internet.
- SSL/TLS is terminated at the load balancer or reverse proxy.

## Identified Threats & Mitigations

### 1. Token Theft (XSS)
- **Threat:** Malicious scripts stealing JWTs.
- **Mitigation:** Refresh tokens are stored in `HttpOnly` strict cookies. XSS filters and CSP are enforced via Helmet.

### 2. Brute Force & Credential Stuffing
- **Threat:** Attackers guessing passwords or API keys.
- **Mitigation:** Express-rate-limit configured globally. Bcrypt hashing.

### 3. Replay Attacks
- **Threat:** Intercepted valid requests replayed against the server.
- **Mitigation:** Replay attack cache checking Nonces sent in headers.

### 4. Privilege Escalation (Mass Assignment)
- **Threat:** Users sending unallowed fields in payload (e.g., `role: 'ADMINISTRADOR'`).
- **Mitigation:** Strict Zod schema validation explicitly strips unallowed properties.
