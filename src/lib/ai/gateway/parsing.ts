/**
 * Parsing puro do gateway de IA: conversão de mensagens LangChain → formato Chat Completions na
 * ida, e extração de JSON estruturado do texto de resposta na volta. Nenhuma chamada de rede,
 * nenhum estado — só transformação de dados, testável sem mocks.
 */
import type { BaseMessage } from '@langchain/core/messages';
import type { ChatCompletionMessage } from './types.js';

const MAX_MESSAGES_PER_REQUEST = 100;
const MAX_TOTAL_MESSAGE_CHARS = 200_000;

function messageContentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (content === null || content === undefined) return '';
  if (!Array.isArray(content)) return JSON.stringify(content) || String(content);

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (
        typeof part === 'object' &&
        part !== null &&
        'text' in part &&
        typeof part.text === 'string'
      ) {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .join('\n');
}

function readMessageType(message: BaseMessage): string {
  if (typeof message.getType === 'function') return message.getType();
  if (typeof message._getType === 'function') return message._getType();
  return 'human';
}

/**
 * Converte mensagens LangChain sem perder a hierarquia de instruções.
 * Resultados de ferramentas são apresentados como contexto do usuário porque este
 * gateway mínimo não transporta tool_call_id.
 */
export function toChatCompletionMessages(messages: BaseMessage[]): ChatCompletionMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('A solicitação de IA precisa conter ao menos uma mensagem.');
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    throw new Error(
      `A solicitação de IA excede o limite de ${MAX_MESSAGES_PER_REQUEST} mensagens.`,
    );
  }

  let totalChars = 0;
  const converted = messages.map((message): ChatCompletionMessage => {
    const content = messageContentToText(message.content).trim();
    totalChars += content.length;
    const type = readMessageType(message);

    if (type === 'system') return { role: 'system', content };
    if (type === 'ai' || type === 'assistant') return { role: 'assistant', content };
    if (type === 'tool' || type === 'function') {
      return { role: 'user', content: `[Resultado de ferramenta]\n${content}` };
    }
    return { role: 'user', content };
  });

  if (totalChars === 0) {
    throw new Error('A solicitação de IA não pode conter apenas mensagens vazias.');
  }
  if (totalChars > MAX_TOTAL_MESSAGE_CHARS) {
    throw new Error(
      `A solicitação de IA excede o limite de ${MAX_TOTAL_MESSAGE_CHARS} caracteres.`,
    );
  }

  return converted;
}

/**
 * Extrai e converte respostas JSON retornadas por modelos de IA,
 * removendo blocos de código Markdown (```json ... ```) e caracteres excedentes.
 */
export function cleanAndParseJson<T>(content: string): T {
  if (!content || typeof content !== 'string') {
    throw new Error('Conteúdo para parse JSON está vazio ou é inválido.');
  }

  let cleaned = content.trim();
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  const firstBrace = cleaned.search(/[{[]/);
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    throw new Error(
      `Falha ao decodificar JSON gerado pela IA: ${(err as Error).message}. Conteúdo original: ${content.slice(0, 200)}...`,
    );
  }
}
