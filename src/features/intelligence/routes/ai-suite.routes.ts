import { Router, Request, Response, NextFunction } from 'express';
import { aiSuite } from '../services/CentralAISuiteService.js';

export const aiSuiteRouter = Router();

// Endpoint de Inventário dos 20 recursos de IA
aiSuiteRouter.get('/inventory', (_req: Request, res: Response) => {
    res.json({ success: true, data: aiSuite.getCapabilitiesInventory() });
});

// #6 Mapeamento de Comitê de Decisores
aiSuiteRouter.post('/decision-committee', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { contacts, companyContext } = req.body;
        const result = await aiSuite.decisionCommittee.mapCommittee(contacts || [], companyContext);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #7 Higienização Bitrix
aiSuiteRouter.post('/bitrix-hygiene', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.bitrixHygiene.sanitizeLeadData(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #8 Cadência Dinâmica
aiSuiteRouter.post('/cadence-step', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.cadenceAI.generateNextStep(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #9 Roleplay Turno e Avaliação
aiSuiteRouter.post('/roleplay/turn', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.roleplayAI.simulateCustomerResponse(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

aiSuiteRouter.post('/roleplay/evaluate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { persona, history } = req.body;
        const result = await aiSuite.roleplayAI.evaluateSession(persona, history || []);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #10 Geração de Proposta Comercial
aiSuiteRouter.post('/proposal/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.proposalAI.generateProposalSections(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #11 Next Best Action
aiSuiteRouter.post('/next-best-action', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.nextBestAction.determineNextAction(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #13 Churn Prediction
aiSuiteRouter.post('/churn/predict', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.churnPrediction.analyzeChurnRisk(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #14 Smart Lead Router
aiSuiteRouter.post('/lead-router/match', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { lead, reps } = req.body;
        const result = await aiSuite.leadRouter.matchLeadToRep(lead, reps || []);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #15 Knowledge Copilot
aiSuiteRouter.post('/knowledge/copilot', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.knowledgeCopilot.answerTechnicalQuestion(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #16 Meeting Synthesis
aiSuiteRouter.post('/meeting/synthesize', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.meetingSynthesis.synthesizeMeeting(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #17 Mesa de Tratamento Triage
aiSuiteRouter.post('/mesa/triage', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.mesaTriage.triageIncident(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #18 Seller Coaching
aiSuiteRouter.post('/coaching/report', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.sellerCoaching.generateCoachingReport(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #19 Playbook Generator
aiSuiteRouter.post('/playbook/generate-chapter', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.playbookAI.generatePlaybookChapter(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});

// #20 LGPD Sanitizer
aiSuiteRouter.post('/lgpd/sanitize', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = await aiSuite.lgpdSanitizer.sanitizeText(req.body);
        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
});
