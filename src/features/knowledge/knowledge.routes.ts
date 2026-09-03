import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import mammoth from 'mammoth';
// Onda 42 (CPI, DEC-10 opção A): suporte real a PDF. `pdf-parse` ainda não está no
// package.json/lockfile deste worktree — ver handoff
// `.agents/handoffs/onda-42/04-para-00-dependencias-parsing-pdf-docx.md` para o pacote exato e a
// justificativa. O import é estático de propósito (mesmo padrão do `mammoth` acima): assim que a
// dependência for instalada pelo dono do package.json, este arquivo compila sem outra mudança.
import pdfParse from 'pdf-parse';

import { ingestionService } from './ingestion.service.js';
import { searchService } from './search.service.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { logger } from '../../lib/logger.js';
import type { AuthRequest } from '../../shared/middlewares/authenticateToken.js';
import { requireRole } from '../../shared/middlewares/requireRole.js';
import { routeParam } from '../../shared/http/routeParams.js';
import { getAiModel } from '../../lib/ai/gateway.js';
import { HumanMessage } from '@langchain/core/messages';

const router = Router();
const writeRoles = requireRole(['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);

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

/**
 * Teto de páginas de PDF processadas por upload — defesa contra um PDF pequeno em bytes mas com
 * milhares de páginas (ex.: vetorial/gerado programaticamente), que consumiria CPU de forma
 * desproporcional ao tamanho do corpo aceito pelo `express.json` (ver MAX_CONTENT_CHARS e o
 * `JSON_BODY_LIMIT` em `src/config/env.ts`, hoje 2mb — já um teto apertado em bytes, mas não em
 * número de páginas). Mesmo espírito do `MAX_CHUNKS_PER_DOCUMENT` em `ingestion.service.ts`: corta
 * o excedente em vez de travar o processo.
 */
const MAX_PDF_PAGES = 500;

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
          code[1]?.toLowerCase() === 'x'
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
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
 * `.pdf` passa pelo pdf-parse; `.docx` passa pelo mammoth; `.html`/`.htm` tem as tags removidas;
 * formatos de texto são decodificados direto como UTF-8.
 *
 * Onda 42 (CPI, DEC-10 opção A): `.doc` (binário legado, pré-Office 2007) continua fora de escopo
 * — decisão deliberada, não limitação técnica esquecida. Parsers Node maduros para `.doc` binário
 * são raros e pesados (ex.: exigem `antiword`/LibreOffice via `child_process`, ou libs C++ nativas
 * empacotadas), o formato é incomum em uploads B2B modernos (a esmagadora maioria já é `.docx`), e
 * nenhuma dependência já presente no projeto resolve. Ver o handoff de dependências para o
 * raciocínio completo; se aparecer demanda real por `.doc`, é uma decisão nova, não uma correção
 * desta.
 */
export async function extractText(fileName: string, base64: string): Promise<string> {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length === 0) throw new Error('Arquivo vazio ou corrompido.');

  const ext = extensionOf(fileName);

  if (ext === '.pdf') {
    return extractPdfText(buffer);
  }

  if (ext === '.docx') {
    let value: string;
    try {
      ({ value } = await mammoth.extractRawText({ buffer }));
    } catch (err) {
      logger.error(
        { err, fileName },
        'Falha ao extrair texto de DOCX na ingestão da Base de Conhecimento',
      );
      throw new Error(
        'Não foi possível ler este .docx. O arquivo pode estar corrompido ou não ser um Word válido.',
      );
    }
    return value;
  }

  if (HTML_EXTENSIONS.includes(ext)) {
    return htmlToPlainText(buffer.toString('utf-8'));
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    return buffer.toString('utf-8');
  }

  // `.doc` (binário antigo) continua fora de escopo — ver o comentário do JSDoc acima.
  throw new Error(
    `Formato ${ext || 'desconhecido'} não suportado. Envie .txt, .md, .csv, .json, .html, .docx ou .pdf.`,
  );
}

/**
 * Extrai texto de um PDF via pdf-parse (pdf.js por baixo). Nunca devolve sucesso com texto vazio —
 * um PDF escaneado sem OCR é tratado como falha explícita, não como documento vazio válido, porque
 * um documento "ingerido com sucesso" mas sem nenhum trecho pesquisável engana o usuário que confia
 * na busca da Base de Conhecimento.
 */
async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse@1.x embute uma versão bem antiga do pdf.js (v1.10.100, de 2015/2016) que lê o
  // conteúdo errado (bytes de outro lugar do heap) quando recebe um `Buffer` do Node diretamente
  // — encontrado testando este código contra um PDF real de fixture, não é hipotético. Um
  // `Uint8Array` "puro" (não um `Buffer`, que sobrescreve `slice()` com semântica de view em vez
  // de cópia) evita o bug. `new Uint8Array(buffer)` copia os bytes para um array novo — barato
  // para os tamanhos de arquivo aceitos aqui (teto efetivo de poucos MB, ver JSON_BODY_LIMIT).
  // `@types/pdf-parse` tipa o parâmetro como `Buffer` (mais estrito do que o parser realmente
  // precisa — só indexa bytes, nunca chama método específico de `Buffer`), então o cast abaixo é
  // só para satisfazer o compilador; em runtime o valor passado é deliberadamente um
  // `Uint8Array` puro, não um `Buffer` (ver comentário acima).
  const bytes = new Uint8Array(buffer) as unknown as Buffer;

  let parsed: { text: string; numpages: number };
  try {
    parsed = await pdfParse(bytes, { max: MAX_PDF_PAGES });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;

    // pdf.js (usado internamente pelo pdf-parse) nomeia essas exceções — ver
    // https://github.com/mozilla/pdf.js/blob/master/src/shared/util.js.
    if (name === 'PasswordException') {
      throw new Error('Este PDF está protegido por senha. Remova a proteção e envie novamente.');
    }
    if (
      name === 'InvalidPDFException' ||
      name === 'MissingPDFException' ||
      name === 'UnexpectedResponseException'
    ) {
      throw new Error('Este PDF está corrompido ou não é um arquivo PDF válido.');
    }

    logger.error({ err }, 'Falha ao extrair texto de PDF na ingestão da Base de Conhecimento');
    throw new Error(
      'Não foi possível ler este PDF. Verifique se o arquivo não está corrompido ou protegido por senha.',
    );
  }

  if (parsed.numpages > MAX_PDF_PAGES) {
    logger.warn(
      { totalPages: parsed.numpages, kept: MAX_PDF_PAGES },
      'PDF excedeu o limite de páginas processadas na ingestão; o excedente foi descartado',
    );
  }

  const text = parsed.text ?? '';
  if (text.trim().length === 0) {
    // Cobre tanto o PDF puramente escaneado (imagem, zero texto selecionável) quanto o PDF
    // gerado só com desenhos vetoriais sem texto real.
    throw new Error(
      'Não foi possível extrair texto deste PDF — provavelmente é um documento escaneado (imagem) ' +
        'sem OCR. Esta base de conhecimento não faz reconhecimento óptico de caracteres; envie a ' +
        'versão com texto selecionável, ou cole o conteúdo manualmente.',
    );
  }

  return text;
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
    const document = await ingestionService.get(organizationId, routeParam(req.params.id, 'id'));
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
router.post(
  '/',
  writeRoles,
  validateRequest(ingestTextSchema),
  async (req: Request, res: Response, next: NextFunction) => {
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
  },
);

/** POST /api/knowledge/upload — ingestão a partir de arquivo (base64). */
router.post(
  '/upload',
  writeRoles,
  validateRequest(uploadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
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
        res
          .status(400)
          .json({ success: false, error: 'Não foi possível extrair texto do arquivo.' });
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
  },
);

/** POST /api/knowledge/search — busca híbrida. */
router.post(
  '/search',
  validateRequest(searchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { query, limit } = req.body as z.infer<typeof searchSchema>;

      const result = await searchService.hybridSearch(organizationId, query, limit);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT_CHARS).optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, {
    message: 'Informe ao menos título ou conteúdo.',
  });

/** PUT /api/knowledge/:id — edita o documento e reindexa se o conteúdo mudou. */
router.put(
  '/:id',
  writeRoles,
  validateRequest(updateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const result = await ingestionService.updateDocument(
        organizationId,
        routeParam(req.params.id, 'id'),
        req.body,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      if ((error as Error).message === 'Documento não encontrado.') {
        res.status(404).json({ success: false, error: (error as Error).message });
        return;
      }
      next(error);
    }
  },
);

/** POST /api/knowledge/:id/reembed — regera vetores que faltaram na ingestão. */
router.post('/:id/reembed', writeRoles, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { organizationId } = (req as AuthRequest).user;
    const result = await ingestionService.reembedDocument(
      organizationId,
      routeParam(req.params.id, 'id'),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/** DELETE /api/knowledge/:id */
router.delete(
  '/:id',
  requireRole(['ADMIN', 'GESTOR']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const documentId = routeParam(req.params.id, 'id');
      const removed = await ingestionService.delete(organizationId, documentId);
      if (!removed) {
        res.status(404).json({ success: false, error: 'Documento não encontrado.' });
        return;
      }
      logger.info({ documentId }, 'Documento removido da Base de Conhecimento');
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

const editorAssistSchema = z.object({
  action: z.enum(['expand', 'concise', 'pain']),
  text: z.string().trim().min(1),
});

/** POST /api/knowledge/editor-assist — assistente de redação IA */
router.post(
  '/editor-assist',
  writeRoles,
  validateRequest(editorAssistSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { action, text } = req.body as z.infer<typeof editorAssistSchema>;
      let prompt = '';
      if (action === 'expand') {
        prompt = `Expanda o seguinte argumento, deixando-o mais detalhado, persuasivo e rico em contexto para vendas:\n\n"${text}"`;
      } else if (action === 'concise') {
        prompt = `Reescreva o seguinte texto deixando-o mais conciso, direto e objetivo para comunicação rápida de vendas:\n\n"${text}"`;
      } else if (action === 'pain') {
        prompt = `Reescreva o seguinte texto focando nas DORES do cliente, usando a metodologia SPIN Selling (Situação, Problema, Implicação, Necessidade de solução):\n\n"${text}"`;
      }

      // Reescrita/paráfrase de um texto já fornecido pelo usuário — não exige o modelo de
      // raciocínio "grande" (LOCAL_MODEL), só transformação de texto. Chamada síncrona que
      // bloqueia a UI (usuário esperando no editor), então o modelo rápido reduz a latência
      // percebida sem perda de qualidade real nessa tarefa.
      const model = getAiModel('local-llama3-fast', 0.7, 'knowledge-editor');
      const aiResponse = await model.invoke([new HumanMessage(prompt)]);

      res.json({ success: true, result: aiResponse.content });
    } catch (error) {
      next(error);
    }
  },
);

const generateFaqSchema = z.object({
  documentId: z.string().uuid(),
});

/** POST /api/knowledge/generate-faq — gera FAQ a partir de um doc */
router.post(
  '/generate-faq',
  writeRoles,
  validateRequest(generateFaqSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { organizationId } = (req as AuthRequest).user;
      const { documentId } = req.body as z.infer<typeof generateFaqSchema>;

      const document = await ingestionService.get(organizationId, documentId);
      if (!document) {
        res.status(404).json({ success: false, error: 'Documento não encontrado.' });
        return;
      }

      // Mesmo raciocínio do editor-assist acima: extração de Q&A de um texto já fornecido,
      // chamada síncrona bloqueando a UI — modelo rápido, sem perda de qualidade real.
      const model = getAiModel('local-llama3-fast', 0.3, 'knowledge-faq');
      const prompt = `Você é um assistente criador de FAQs para time de vendas.
Baseado EXCLUSIVAMENTE no texto abaixo (extraído do documento "${document.title}"), gere um FAQ (Perguntas e Respostas Frequentes) cobrindo os pontos mais importantes, principais dúvidas, preços, requisitos ou features citadas.
Formate a resposta em Markdown claro, com "## Pergunta" e o texto da resposta abaixo.

Texto do Documento:
${document.content.substring(0, 15000)} // Limite de segurança de contexto
`;
      const aiResponse = await model.invoke([new HumanMessage(prompt)]);

      res.json({ success: true, result: aiResponse.content });
    } catch (error) {
      next(error);
    }
  },
);

export const knowledgeRoutes = router;
