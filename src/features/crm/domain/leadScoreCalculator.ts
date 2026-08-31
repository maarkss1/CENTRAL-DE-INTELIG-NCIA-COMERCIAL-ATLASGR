export interface BantQualificationData {
  budget?: 'aprovado' | 'em_planejamento' | 'indefinido' | 'sem_verba' | string;
  authority?:
    | 'decisor_clevel'
    | 'influenciador_gerente'
    | 'usuario_operacional'
    | 'sem_autoridade'
    | string;
  need?:
    | 'critica_urgente'
    | 'moderada_otimizacao'
    | 'curiosidade_benchmarking'
    | 'sem_dor'
    | string;
  timing?: 'imediato_30d' | 'curto_60d' | 'medio_90d' | 'longo_prazo' | string;
  // Campos adicionais opcionais (SPIN / Telemetria)
  fleetSize?: number;
  telematicsProvider?: string;
  fuelCostPain?: boolean;
  theftRiskPain?: boolean;
}

export interface LeadScoreResult {
  score: number; // 0 a 100
  temperature: 'Quente' | 'Morno' | 'Frio';
  breakdown: {
    budgetScore: number; // 0 a 25
    authorityScore: number; // 0 a 25
    needScore: number; // 0 a 25
    timingScore: number; // 0 a 25
  };
  recommendation: string;
}

/**
 * Calcula determinística e auditavelmente o Lead Score (0 a 100) baseado no framework BANT/SPIN
 */
export function calculateLeadScore(data: BantQualificationData = {}): LeadScoreResult {
  let budgetScore = 0;
  let authorityScore = 0;
  let needScore = 0;
  let timingScore = 0;

  // 1. Budget (0 a 25)
  switch (data.budget) {
    case 'aprovado':
      budgetScore = 25;
      break;
    case 'em_planejamento':
      budgetScore = 15;
      break;
    case 'indefinido':
      budgetScore = 5;
      break;
    case 'sem_verba':
    default:
      budgetScore = 0;
      break;
  }

  // 2. Authority (0 a 25)
  switch (data.authority) {
    case 'decisor_clevel':
    case 'Decisor':
      authorityScore = 25;
      break;
    case 'influenciador_gerente':
    case 'Influenciador':
      authorityScore = 18;
      break;
    case 'usuario_operacional':
    case 'Usuário':
      authorityScore = 10;
      break;
    default:
      authorityScore = 0;
      break;
  }

  // 3. Need (0 a 25)
  switch (data.need) {
    case 'critica_urgente':
    case 'Alto':
      needScore = 25;
      break;
    case 'moderada_otimizacao':
    case 'Médio':
      needScore = 15;
      break;
    case 'curiosidade_benchmarking':
    case 'Baixo':
      needScore = 5;
      break;
    default:
      needScore = 0;
      break;
  }

  // Bônus se tiver dores específicas de diesel ou sinistro marcadas
  if (data.fuelCostPain || data.theftRiskPain) {
    needScore = Math.min(25, needScore + 5);
  }

  // 4. Timing (0 a 25)
  switch (data.timing) {
    case 'imediato_30d':
      timingScore = 25;
      break;
    case 'curto_60d':
      timingScore = 18;
      break;
    case 'medio_90d':
      timingScore = 10;
      break;
    case 'longo_prazo':
    default:
      timingScore = 0;
      break;
  }

  const totalScore = Math.min(
    100,
    Math.max(0, budgetScore + authorityScore + needScore + timingScore),
  );

  let temperature: 'Quente' | 'Morno' | 'Frio' = 'Frio';
  let recommendation = 'Qualificar dores e mapear decisor antes de avançar para proposta.';

  if (totalScore >= 70) {
    temperature = 'Quente';
    recommendation =
      'Alta propensão de fechamento! Agendar demonstração técnica ou enviar proposta comercial.';
  } else if (totalScore >= 40) {
    temperature = 'Morno';
    recommendation =
      'Lead qualificado com potencial. Aprofundar diagnóstico de ROI e validar orçamento.';
  }

  return {
    score: totalScore,
    temperature,
    breakdown: {
      budgetScore,
      authorityScore,
      needScore,
      timingScore,
    },
    recommendation,
  };
}
