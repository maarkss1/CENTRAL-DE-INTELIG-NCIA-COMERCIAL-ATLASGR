/**
 * Contrato de composição entre `src/features/copiloto-ia/` e `src/features/chatbook/` — mesmo
 * raciocínio de `bitrixWriteback.contract.ts`: é uma PORTA (padrão hexagonal), não um DTO
 * compartilhado. `copiloto-ia` depende só desta interface, nunca de
 * `chatbook/services/meeting-synthesis.service.ts` diretamente (proibido por
 * `.dependency-cruiser.cjs`, regra `no-cross-feature-imports`).
 *
 * A implementação real (`MeetingSynthesisService`, dono: feature `chatbook`) é instanciada e
 * injetada na composição root do worker (`worker.ts`/`src/bootstrap/workers.ts`) — os únicos
 * pontos do repositório com licença de importar as duas features ao mesmo tempo, pelo mesmo motivo
 * de `src/shared/di/setup.ts` ser a exceção da regra equivalente `no-shared-to-features`.
 */
export interface MeetingTranscriptInput {
  meetingTitle: string;
  participants: string[];
  rawTranscript: string;
  dealName?: string;
}

export interface MeetingActionItem {
  assignee: string;
  description: string;
  deadlineDays?: number;
}

export interface MeetingSynthesisOutput {
  executiveSummary: string;
  keyPainsIdentified: string[];
  agreedPoints: string[];
  unresolvedObjections: string[];
  actionItems: MeetingActionItem[];
  dealStageRecommendation?: string;
  sentimentScore: 'Muito Positivo' | 'Positivo' | 'Neutro / Cauteloso' | 'Negativo';
}

export interface MeetingSynthesisPort {
  synthesizeMeeting(input: MeetingTranscriptInput): Promise<MeetingSynthesisOutput>;
}
