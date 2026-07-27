# Compliance Report

## LGPD (Lei Geral de Proteção de Dados)
- PII masking functions provided (`server/security/encryption.ts`).
- Encryption at rest for sensitive text data enabled via AES-256-GCM functions.
- Audit logs capture actor, tenant, IP, and timestamp for accountability.

## SOC2 Readiness
- Immutable audit trails implemented via Prisma `AuditLog` table.
- RBAC matrices centralized and heavily tested.

## OWASP ASVS
- Injection flaws mitigated via Prisma parameterized queries and Zod inputs.
- Broken Authentication addressed via HttpOnly tokens and rotation.
- Security Misconfigurations mitigated via Helmet generic defaults.
