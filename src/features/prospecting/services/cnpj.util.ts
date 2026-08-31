// Validação de CNPJ com o algoritmo oficial de dígitos verificadores (Receita Federal).
//
// A implementação real mora em src/lib/cnpj.ts (Onda 43) — promovida pra lá porque
// `src/features/companies/` e `src/lib/zod.ts` também precisam normalizar CNPJ, e importar deste
// arquivo (dentro de `prospecting/`) violaria `no-cross-feature-imports`
// (.dependency-cruiser.cjs). Reexportado aqui para não quebrar os imports já existentes que
// apontam para `prospecting/services/cnpj.util`.
export { sanitizeCnpj, formatCnpj, isValidCnpj, toDeterministicCnpj } from '../../../lib/cnpj.js';

import { isValidCnpj } from '../../../lib/cnpj.js';

/** Busca um CNPJ na web pelo nome da empresa (útil quando o usuário só digitou o nome) */
export async function discoverCnpjByName(companyName: string): Promise<string | null> {
  if (!companyName) return null;
  try {
    const q = encodeURIComponent(companyName + ' cnpj');
    const url = 'https://html.duckduckgo.com/html/?q=' + q;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
    if (match && isValidCnpj(match[0])) return match[0];
    return null;
  } catch {
    return null;
  }
}
