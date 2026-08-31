import type { Request, Response, NextFunction } from 'express';

export const opaMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user || {};
    const { role, organizationId } = user;

    const input = {
      method: req.method,
      path: req.path,
      role: role || 'anonymous',
      organizationId: organizationId || null,
    };

    const response = await fetch('http://localhost:8181/v1/data/atlasgr/rbac/allow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    if (!response.ok) {
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    const result = await response.json();
    if (result.result === true) {
      return next();
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
