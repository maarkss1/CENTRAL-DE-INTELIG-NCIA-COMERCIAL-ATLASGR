import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import mammoth from 'mammoth';

import { ingestionService } from './ingestion.service.js';
import { searchService } from './search.service.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { logger } from '../../lib/logger.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'VENDEDOR']);

/**
 * Teto de tamanho do texto de um documento. O `express.json` já limita o corpo a 10mb; este limite
 * é sobre o texto extraído, que é o que de fato vira embedding (e custo).
 */
const MAX_CONTENT_CHARS = 400_000;

const ingestTextSchema = z.object({
    title: z.string().trim().min(1, 'Informe um título').max(200),
    content: z.string().trim().min(1, 'O conteúdo não pode ser vazio').max(MAX_CONTENT_CHARS),
});

const uploadSchema = z.object({
    /** Nome original do arquivo — usado para inferir o formato e exibir na listagem. */
    fileName: z.string().trim().min(1).max(255),
    /** Conteúdo em base64. O frontend lê o arquivo com FileReader e envia assim. */
    data: z.string().min(1),
    title: z.string().trim().max(200).optional(),
});

const searchSchema = z.object({
    query: z.string().trim().min(2, 'Busque por pelo menos 2 caracteres').max(500),
    limit: z.number().int().min(1).max(25).optional(),
});

/** Extensões que sabemos transformar em texto puro. */
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json'];
const HTML_EXTENSIONS = ['.html', '.htm'];

function extensionOf(fileName: string): string {
    const dot = fileName.lastIndexOf('.');
    return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

const HTML_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
};

/**
 * Extrai o texto visível de um HTML, descartando script/style/comentários e tags.
 * Não é um sanitizador de segurança (o resultado nunca é re-renderizado como HTML) — serve só
 * para não indexar markup/JS/CSS junto do conteúdo na busca semântica.
 */
function htmlToPlainText(html: string): string {
    return html
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|li|tr|h[1-6]|br)\s*>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
            if (code[0] === '#') {
                const codePoint =
                    code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
                return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
            }
            return HTML_ENTITIES[code.toLowerCase()] ?? match;
        })
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .trim();
}

/**
 * Converte o arquivo enviado em texto.
 * `.docx` passa pelo mammoth; `.html`/`.htm` tem as tags removidas; formatos de texto são
 * decodificados direto como UTF-8.
 */
async function extractText(fileName: string, base64: string): Promise<string> {
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) throw new Error('Arquivo vazio ou corrompido.');

    const ext = extensionOf(fileName);

    if (ext === '.docx') {
        const { value } = await mammoth.extractRawText({ buffer });
        return value;
    }

    if (HTML_EXTENSIONS.includes(ext)) {
        return htmlToPlainText(buffer.toString('utf-8'));
    }

    if (TEXT_EXTENSIONS.includes(ext)) {
        return buffer.toString('utf-8');
    }

    // `.doc` (binário antigo) e `.pdf` exigem dependências que o projeto não tem hoje; recusamos
    // explicitamente em vez de gravar um documento com texto ilegível.
    throw new Error(
        `Formato ${ext || 'desconhecido'} não suportado. Envie .txt, .md, .csv, .json, .html ou .docx.`,
    );
}

/** GET /api/knowledge — lista os documentos do tenant. */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const documents = await ingestionService.list(organizationId);
        res.json({ success: true, data: documents });
    } catch (error) {
        next(error);
    }
});

/** GET /api/knowledge/:id — documento completo, com o conteúdo. */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const document = await ingestionService.get(organizationId, req.params.id);
        if (!document) {
            res.status(404).json({ success: false, error: 'Documento não encontrado.' });
            return;
        }
        res.json({ success: true, data: document });
    } catch (error) {
        next(error);
    }
});

/** POST /api/knowledge — ingestão de texto colado. */
router.post('/', writeRoles, validateRequest(ingestTextSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const { title, content } = req.body as z.infer<typeof ingestTextSchema>;

        const result = await ingestionService.ingestText({
            organizationId,
            title,
            content,
            sourceType: 'text',
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/** POST /api/knowledge/upload — ingestão a partir de arquivo (base64). */
router.post('/upload', writeRoles, validateRequest(uploadSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId, id: userId } = (req as AuthRequest).user;
        const { fileName, data, title } = req.body as z.infer<typeof uploadSchema>;

        let content: string;
        try {
            content = await extractText(fileName, data);
        } catch (err) {
            // Erro de formato é culpa do envio, não do servidor: responde 400 em vez de 500.
            res.status(400).json({ success: false, error: (err as Error).message });
            return;
        }

        if (content.trim().length === 0) {
            res.status(400).json({ success: false, error: 'Não foi possível extrair texto do arquivo.' });
            return;
        }
        if (content.length > MAX_CONTENT_CHARS) {
            res.status(400).json({
                success: false,
                error: `O arquivo tem ${content.length} caracteres e o limite é ${MAX_CONTENT_CHARS}.`,
            });
            return;
        }

        const result = await ingestionService.ingestText({
            organizationId,
            title: title?.trim() || fileName.replace(/\.[^.]+$/, ''),
            content,
            sourceType: 'file',
            sourceName: fileName,
            createdBy: userId,
        });

        res.status(201).json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/** POST /api/knowledge/search — busca híbrida. */
router.post('/search', validateRequest(searchSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const { query, limit } = req.body as z.infer<typeof searchSchema>;

        const result = await searchService.hybridSearch(organizationId, query, limit);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

const updateSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT_CHARS).optional(),
}).refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'Informe ao menos título ou conteúdo.',
});

/** PUT /api/knowledge/:id — edita o documento e reindexa se o conteúdo mudou. */
router.put('/:id', writeRoles, validateRequest(updateSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await ingestionService.updateDocument(organizationId, req.params.id, req.body);
        res.json({ success: true, data: result });
    } catch (error) {
        if ((error as Error).message === 'Documento não encontrado.') {
            res.status(404).json({ success: false, error: (error as Error).message });
            return;
        }
        next(error);
    }
});

/** POST /api/knowledge/:id/reembed — regera vetores que faltaram na ingestão. */
router.post('/:id/reembed', writeRoles, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const result = await ingestionService.reembedDocument(organizationId, req.params.id);
        res.json({ success: true, data: result });
    } catch (error) {
        next(error);
    }
});

/** DELETE /api/knowledge/:id */
router.delete('/:id', requireRole(['ADMIN', 'GESTOR']), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { organizationId } = (req as AuthRequest).user;
        const removed = await ingestionService.delete(organizationId, req.params.id);
        if (!removed) {
            res.status(404).json({ success: false, error: 'Documento não encontrado.' });
            return;
        }
        logger.info({ documentId: req.params.id }, 'Documento removido da Base de Conhecimento');
        res.status(204).send();
    } catch (error) {
        next(error);
    }
});

export const knowledgeRoutes = router;
