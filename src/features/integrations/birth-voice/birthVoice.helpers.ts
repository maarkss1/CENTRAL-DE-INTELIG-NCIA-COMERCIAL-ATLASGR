import { createHmac, timingSafeEqual } from 'crypto';
import { toE164BR } from '../../../lib/phone.js';

/**
 * Lógica pura da integração do SDR de voz: sem env, sem prisma, sem rede.
 *
 * Separado do webhook de propósito — a verificação de assinatura é a parte crítica de segurança e
 * precisa ser testável sem abrir pool de banco nem depender de variáveis de ambiente válidas.
 */

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface CallEndedData {
  sessionId?: string;
  callSid?: string;
  direction?: string;
  to?: string | null;
  status?: string;
  outcome?: string;
  durationSeconds?: number;
  agentName?: string | null;
  transcript?: TranscriptTurn[];
  context?: Record<string, unknown>;
  /**
   * Sinal explícito de opt-out vindo do Hub. Hoje o Birth Voices Hub ainda não preenche este
   * campo — seu `outcome` é puramente telefônico (Concluído, Ocupado, Não atendida, Falha,
   * Cancelada), sem vocabulário para "o lead pediu para não ligar mais". O campo já é lido aqui
   * para que, quando o Hub passar a enviá-lo, ele tenha precedência sobre a heurística de
   * transcrição abaixo, sem precisar mexer neste lado.
   */
  optOut?: boolean;
}

/**
 * Frases com que uma pessoa recusa novas ligações. Sem acento e em minúsculas porque a comparação
 * roda sobre o texto já normalizado (ver `normalizeForMatch`).
 *
 * A lista é deliberadamente ampla: errar bloqueando alguém que não pediu custa uma oportunidade,
 * errar deixando passar custa ligar de novo para quem pediu explicitamente para não ser incomodado
 * — que é o dano que a LGPD e o bom senso comercial mandam evitar. Na dúvida, bloqueia.
 */
const OPT_OUT_PHRASES = [
  'nao me ligue',
  'nao me liguem',
  'nao liguem mais',
  'nao ligue mais',
  'nao ligar mais',
  'nao me liga mais',
  'para de ligar',
  'pare de ligar',
  'parem de ligar',
  'nao quero mais receber',
  'nao quero receber ligacao',
  'nao quero receber ligacoes',
  'me tire da lista',
  'me tira da lista',
  'me remova da lista',
  'me retire da lista',
  'tire meu numero',
  'tira meu numero',
  'remova meu numero',
  'excluir meu numero',
  'descadastrar',
  'nao entre mais em contato',
  'nao entrem mais em contato',
  'perdeu meu numero',
  'nunca mais me ligue',
  'nunca mais liguem',
];

/**
 * Tira acentos e pontuação para a comparação não depender de como o STT transcreveu.
 * "Não me ligue!" e "nao me ligue" precisam bater na mesma frase.
 */
