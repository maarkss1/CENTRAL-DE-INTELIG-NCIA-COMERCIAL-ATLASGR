import type { Request, Response, NextFunction } from 'express';
import type { ContactUseCases } from '../application/ContactUseCases';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken';
import { routeParam } from '../../../shared/http/routeParams';

export class ContactController {
  constructor(private contactUseCases: ContactUseCases) {}

  getContacts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      // `req.query.q` pode chegar como array (`?q=a&q=b`) ou objeto (`?q[x]=y`), não só
      // string — `as string | undefined` só engana o TypeScript, não o runtime. Sem checar o
      // tipo de verdade, `query` seguia direto para `contactSearchIndexClauses`
      // (src/lib/crypto/piiIndex.ts), que chama `.replace`/`.includes` como se fosse sempre
      // string — um array nesse ponto derruba a rota com TypeError (CodeQL: "Type confusion
      // through parameter tampering"). Mesmo padrão já usado em outros controllers deste
      // projeto (ex.: Crm360Controller.ts) para qualquer `req.query` de busca livre.
      const query = typeof req.query.q === 'string' ? req.query.q : undefined;
      const result = await this.contactUseCases.findContacts(orgId, query, page, limit);
      res.json({ success: true, data: result.data, meta: result.meta });
    } catch (error) {
      next(error);
    }
  };

  getContactById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const contact = await this.contactUseCases.findContactById(orgId, routeParam(req.params.id, 'id'));
      if (!contact) {
        res.status(404).json({ success: false, error: 'Contact not found' });
        return;
      }
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  };

  createContact = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const contact = await this.contactUseCases.createContact(orgId, req.body);
      res.status(201).json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  };

  updateContact = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const contact = await this.contactUseCases.updateContact(
        orgId,
        routeParam(req.params.id, 'id'),
        req.body,
      );
      res.json({ success: true, data: contact });
    } catch (error) {
      next(error);
    }
  };

  deleteContact = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      await this.contactUseCases.deleteContact(orgId, routeParam(req.params.id, 'id'));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  enrichContact = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId: orgId } = (req as AuthRequest).user;
      const result = await this.contactUseCases.enrichContact(orgId, routeParam(req.params.id, 'id'));
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };
}
