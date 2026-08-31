// Validação e normalização de CNPJ com o algoritmo oficial de dígitos verificadores (Receita
// Federal). Vive em src/lib/ (não numa feature) porque é consumido por mais de um módulo vertical
// (companies, prospecting) — composição entre features via utilitário comum, como exige
// `no-cross-feature-imports` em .dependency-cruiser.cjs, em vez de uma feature importar
// internals de outra.
//
// `Company.cnpj` já foi gravado em pelo menos 3 formatos diferentes dependendo de qual caminho de
// código escreveu o registro (dígitos puros, pontuado, ou o que o usuário digitou sem normalizar)
// — achado real da Onda 43. `sanitizeCnpj`/`toDeterministicCnpj` são o ponto único de normalização
// usado por todo write path que grava `Company.cnpj`, para o `@@unique([organizationId, cnpj])` do
// schema ter sentido (duas linhas só colidem se o CNPJ normalizado for igual).

export function sanitizeCnpj(cnpj: string): string {
  return (cnpj || '').replace(/\D/g, '');
}

export function formatCnpj(cnpj: string): string {
  const digits = sanitizeCnpj(cnpj);
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function calcCheckDigit(base: string): number {
  const weights =
    base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const sum = base.split('').reduce((acc, digit, idx) => acc + Number(digit) * weights[idx], 0);

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCnpj(cnpj: string): boolean {
  const digits = sanitizeCnpj(cnpj);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // todos os dígitos iguais

  const base = digits.slice(0, 12);
  const firstCheck = calcCheckDigit(base);
  const secondCheck = calcCheckDigit(base + firstCheck);

  return digits === base + String(firstCheck) + String(secondCheck);
}

/**
 * Normaliza um CNPJ (qualquer formato de entrada — com ou sem pontuação) para uma chave de
 * identidade determinística: string de 14 dígitos, só depois de passar pela validação real do
 * dígito verificador (`isValidCnpj`). Devolve `null` quando o CNPJ está ausente, mal formado ou
 * com dígito verificador inválido — nesses casos NÃO existe identidade determinística de empresa
 * disponível, e quem chamar esta função deve cair para um método de resolução heurístico (nunca
 * tratar `null` como "CNPJ igual a vazio").
 */
export function toDeterministicCnpj(cnpjRaw?: string | null): string | null {
  if (!cnpjRaw) return null;
  return isValidCnpj(cnpjRaw) ? sanitizeCnpj(cnpjRaw) : null;
}
