import { Router, Request, Response, NextFunction } from 'express';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../../config/env.js';
import { prisma } from '../../../lib/prisma.js';

const router = Router();

// Inicializa SDK do Gemini GenAI
// Fallback para mock caso não tenha API_KEY configurada
const isMock = !env.GEMINI_API_KEY;

router.post('/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { message } = req.body;
        
        if (!message) {
            res.status(400).json({ success: false, error: 'Mensagem vazia' });
            return;
        }

        // Mock mode (simulando delay e resposta inteligente)
        if (isMock) {
            await new Promise(r => setTimeout(r, 1500));
            const msgLower = message.toLowerCase();
            let reply = "Como Copiloto IA, estou pronto para otimizar suas vendas!";
            
            if (msgLower.includes('leads') || msgLower.includes('quem')) {
                reply = "Eu analisei sua base. Você tem novos leads quentes no setor de Tecnologia. Gostaria que eu preparasse e-mails automáticos para eles?";
            } else if (msgLower.includes('quebra-gelo') || msgLower.includes('email')) {
                reply = "Claro! Que tal: 'Olá [Nome], vi que a [Empresa] está expandindo. Nossa solução reduz custos operacionais em 30%. Faz sentido conversarmos?'";
            }

            res.json({ success: true, reply });
            return;
        }

        // Real Google GenAI Integration
        const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Você é um Copiloto de Vendas B2B do AtlasGR. Seja direto, focado em conversão e cordial. Usuário: ${message}`
        });

        res.json({ success: true, reply: response.text });
    } catch (error) {
        next(error);
    }
});

router.post('/groq', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { message } = req.body;
        // Mock Llama 3 logic for internal knowledge
        await new Promise(r => setTimeout(r, 800));
        res.json({ success: true, reply: `(Base Interna) Sobre "${message}": Conforme nossos playbooks, a abordagem ideal foca no ROI de 30% em 6 meses.` });
    } catch (error) {
        next(error);
    }
});

router.post('/roleplay', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { message } = req.body;
        await new Promise(r => setTimeout(r, 1000));
        res.json({ success: true, reply: `(Lead) Entendi seu pitch: "${message}". Mas achei caro e já usamos um concorrente. Como você me convence?` });
    } catch (error) {
        next(error);
    }
});

router.post('/qualification', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await new Promise(r => setTimeout(r, 1200));
        res.json({ success: true, reply: `\`\`\`json\n{\n  "BANT": {\n    "Budget": "Pendente",\n    "Authority": "Identificada",\n    "Need": "Redução de turnover",\n    "Timeline": "Q4"\n  }\n}\n\`\`\`` });
    } catch (error) {
        next(error);
    }
});

export const agentRoutes = router;
