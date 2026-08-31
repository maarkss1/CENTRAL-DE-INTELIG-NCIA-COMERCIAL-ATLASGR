/**
 * Classificação de papel no buying committee (D.3 do audit da Fase 0 —
 * `.agents/runs/ldr-fase-0-auditoria.md`) a partir de dado real já persistido em `Contact`
 * (cargo/senioridade/departamento vindos do CRM ou de enriquecimento Apollo/Hunter — ver
 * `Contact.seniority`, valores documentados em `prisma/schema.prisma`: "c_suite", "vp",
 * "director", "manager"). Reusa a MESMA taxonomia de `buyingRole` já usada em
 * `src/features/contacts/services/decision-committee.service.ts`/`Account360.tsx`, para não criar
 * um segundo vocabulário de papel de compra no produto.
 *
 * Determinístico de propósito (sem chamada a IA): D.3 é gerado em lote por um worker recorrente
 * (ver `accountIntelligenceInsights.worker.ts`), potencialmente para muitas contas por tick —
 * classificar via LLM aqui multiplicaria custo/latência de IA sem necessidade, quando
 * cargo/senioridade já bastam para uma heurística honesta v1. Nunca inventa papel: sem
 * cargo/senioridade reconhecível, `classifyBuyingRole` devolve `null` — o chamador não cria
 * `DecisionMaker` nenhum para esse contato, em vez de forçar uma classificação sem base.
 */

export type BuyingRole =
  | 'Decisor Econômico'
  | 'Decisor Operacional'
  | 'Influenciador Técnico'
  | 'Usuário Final';

export interface DecisionMakerClassificationInput {
  role: string | null;
  seniority: string | null;
  department: string | null;
}

export interface DecisionMakerClassification {
  buyingRole: BuyingRole;
  confidence: number;
  reason: string;
}

const TECHNICAL_ROLE_PATTERN =
  /\b(ti|tecnologia|engenh|desenvolv|sistemas|infraestrutura|seguran[çc]a)\b/i;
const OPERATIONAL_ROLE_PATTERN =
  /\b(log[íi]stica|opera[çc]|frota|frotas|transporte|manuten[çc][ãa]o)\b/i;

export function classifyBuyingRole(
  input: DecisionMakerClassificationInput,
): DecisionMakerClassification | null {
  const seniority = input.seniority?.toLowerCase().trim() || null;
  const role = input.role?.trim() || null;
  const department = input.department?.trim() || null;

  if (seniority === 'c_suite' || seniority === 'owner' || seniority === 'founder') {
    return {
      buyingRole: 'Decisor Econômico',
      confidence: 0.75,
      reason: `Senioridade "${seniority}" registrada no contato indica decisor econômico.`,
    };
  }

  const combinedText = [role, department].filter(Boolean).join(' ');
  if (!combinedText && !seniority) return null;

  if (seniority === 'vp' || seniority === 'director') {
    if (TECHNICAL_ROLE_PATTERN.test(combinedText)) {
      return {
        buyingRole: 'Influenciador Técnico',
        confidence: 0.65,
        reason: `Senioridade "${seniority}" com cargo/departamento técnico ("${combinedText}").`,
      };
    }
    return {
      buyingRole: 'Decisor Operacional',
      confidence: 0.65,
      reason: `Senioridade "${seniority}" registrada no contato indica decisor operacional.`,
    };
  }

  if (TECHNICAL_ROLE_PATTERN.test(combinedText)) {
    return {
      buyingRole: 'Influenciador Técnico',
      confidence: 0.5,
      reason: `Cargo/departamento técnico ("${combinedText}") sem senioridade executiva registrada.`,
    };
  }

  if (seniority === 'manager' || OPERATIONAL_ROLE_PATTERN.test(combinedText)) {
    return {
      buyingRole: 'Decisor Operacional',
      confidence: 0.45,
      reason:
        seniority === 'manager'
          ? 'Senioridade "manager" registrada no contato.'
          : `Cargo/departamento operacional ("${combinedText}").`,
    };
  }

  if (combinedText) {
    return {
      buyingRole: 'Usuário Final',
      confidence: 0.3,
      reason: `Cargo/departamento registrado ("${combinedText}") sem sinal de senioridade decisória.`,
    };
  }

  return null;
}