function normalizeForMatch(text: string): string {
  return (
    text
      .normalize('NFD')
      // Faixa dos sinais diacríticos combinantes, escapada: NFD separa "ã" em "a" + til, e este
      // replace descarta o til. Escrito como \u.... porque os caracteres literais são invisíveis
      // no editor e viram lixo em qualquer diff.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Estado honesto do resultado de uma ligação, distinto por natureza — nunca colapsado em "erro" ou
 * "sucesso" genéricos.
 *
 * `voicemail` cobre a detecção de secretária eletrônica (AMD): o Hub hoje não expõe um campo
 * dedicado para isso no seu vocabulário de `outcome` (ver `CallEndedData.optOut` acima para o
 * mesmo tipo de lacuna documentada), então é inferido do texto quando o provedor não sinaliza
 * explicitamente — e tem prioridade sobre um `outcome` que diga "Concluído", porque uma secretária
 * eletrônica atendendo não é a mesma coisa que o decisor atendendo, mesmo que o provedor considere
 * a chamada "completa" do ponto de vista telefônico.
 */
export type CallOutcomeState =
  | 'completed'
  | 'voicemail'
  | 'no-answer'
  | 'busy'
  | 'invalid-number'
  | 'failed'
  | 'cancelled'
  | 'timeout'
  | 'unknown';

export interface CallOutcomeSignals {
  /** Texto de `outcome`/`status`/`disposition` do provedor, no vocabulário dele (PT ou EN). */
  providerOutcome?: string | null;
  /** Sinal explícito de secretária eletrônica, quando o provedor expõe (ex.: Bland `answered_by`). */
  machineDetected?: boolean | null;
  /** Duração em segundos — heurística de último recurso quando o provedor não classifica nada. */
  durationSeconds?: number | null;
  /** Transcrição ou resumo, para detectar voicemail/não-atendimento quando falta sinal explícito. */
  text?: string | null;
}

const VOICEMAIL_PHRASES = [
  'caixa postal',
  'secretaria eletronica',
  'deixe seu recado',
  'deixe uma mensagem',
  'apos o sinal',
  'deixe sua mensagem apos o bip',
];
const NO_ANSWER_PHRASES = [
  'nao atendeu',
  'sem resposta',
  'no answer',
  'not answered',
  'unanswered',
];
const INVALID_NUMBER_PHRASES = [
  'numero invalido',
  'numero inexistente',
  'invalid number',
  'disconnected number',
  'nao existe esse numero',
];
const BUSY_PHRASES = ['ocupado', 'busy', 'linha ocupada'];
const TIMEOUT_PHRASES = ['timeout', 'tempo esgotado', 'no-answer-timeout'];
const FAILED_PHRASES = ['falha', 'failed', 'failure', 'error', 'erro de rota'];
const CANCELLED_PHRASES = ['cancelada', 'cancelled', 'canceled'];
const COMPLETED_PHRASES = [
  'concluido',
  'concluida',
  'completed',
  'complete',
  'success',
  'answered',
];

/**
 * Classifica o resultado de uma ligação num estado distinto e honesto — a peça central de "nunca
 * marcar uma ligação como concluída/bem-sucedida sem confirmação real do provedor".
 *
 * Ordem de prioridade, do mais para o menos confiável — qualquer sinal NEGATIVO encontrado em
 * qualquer um dos passos abaixo já decide o resultado; só quando nenhum é encontrado é que a
 * duração entra como heurística positiva de último recurso:
 * 1. sinal explícito de secretária eletrônica (`machineDetected`) — nunca vira "completed", mesmo
 *    que o `outcome` do provedor diga o contrário;
 * 2. heurística de texto para voicemail — mesma razão: o provedor pode não distinguir isso no
 *    campo de outcome, mas a transcrição geralmente entrega;
 * 3. vocabulário textual de `outcome`/`status` do provedor, negativo antes de positivo;
 * 4. heurística de texto para não-atendimento/número inválido, quando o outcome não ajudou;
 * 5. `outcome` positivo explícito ("Concluído"/"completed"/...) — só depois de nenhum sinal
 *    negativo ter aparecido nos passos 1-4;
 * 6. duração: sem NENHUM sinal (nem negativo nem positivo) dos passos acima — o caso mais comum
 *    quando o provedor só manda `call_length`, sem campo de status dedicado (Bland) —, uma duração
 *    curta (<12s) é tratada como não-atendida, e uma duração substancial como conversa real. Isto
 *    é heurística, não confirmação; por isso todo sinal explícito acima tem prioridade.
 *
 * Só devolve "unknown" quando não há absolutamente nenhum sinal — nem outcome, nem texto, nem
 * duração — para classificar; nunca por omissão de um sinal positivo específico.
 */
export function classifyCallOutcome(signals: CallOutcomeSignals): CallOutcomeState {
  if (signals.machineDetected === true) return 'voicemail';

  const text = normalizeForMatch(signals.text ?? '');
  if (text && VOICEMAIL_PHRASES.some((phrase) => text.includes(phrase))) return 'voicemail';

  const outcome = normalizeForMatch(signals.providerOutcome ?? '');
  if (outcome) {
    if (BUSY_PHRASES.some((phrase) => outcome.includes(phrase))) return 'busy';
    if (TIMEOUT_PHRASES.some((phrase) => outcome.includes(phrase))) return 'timeout';
    if (INVALID_NUMBER_PHRASES.some((phrase) => outcome.includes(phrase))) return 'invalid-number';
    if (FAILED_PHRASES.some((phrase) => outcome.includes(phrase))) return 'failed';
    if (CANCELLED_PHRASES.some((phrase) => outcome.includes(phrase))) return 'cancelled';
    if (
      NO_ANSWER_PHRASES.some((phrase) => outcome.includes(phrase)) ||
      outcome.includes('nao atendida')
    ) {
      return 'no-answer';
    }
  }

  if (text) {
    if (NO_ANSWER_PHRASES.some((phrase) => text.includes(phrase))) return 'no-answer';
    if (INVALID_NUMBER_PHRASES.some((phrase) => text.includes(phrase))) return 'invalid-number';
  }

  if (outcome && COMPLETED_PHRASES.some((phrase) => outcome.includes(phrase))) return 'completed';

  if (typeof signals.durationSeconds === 'number') {
    // Curta (< 12s, o mesmo corte que a heurística anterior deste webhook já usava para "não
    // atendeu") e sem nenhum sinal positivo (nem outcome, nem texto) é, na prática, quase
    // sempre uma ligação que não conectou de verdade — nunca tratada como sucesso por omissão.
    if (signals.durationSeconds < 12) return 'no-answer';
    // Duração substancial sem qualquer sinal negativo encontrado acima (nenhuma phrase de
    // voicemail/não-atendimento/inválido/ocupado/falha/timeout/cancelamento bateu, e o provedor
    // não mandou um outcome textual de forma alguma) é o melhor sinal disponível de conversa
    // real — exatamente o caso da Bland hoje, que só manda `call_length` e texto livre, sem um
    // campo de status dedicado.
    return 'completed';
  }

  return 'unknown';
}

/** Só este estado representa uma conversa real com o decisor — todo o resto é honestamente "não". */
export function callResultedInConversation(outcome: CallOutcomeState): boolean {
  return outcome === 'completed';
}

export interface OptOutDetection {
  optOut: boolean;
  /** Como o opt-out foi identificado — vai para o campo `source` do bloqueio, para auditoria. */
  source: 'hub-flag' | 'transcript' | null;
  /** Trecho exato que motivou o bloqueio, para alguém conseguir revisar a decisão depois. */
  evidence: string | null;
}

/**
 * Decide se esta ligação terminou em pedido de opt-out.
 *
 * Só as falas do lead são examinadas: a IA pronuncia essas mesmas frases ao confirmar o pedido
 * ("entendi, não ligamos mais"), e considerar o turno dela faria toda ligação em que o assunto
 * aparece virar um bloqueio.
 */
export function detectOptOut(data: CallEndedData): OptOutDetection {
  if (data.optOut === true) {
    return { optOut: true, source: 'hub-flag', evidence: null };
  }

  for (const turn of data.transcript ?? []) {
    if (turn.role !== 'user') continue;
    const normalized = normalizeForMatch(turn.content ?? '');
    const matched = OPT_OUT_PHRASES.find((phrase) => normalized.includes(phrase));
    if (matched) {
      return { optOut: true, source: 'transcript', evidence: turn.content.trim().slice(0, 300) };
    }
  }

  return { optOut: false, source: null, evidence: null };
}

/**
 * Onda 7, item 2 — consentimento de gravação para a ponte ligações -> Copiloto Comercial IA (ver
 * `src/shared/contracts/copilotoVoiceIngestion.contract.ts`). O roteiro (`atlasProductPlaybook.ts`)
 * agora exige que a IA diga, nas duas primeiras frases de toda ligação, que é uma IA e que a
 * ligação pode ser gravada — estas listas de frases detectam isso (e uma eventual recusa do lead)
 * na transcrição, no mesmo espírito de `OPT_OUT_PHRASES`/`detectOptOut` acima: nunca inventa
 * consentimento por omissão, só confirma quando o texto realmente sustenta a conclusão.
 */
const AI_DISCLOSURE_PHRASES = [
  'assistente de inteligencia artificial',
  'sou uma inteligencia artificial',
  'sou uma assistente de ia',
  'atendente virtual de ia',
];
const RECORDING_DISCLOSURE_PHRASES = [
  'pode ser gravada',
  'esta sendo gravada',
  'ligacao gravada',
  'gravacao desta ligacao',
  'fins de qualidade e treinamento',
];
/** Recusa a SER GRAVADO/falar com uma IA — distinto do opt-out de "não me ligue mais"
 * (`OPT_OUT_PHRASES` acima), que é sobre ligações futuras, não sobre esta gravação específica. */
const RECORDING_DECLINE_PHRASES = [
  'nao quero ser gravado',
  'nao quero ser gravada',
  'nao autorizo gravacao',
  'nao autorizo a gravacao',
  'nao aceito ser gravado',
  'nao aceito ser gravada',
  'para de gravar',
  'pare de gravar',
  'desliga a gravacao',
  'desligue a gravacao',
  'nao quero que gravem',
  'nao quero ser gravado nessa ligacao',
];

export interface RecordingConsentDetection {
  /**
   * `GRANTED` só quando a IA fez a divulgação obrigatória (é uma IA + que a ligação pode ser
   * gravada) E o lead não recusou. `DECLINED` quando o lead recusou explicitamente, mesmo sem
   * divulgação prévia detectada (recusar já basta). `PENDING` em qualquer outro caso — inclusive
   * quando a divulgação não foi detectada no texto (falha de roteiro, transcrição incompleta) —
   * nunca fabricado como concedido só porque não houve recusa.
   */
  status: 'GRANTED' | 'DECLINED' | 'PENDING';
  evidence: string | null;
}

function classifyRecordingConsent(input: {
  assistantText: string;
  leadText: string;
}): RecordingConsentDetection {
  const leadNormalized = normalizeForMatch(input.leadText);
  const declineMatch = RECORDING_DECLINE_PHRASES.find((phrase) => leadNormalized.includes(phrase));
  if (declineMatch) {
    return { status: 'DECLINED', evidence: declineMatch };
  }

  const assistantNormalized = normalizeForMatch(input.assistantText);
  const hasAiDisclosure = AI_DISCLOSURE_PHRASES.some((phrase) =>
    assistantNormalized.includes(phrase),
  );
  const hasRecordingDisclosure = RECORDING_DISCLOSURE_PHRASES.some((phrase) =>
    assistantNormalized.includes(phrase),
  );
  if (hasAiDisclosure && hasRecordingDisclosure) {
    return { status: 'GRANTED', evidence: null };
  }

  return { status: 'PENDING', evidence: null };
}

/** Caminho do Birth Voices Hub — transcrição já segmentada por locutor (`CallEndedData.transcript`).
 * Só as falas do lead contam para recusa, só as da IA contam para a divulgação — mesmo raciocínio
 * de `detectOptOut` sobre por que só examinar o turno certo evita falso positivo. */
export function detectRecordingConsent(data: CallEndedData): RecordingConsentDetection {
  const turns = data.transcript ?? [];
  const leadText = turns
    .filter((turn) => turn.role === 'user')
    .map((turn) => turn.content)
    .join(' ');
  const assistantText = turns
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.content)
    .join(' ');
  return classifyRecordingConsent({ assistantText, leadText });
}

/** Caminho legado da Bland — `concatenated_transcript` é um bloco único sem locutor identificado.
 * Sem separação por locutor, tanto a recusa quanto a divulgação são procuradas no texto inteiro —
 * nunca mais permissivo que o caminho segmentado acima (uma recusa em qualquer trecho já nega). */
export function detectRecordingConsentFromRawTranscript(
  rawTranscript: string,
): RecordingConsentDetection {
  return classifyRecordingConsent({ assistantText: rawTranscript, leadText: rawTranscript });
}

/**
 * Confere a assinatura HMAC sobre os bytes crus recebidos.
 *
 * Precisa ser o corpo bruto: `JSON.parse` seguido de `JSON.stringify` pode reordenar chaves e
 * produzir uma string diferente da que foi assinada, e aí nenhuma assinatura legítima confere.
 */
export function isValidSignature(
  rawBody: Buffer,
  receivedSignature: string | undefined,
  secret: string,
): boolean {
  if (!receivedSignature) return false;

  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'), 'utf8');
  const received = Buffer.from(receivedSignature, 'utf8');

  // timingSafeEqual lança quando os tamanhos diferem, então o comprimento é comparado antes.
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Marcador que torna o registro idempotente — o Hub reentrega o evento até receber um 2xx. */
export function callMarker(callSid: string): string {
  return `[call:${callSid}]`;
}

export function buildObservations(data: CallEndedData): string {
  const outcome = data.outcome || data.status || 'Resultado desconhecido';
  const duration =
    typeof data.durationSeconds === 'number' ? `${data.durationSeconds}s` : 'duração desconhecida';
  // Estado classificado (ver classifyCallOutcome) ao lado do texto cru do provedor: o texto cru
  // fica para o humano que lê a nota, o estado classificado é o que o resto do sistema (status da
  // atividade, métricas) usa para decidir — os dois precisam estar visíveis juntos para uma
  // divergência entre eles (ex.: provedor diz "Concluído" mas o texto tinha "caixa postal") ser
  // auditável em vez de silenciosa.
  const classified = classifyCallOutcome({
    providerOutcome: data.outcome ?? data.status ?? null,
    durationSeconds: typeof data.durationSeconds === 'number' ? data.durationSeconds : null,
    text: (data.transcript ?? []).map((turn) => turn.content).join(' '),
  });
  const header = `Ligação do SDR de voz (${data.agentName || 'agente'}) — ${outcome} [estado: ${classified}], ${duration}.`;

  const transcript = (data.transcript ?? [])
    .map((turn) => `${turn.role === 'assistant' ? 'IA' : 'Lead'}: ${turn.content}`)
    .join('\n');

  // O marcador vai no fim para não poluir o começo do texto que o SDR lê na tela.
  return [header, transcript, callMarker(data.callSid || 'sem-id')].filter(Boolean).join('\n\n');
}

interface LeadContactish {
  name?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
}
interface LeadCompanyish {
  tradeName?: string | null;
  legalName?: string | null;
  phones?: string[] | null;
}

/**
 * Escolhe para qual número ligar. A ordem reflete quem atende: o telefone do contato mapeado é o
 * do decisor; o da empresa cai na recepção e raramente chega em quem decide.
 */
export function pickCallablePhone(
  contact: LeadContactish | null | undefined,
  company: LeadCompanyish | null | undefined,
): string | null {
  const candidates = [contact?.phone, contact?.whatsapp, ...(company?.phones ?? [])];
  for (const candidate of candidates) {
    const normalized = toE164BR(candidate);
    if (normalized) return normalized;
  }
  return null;
}
