import { Router, Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../../../shared/middlewares/authenticateToken.js';
import { sendEmail, MailerNotConfiguredError } from '../../../lib/email/mailer.js';
import { logger } from '../../../lib/logger.js';

const router = Router();

// Disparado pelo próprio usuário (ChangePasswordGate.tsx) logo após trocar com sucesso a senha
// temporária/padrão — não requer ADMIN, qualquer usuário autenticado pode chamar para si mesmo.
// Best-effort de propósito: a troca de senha já aconteceu e o usuário já está liberado a entrar
// no app quando isto roda, então uma falha de e-mail (SMTP não configurado, provedor fora do ar)
// nunca pode bloquear ou reverter esse acesso — só registramos e respondemos sucesso do mesmo jeito.
router.post('/welcome-email', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const user = (req as AuthRequest).user;
        try {
            await sendEmail({
                to: user.email,
                subject: 'Bem-vindo(a) ao Prospector Atlas',
                text: [
                    `Olá,`,
                    '',
                    'Sua senha foi trocada com sucesso e sua conta no Prospector Atlas — Central de Inteligência Comercial AtlasGR/Total Trac — já está pronta para uso.',
                    '',
                    'Com ela você tem acesso a prospecção, pipeline de vendas, roleplay de vendas com IA e automações comerciais, de acordo com o papel atribuído à sua conta.',
                    '',
                    'Se você não reconhece esta conta ou não trocou sua senha agora, avise um administrador imediatamente.',
                    '',
                    'Bom trabalho!',
                    'Equipe AtlasGR / Total Trac',
                ].join('\n'),
            });
        } catch (error) {
            if (error instanceof MailerNotConfiguredError) {
                logger.warn({ email: user.email }, 'E-mail de boas-vindas não enviado — SMTP_HOST não configurado.');
            } else {
                logger.error({ err: error, email: user.email }, 'Falha ao enviar e-mail de boas-vindas.');
            }
        }
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

export const authExtraRoutes = router;
