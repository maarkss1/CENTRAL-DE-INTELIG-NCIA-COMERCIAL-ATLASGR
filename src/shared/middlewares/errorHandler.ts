import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { logger } from '../../lib/logger.js';

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
    details?: unknown;
}

export class AppError extends Error {
    public readonly statusCode: number;
    public readonly details?: unknown;

    constructor(message: string, statusCode: number = 400, details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        Object.setPrototypeOf(this, new.target.prototype); // restore prototype chain
    }
}

export const errorHandler = (err: Error & { statusCode?: number; details?: unknown }, _req: Request, res: Response, _next: NextFunction): void => {
    logger.error({ err, status: (err as any).statusCode }, 'Global error handler');

    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            error: 'Erro de Validação',
            details: err.issues
        });
        return;
    }

    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
            details: err.details
        });
        return;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
            res.status(409).json({
                success: false,
                error: 'Conflito de Dados: Este registro já existe.'
            });
            return;
        }
        if (err.code === 'P2025') {
            res.status(404).json({
                success: false,
                error: 'Registro não encontrado.'
            });
            return;
        }
    }

    const status = err.statusCode ?? 500;
    res.status(status).json({
        success: false,
        error: err.message || 'Erro Interno do Servidor'
    });
};
