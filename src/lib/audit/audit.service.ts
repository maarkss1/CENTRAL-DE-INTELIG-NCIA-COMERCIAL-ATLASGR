import { prisma } from '../prisma.js';
import { logger } from '../logger.js';

export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'IMPORT'
  | 'EXPORT'
  | 'PERMISSION_CHANGE'
  | 'ROLE_CHANGE'
  | 'API_KEY_CREATED'
  | 'WORKFLOW_EXECUTED'
  | 'AGENT_EXECUTED'
  | 'INTEGRATION_CONNECTED';

export interface AuditLogParams {
  action: AuditAction;
  entity: string;
  entityId?: string;
  actorId?: string;
  tenantId?: string;
  ipAddress?: string;
  device?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
}

export class AuditService {
  static async log(params: AuditLogParams): Promise<void> {
    try {
      const details = JSON.stringify({
        device: params.device,
        beforeState: params.beforeState,
        afterState: params.afterState,
      });

      await prisma.auditLog.create({
        data: {
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          actorId: params.actorId,
          tenantId: params.tenantId,
          ipAddress: params.ipAddress,
          details: details,
        },
      });
    } catch (error) {
      logger.error({ err: error, auditParams: params }, 'Failed to save audit log');
    }
  }
}
