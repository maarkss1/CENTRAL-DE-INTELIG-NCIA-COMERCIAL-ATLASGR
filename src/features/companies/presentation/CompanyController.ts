import type { Request, Response, NextFunction } from 'express';
import type { CompanyUseCases } from '../application/CompanyUseCases';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import { routeParam } from '../../../shared/http/routeParams';

export class CompanyController {
  constructor(private companyUseCases: CompanyUseCases) {}

  getCompanies = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      // Mesmo padrão de ContactController.getContacts: `req.query.q` pode chegar como array
      // (`?q=a&q=b`) ou objeto (`?q[x]=y`), não só string — `as string | undefined` só
      // engana o TypeScript, não o runtime (CodeQL: "Type confusion through parameter
      // tampering").
      const query = typeof req.query.q === 'string' ? req.query.q : undefined;
      const result = await this.companyUseCases.findCompanies(orgId, query, page, limit);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  getCompanyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const company = await this.companyUseCases.findCompanyById(
        orgId,
        routeParam(req.params.id, 'id'),
      );
      if (!company) {
        res.status(404).json({ success: false, error: 'Company not found' });
        return;
      }
      res.json({ success: true, data: company });
    } catch (error) {
      next(error);
    }
  };

  createCompany = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const company = await this.companyUseCases.createCompany(orgId, req.body);
      res.status(201).json({ success: true, data: company });
    } catch (error) {
      next(error);
    }
  };

  updateCompany = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const company = await this.companyUseCases.updateCompany(
        orgId,
        routeParam(req.params.id, 'id'),
        req.body,
      );
      res.json({ success: true, data: company });
    } catch (error) {
      next(error);
    }
  };

  deleteCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      await this.companyUseCases.deleteCompany(orgId, routeParam(req.params.id, 'id'));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  enrichCompany = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const result = await this.companyUseCases.enrichCompany(
        orgId,
        routeParam(req.params.id, 'id'),
        {
          cnpj: req.body?.cnpj,
          segmentKeywords: req.body?.segmentKeywords,
        },
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
