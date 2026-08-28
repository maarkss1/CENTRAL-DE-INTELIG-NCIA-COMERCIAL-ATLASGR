import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { AutomationController } from '../AutomationController.js';
import type { AutomationUseCases } from '../../application/AutomationUseCases.js';

/**
 * `AutomationController` nunca tinha teste unitário próprio. Cobre aqui o contrato HTTP de cada
 * método (200/201/204/404, e `next(error)` no catch) com `AutomationUseCases` mockado — sem
 * Express real, sem banco.
 */

function buildResponse() {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function buildRequest(overrides: Record<string, unknown> = {}): Request {
  return {
    user: { organizationId: 'org-1', id: 'user-1', email: 'user@atlasgr.com.br' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as Request;
}

describe('AutomationController', () => {
  let useCases: {
    listAutomations: ReturnType<typeof vi.fn>;
    createAutomation: ReturnType<typeof vi.fn>;
    updateAutomation: ReturnType<typeof vi.fn>;
    removeAutomation: ReturnType<typeof vi.fn>;
    listVersions: ReturnType<typeof vi.fn>;
    dryRun: ReturnType<typeof vi.fn>;
  };
  let controller: AutomationController;
  let next: NextFunction;

  beforeEach(() => {
    useCases = {
      listAutomations: vi.fn(),
      createAutomation: vi.fn(),
      updateAutomation: vi.fn(),
      removeAutomation: vi.fn(),
      listVersions: vi.fn(),
      dryRun: vi.fn(),
    };
    controller = new AutomationController(useCases as unknown as AutomationUseCases);
    next = vi.fn();
  });

  it('getOptions devolve os gatilhos/ações válidos sem chamar o use case', () => {
    const res = buildResponse();

    controller.getOptions(buildRequest(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('getAutomations devolve a lista da organização autenticada', async () => {
    useCases.listAutomations.mockResolvedValue([{ id: 'auto-1' }]);
    const res = buildResponse();

    await controller.getAutomations(buildRequest(), res, next);

    expect(useCases.listAutomations).toHaveBeenCalledWith('org-1');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 'auto-1' }] });
    expect(next).not.toHaveBeenCalled();
  });

  it('getAutomations encaminha erro para next()', async () => {
    const error = new Error('boom');
    useCases.listAutomations.mockRejectedValue(error);
    const res = buildResponse();

    await controller.getAutomations(buildRequest(), res, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  it('createAutomation responde 201 com o registro criado', async () => {
    useCases.createAutomation.mockResolvedValue({ id: 'auto-2' });
    const res = buildResponse();

    await controller.createAutomation(buildRequest({ body: { name: 'Nova' } }), res, next);

    expect(useCases.createAutomation).toHaveBeenCalledWith('org-1', { name: 'Nova' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'auto-2' } });
  });

  describe('updateAutomation', () => {
    it('responde 404 quando o use case devolve null', async () => {
      useCases.updateAutomation.mockResolvedValue(null);
      const res = buildResponse();

      await controller.updateAutomation(buildRequest({ params: { id: 'auto-x' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('responde 200 com o registro atualizado, passando o actor autenticado', async () => {
      useCases.updateAutomation.mockResolvedValue({ id: 'auto-1', enabled: false });
      const res = buildResponse();

      await controller.updateAutomation(
        buildRequest({ params: { id: 'auto-1' }, body: { enabled: false } }),
        res,
        next,
      );

      expect(useCases.updateAutomation).toHaveBeenCalledWith(
        'org-1',
        'auto-1',
        { enabled: false },
        { userId: 'user-1', email: 'user@atlasgr.com.br' },
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 'auto-1', enabled: false },
      });
    });
  });

  describe('deleteAutomation', () => {
    it('responde 404 quando o use case devolve false', async () => {
      useCases.removeAutomation.mockResolvedValue(false);
      const res = buildResponse();

      await controller.deleteAutomation(buildRequest({ params: { id: 'auto-x' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responde 204 sem corpo quando a remoção é bem-sucedida', async () => {
      useCases.removeAutomation.mockResolvedValue(true);
      const res = buildResponse();

      await controller.deleteAutomation(buildRequest({ params: { id: 'auto-1' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('getVersions', () => {
    it('responde 404 quando a automação não pertence à organização', async () => {
      useCases.listVersions.mockResolvedValue(null);
      const res = buildResponse();

      await controller.getVersions(buildRequest({ params: { id: 'auto-x' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('responde 200 com o histórico de versões', async () => {
      const timeline = { automationId: 'auto-1', history: [] };
      useCases.listVersions.mockResolvedValue(timeline);
      const res = buildResponse();

      await controller.getVersions(buildRequest({ params: { id: 'auto-1' } }), res, next);

      expect(res.json).toHaveBeenCalledWith({ success: true, data: timeline });
    });

    it('encaminha erro para next()', async () => {
      const error = new Error('db down');
      useCases.listVersions.mockRejectedValue(error);
      const res = buildResponse();

      await controller.getVersions(buildRequest({ params: { id: 'auto-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('dryRunAutomation', () => {
    it('responde 404 quando a automação não pertence à organização', async () => {
      useCases.dryRun.mockResolvedValue(null);
      const res = buildResponse();

      await controller.dryRunAutomation(buildRequest({ params: { id: 'auto-x' } }), res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('extrai limit do body quando presente e ignora query', async () => {
      useCases.dryRun.mockResolvedValue({ automationId: 'auto-1' });
      const res = buildResponse();

      await controller.dryRunAutomation(
        buildRequest({ params: { id: 'auto-1' }, body: { limit: 10 }, query: { limit: '99' } }),
        res,
        next,
      );

      expect(useCases.dryRun).toHaveBeenCalledWith('org-1', 'auto-1', { limit: 10 });
    });

    it('cai para limit undefined quando nem body nem query trazem um número válido', async () => {
      useCases.dryRun.mockResolvedValue({ automationId: 'auto-1' });
      const res = buildResponse();

      await controller.dryRunAutomation(buildRequest({ params: { id: 'auto-1' } }), res, next);

      expect(useCases.dryRun).toHaveBeenCalledWith('org-1', 'auto-1', { limit: undefined });
    });

    it('encaminha erro para next()', async () => {
      const error = new Error('boom');
      useCases.dryRun.mockRejectedValue(error);
      const res = buildResponse();

      await controller.dryRunAutomation(buildRequest({ params: { id: 'auto-1' } }), res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
