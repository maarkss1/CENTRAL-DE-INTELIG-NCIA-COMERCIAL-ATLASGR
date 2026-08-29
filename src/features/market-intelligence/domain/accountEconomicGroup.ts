/**
 * Camada 1 (relações determinísticas e verificáveis) do grupo econômico — D.4 do audit da Fase 0
 * (`.agents/runs/ldr-fase-0-auditoria.md`). Segue a definição de Camada 1 do pacote original do
 * LDR: matriz/filial via CNPJ básico (raiz de 8 dígitos). Nunca produz Camada 3 (inferência) — só
 * relação matematicamente derivável do próprio CNPJ, por isso `confidence` é sempre 1 e
 * `status` é sempre `Verified`.
 *
 * CNPJ não tem formato consistente no banco hoje (dígitos crus, pontuado, ou misto — ver DEC-16 do
 * dossiê da Onda 42, `prospecting.service.ts`): normaliza para dígitos antes de comparar a raiz, e
 * ignora qualquer CNPJ que não tenha exatamente 14 dígitos após normalizar (não adivinha raiz de
 * um CNPJ malformado).
 */

export interface EconomicGroupCompanyInput {
  id: string;
  cnpj: string | null;
}

export interface EconomicGroupMatch {
  sourceCompanyId: string;
  targetCompanyId: string;
  cnpjRoot: string;
}

export function normalizeCnpjDigits(cnpj: string | null | undefined): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, '');
  return digits.length === 14 ? digits : null;
}

export function cnpjRoot(cnpj: string | null | undefined): string | null {
  const digits = normalizeCnpjDigits(cnpj);
  return digits ? digits.slice(0, 8) : null;
}

/**
 * Agrupa as contas do tenant por raiz de CNPJ e devolve um par (source, target) para cada dupla
 * dentro do mesmo grupo — o chamador decide a direção final (matriz/filial) ou trata como
 * bidirecional; aqui só a matemática de agrupamento é determinística. Empresas com CNPJ ausente ou
 * malformado nunca entram em nenhum grupo.
 */
export function matchEconomicGroupByCnpjRoot(
  companies: EconomicGroupCompanyInput[],
): EconomicGroupMatch[] {
  const byRoot = new Map<string, string[]>();
  for (const company of companies) {
    const root = cnpjRoot(company.cnpj);
    if (!root) continue;
    const existing = byRoot.get(root);
    if (existing) existing.push(company.id);
    else byRoot.set(root, [company.id]);
  }

  const matches: EconomicGroupMatch[] = [];
  for (const [root, companyIds] of byRoot) {
    if (companyIds.length < 2) continue;
    // Ordena antes de parear: a ordem de chegada (scan do banco) não é garantida entre execuções,
    // e o dedupeKey de EconomicRelationship (ver worker) depende de source/target estáveis para
    // não recriar o mesmo par com papéis trocados a cada tick.
    const sortedIds = [...companyIds].sort();
    for (let i = 0; i < sortedIds.length; i += 1) {
      for (let j = i + 1; j < sortedIds.length; j += 1) {
        matches.push({
          sourceCompanyId: sortedIds[i],
          targetCompanyId: sortedIds[j],
          cnpjRoot: root,
        });
      }
    }
  }
  return matches;
}
