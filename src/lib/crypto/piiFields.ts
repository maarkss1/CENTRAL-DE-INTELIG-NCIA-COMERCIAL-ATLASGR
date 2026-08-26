import { encryptField, decryptField } from './secretFields.js';

// Criptografia de campos sensíveis (credenciais de integração E PII de Contact) em repouso —
// mesmo mecanismo AES-256-GCM de secretFields.ts, aplicado de forma transparente pela extensão do
// Prisma Client em src/lib/prisma.ts ($allOperations). Esta config foi extraída para um módulo
// próprio, sem nenhuma dependência de `@prisma/client`/`pg`, justamente para poder ser testada em
// unidade sem precisar importar prisma.ts inteiro (que cria um `Pool` do `pg` no top-level do
// módulo e falharia/travaria em ambiente sem Postgres real).
//
// CPI — item "PII de lead/contato não cifrada em repouso": até esta mudança, só credenciais de
// integração (GoogleWorkspaceConnection/BitrixConnection/ThreeCXConnection/Account) eram cifradas
// em repouso — nome/telefone/e-mail/linkedin/observações de Contact ficavam em texto puro,
// protegidos só por RLS de tenant (isolamento entre organizações, não proteção do dado em si caso
// o banco/backup vaze). Contact é o único model do schema com PII direta de pessoa física — Lead
// não tem colunas próprias de nome/telefone/e-mail (relaciona-se a Contact via `contactId`).
//
// Campo NÃO incluído aqui: `Contact.birthDate` (`DateTime?` no schema). Este mecanismo só sabe
// cifrar campos `String` (o ciphertext base64 precisa caber no mesmo tipo de coluna, sem migração
// de schema — é exatamente o requisito desta mudança). Cifrar uma data exigiria mudar a coluna
// para `String`/`Text` (migração de schema + backfill de dado existente), fora do escopo aditivo
// desta rodada. Registrado como gap conhecido, não escondido: ver comentário de handoff no fim
// deste arquivo e o relatório da tarefa.
export const ENCRYPTED_MODEL_FIELDS: Record<string, readonly string[]> = {
  GoogleWorkspaceConnection: ['accessToken', 'refreshToken'],
  BitrixConnection: ['webhookUrl', 'webhookSecret'],
  // Credencial de PABX 3CX (Call Control API) — mesmo tratamento das duas linhas acima. Ver
  // .agents/handoffs/onda-5/01-para-06-persistencia-3cx-implementada.md.
  ThreeCXConnection: ['apiKey', 'apiSecret'],
  // Tokens OAuth de login social (Google/Microsoft via Better Auth, gravados por
  // prismaAdapter em src/lib/auth.ts) — mesma classe de credencial de terceiro das linhas
  // acima. Ver .agents/handoffs/roadmap-v2-onda-1/01-para-00-account-oauth-tokens-sem-cifra.md.
  Account: ['accessToken', 'refreshToken', 'idToken'],
  // PII de pessoa física do lead/contato (CPI — item 1, onda atual do Agente 01). `birthDate`
  // fica de fora por ser `DateTime?`, não `String` — ver comentário acima.
  //
  // ATENÇÃO — handoff para o time de CRM/Prospecção (04/05): cifrar estes campos com AES-256-GCM
  // (IV aleatório por valor, ver secretFields.ts) quebra silenciosamente qualquer busca por
  // IGUALDADE ou SUBSTRING feita pelo Postgres diretamente nestas colunas, porque o mesmo texto
  // puro nunca produz o mesmo ciphertext duas vezes. Usos reais já identificados no código nesta
  // auditoria que PARAM DE FUNCIONAR (sem erro, silenciosamente) assim que esta mudança entra em
  // produção:
  //   - `ContactService.findAll` / `PrismaContactRepository.findAllWithFilters`
  //     (src/features/contacts/services/contact.service.ts,
  //     src/features/contacts/infra/PrismaContactRepository.ts): busca por `contains` em
  //     name/email/phone/whatsapp — a busca textual da tela de Contatos deixa de encontrar
  //     qualquer contato por esses campos (continua funcionando por `role`/`department`, que não
  //     são cifrados, e pela empresa vinculada).
  //   - `deduplication.worker.ts` (src/features/crm/jobs/deduplication.worker.ts): `groupBy(by:
  //     ['email'|'phone'])` para achar duplicatas — cada ciphertext é único mesmo para o mesmo
  //     e-mail/telefone, então a rotina semanal de deduplicação nunca mais encontra duplicata
  //     nenhuma (reporta sempre ~0, não é um erro visível).
  // NÃO quebra (verificado): o dedupe em memória de `contactDedupe.ts`
  // (filterNewContacts/normalizeEmailForDedupe) usado por `enrichment.service.ts` continua
  // funcionando normalmente — ele recebe os registros já decifrados pela extensão do Prisma
  // (`decryptSensitiveResult`) e compara texto puro em JS, nunca no SQL.
  // Resolver isso (ex.: índice determinístico HMAC-SHA256 separado para igualdade exata, ou busca
  // full-text/trigram sobre uma cópia decifrada) é decisão de produto/arquitetura de busca fora do
  // escopo desta mudança (cifrar em repouso) — não resolvido aqui de propósito, só documentado.
  Contact: ['name', 'phone', 'whatsapp', 'email', 'linkedin', 'observations'],
};

export function encryptSensitiveFields(
  model: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const fields = ENCRYPTED_MODEL_FIELDS[model];
  if (!fields) return data;
  const out = { ...data };
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = encryptField(out[field] as string);
    }
  }
  return out;
}

export function decryptSensitiveRecord<T>(model: string, record: T): T {
  const fields = ENCRYPTED_MODEL_FIELDS[model];
  if (!fields || !record || typeof record !== 'object') return record;
  const out = record as Record<string, unknown>;
  for (const field of fields) {
    if (typeof out[field] === 'string' && out[field]) {
      out[field] = decryptField(out[field] as string);
    }
  }
  return out as T;
}

export function decryptSensitiveResult<T>(model: string, result: T): T {
  if (!ENCRYPTED_MODEL_FIELDS[model] || !result) return result;
  if (Array.isArray(result)) {
    return result.map((item) => decryptSensitiveRecord(model, item)) as unknown as T;
  }
  return decryptSensitiveRecord(model, result);
}
