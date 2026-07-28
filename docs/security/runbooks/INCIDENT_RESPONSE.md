# Incident Response Plan

## Overview
This document outlines the steps to take in the event of a security breach.

## Phase 1: Identification
- Monitor `AuditLog` table for unusual patterns (e.g., massive spikes in `USER_LOGIN_FAILED`).
- Review trace IDs (`X-Trace-Id`) across systems to build a timeline.

## Phase 2: Containment
- Immediately rotate all `JWT_SECRET` and `JWT_REFRESH_SECRET` environment variables.
- Expire active API keys.
- If data exfiltration is detected, restrict database network access to read-only.

## Phase 3: Eradication & Recovery
- Identify the vulnerability (e.g., missed route validation).
- Apply Zod validation or proper role requirements.
- Issue forced logout to all active sessions.

## Phase 4: Post-Incident
- Generate a root-cause analysis report.
- Update `THREAT_MODEL.md`.
