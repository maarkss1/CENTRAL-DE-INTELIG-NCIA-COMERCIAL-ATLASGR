# Security Guide

## Introduction
This guide provides developers and operators with the security protocols used in the Prospector-Atlas platform.

## Authentication & Authorization
- **JWT Tokens:** The application utilizes short-lived Access Tokens (15m) and long-lived Refresh Tokens (7d) stored in `HttpOnly` cookies.
- **Roles:** Defined in `server/security/PermissionMatrix.ts`. Current roles include ADMINISTRADOR, GESTOR_COMERCIAL, CLOSER, SDR, VISUALIZADOR.
- **Middleware:** Use `authenticateToken`, `requireTenant`, and `requireRole` on protected routes.

## Data Validation
Always validate incoming request bodies using Zod schemas found in `server/security/validation.ts`.

## Auditing
Use the `AuditService.logEvent` function for critical state changes, data accesses, and authentication attempts.
