import { Request, Response, NextFunction } from 'express';
import { AnalyticsUseCases, buildCohortCsv } from '../application/AnalyticsUseCases';
import { AuthRequest } from '../../../shared/middlewares/authenticateToken';

/** Limites do parâmetro `months` do dashboard. */
const MIN_MONTHS = 3;
const MAX_MONTHS = 24;
const DEFAULT_MONTHS = 6;

function parseMonths(raw: unknown): number {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MONTHS;
  return Math.min(Math.max(parsed, MIN_MONTHS), MAX_MONTHS);
}

export class AnalyticsController {
  constructor(private analyticsUseCases: AnalyticsUseCases) {}

  /**
   * Visão geral usada pelo LiveStatsWidget (home) e pelo ReportsHub (relatório executivo por IA).
   *
   * Esta rota devolvia números fictícios (7 empresas, R$ 450k de pipeline, 14,2% de conversão) sempre
   * que o banco estava vazio ou fora do ar, enquanto a UI anunciava "PostgreSQL Conectado". Isso saiu:
   * base vazia responde zero, e falha de banco responde erro de verdade. Um dashboard que inventa
   * número é pior do que um dashboard que não carrega.
   */
  getOverview = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.analyticsUseCases.overview(organizationId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /** Dashboard completo da tela de Analytics, numa única requisição. */
  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const data = await this.analyticsUseCases.dashboard(
        organizationId,
        parseMonths(req.query.months),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Cohort de conversão real (`AnalyticsUseCases.cohortAnalysis`), tenant-scoped. Antes desta
   * correção esta rota devolvia 3 linhas fixas no código-fonte ("Fake data just for the
   * prototype") para QUALQUER organização — nunca rastreável a um dado real, violando a regra
   * de "Dados reais x demonstração" do módulo. Também não usava `organizationId` nenhum, então
   * um número inventado idêntico teria vazado para todo tenant.
   */
  getCohort = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const cohorts = await this.analyticsUseCases.cohortAnalysis(organizationId);
      res.json({ success: true, data: { cohorts } });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Exporta o mesmo relatório de cohort em CSV real. Antes desta correção a rota respondia com
   * `Content-Type: application/pdf` e um buffer fixo (`PDF_FAKE_CONTENT_FOR_NOW`) que não é um
   * PDF válido — todo download produzia um arquivo corrompido. Sem biblioteca de geração de PDF
   * disponível no projeto (adicionar uma exige aprovação do Agente 00 em `package.json`, fora do
   * escopo desta auditoria), CSV é o formato honesto que já existe como padrão neste módulo (ver
   * `commercial-intelligence/application/executiveExport.ts` e o mesmo padrão de download em
   * `commercialIntelligence.api.ts` → `downloadExecutiveExport`). Conteúdo cru (não o envelope
   * `{success,data}`), igual ao padrão já usado por aquele outro export.
   */
  exportCohortCsv = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const cohorts = await this.analyticsUseCases.cohortAnalysis(organizationId);
      const csv = buildCohortCsv(cohorts);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-cohort.csv"');
      res.send(csv);
    } catch (error) {
      next(error);
    }
  };
}
