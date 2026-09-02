import { prisma, withRlsContext } from '../../../lib/prisma.js';
import type { Company } from '@prisma/client';
import { toDeterministicCnpj } from './cnpj.util.js';

/**
 * Resolução de identidade de empresa (dossiê CPI, DEC-16, opção A).
 *
 * CNPJ é, por natureza, o único identificador determinístico e único de empresa no Brasil —
 * 14 dígitos com dígito verificador calculado por um algoritmo de checksum real (Receita
 * Federal). Quando o candidato/lead/company sendo resolvido traz um CNPJ que sobrevive a
 * `toDeterministicCnpj` (normalizado + dígito verificador validado), esse CNPJ é a CHAVE
 * PRIMÁRIA de identidade: qualquer `Company` já cadastrada nesta organização com o mesmo CNPJ
 * normalizado é, com certeza, a mesma empresa — não importa se o nome mudou (fusão, rebranding,
 * erro de digitação, nome fantasia diferente do nome buscado).
 *
 * `'cnpj'` é o único método que esta função chama de "resolução determinística" — é o que a
 * DEC-16 pediu. Quando não há CNPJ conhecido, ou o CNPJ informado é inválido (dígito
 * verificador não bate — ex: erro de digitação, placeholder, CNPJ ainda não descoberto pelo
 * enriquecimento), a função cai para a heurística por nome já existente (`'name-heuristic'`):
 * `tradeName`/`legalName` batendo, case-insensitive. Isso é best-effort, não identidade real —
 * dois nomes fantasia iguais podem ser empresas diferentes (franquias, homônimos em cidades
 * diferentes), e uma mesma empresa grafada de forma diferente pode não ser encontrada. Nunca
 * trate `method: 'name-heuristic'` como equivalente a `method: 'cnpj'` em decisões que dependem
 * de identidade real (ex: merge automático de registros, decisões financeiras).
 */
export type CompanyIdentityMatchMethod = 'cnpj' | 'name-heuristic' | 'none';

export interface CompanyIdentityResolution {
  company: Company | null;
  /** Como `company` foi encontrada — ver documentação do tipo acima. `'none'` quando não achou nada. */
  method: CompanyIdentityMatchMethod;
}

export interface CompanyIdentityInput {
  organizationId: string;
  /** CNPJ em qualquer formato (com ou sem pontuação) — normalizado e validado internamente. */
  cnpj?: string | null;
  tradeName: string;
  legalName?: string | null;
}

/**
 * Localiza uma `Company` já cadastrada nesta organização que corresponda ao input — por CNPJ
 * (determinístico, quando disponível e válido) ou, na ausência de CNPJ confiável, por nome
 * (heurística, best-effort). Usada para evitar duplicar empresas ao promover o mesmo
 * candidato/lead mais de uma vez.
 *
 * `$queryRaw` roda dentro de `withRlsContext` (não em `prisma.$queryRaw` direto) porque não
 * passa pela extensão `$allOperations` de `src/lib/prisma.ts` (RLS/tenant scoping) — sem
 * `app.current_tenant_id` setado na transação, a policy de RLS de "Company" (FORCE ROW LEVEL
 * SECURITY) devolve zero linhas sempre, mesmo com o WHERE certo. Mantém também o filtro
 * explícito de `organizationId` como defesa em profundidade (ver
 * `tests/integration/prospecting-rls.test.ts`).
 *
 * Fail-closed: qualquer erro (rede, banco, RLS mal configurado) devolve `{ company: null,
 * method: 'none' }` em vez de propagar — resolução de duplicata é best-effort, nunca deve
 * impedir a criação de um lead/company novo por causa de uma falha transitória na checagem.
 */
export async function resolveCompanyIdentity(
  input: CompanyIdentityInput,
): Promise<CompanyIdentityResolution> {
  try {
    const cnpj = toDeterministicCnpj(input.cnpj);
    if (cnpj) {
      // CNPJs de Company nem sempre chegam ao banco no mesmo formato (alguns fluxos
      // gravam só dígitos, outros com pontuação) — normaliza no próprio Postgres via
      // regexp_replace em vez de carregar todas as empresas do tenant para comparar em
      // memória, o que não escalaria com a base de clientes.
      //
      // '\\D' (barra dupla) de propósito: dentro de um template literal comum do JS, `\D`
      // não é uma sequência de escape reconhecida, então o parser descarta a barra e o texto
      // "cooked" enviado ao driver do Postgres vira só `D` — Prisma usa esse texto "cooked"
      // (não `strings.raw`) para montar o SQL da query crua. Com barra simples, o
      // regexp_replace comparava contra o caractere literal "D" (que um CNPJ nunca tem), e a
      // busca por CNPJ nunca encontrava nada, mesmo já dentro do withRlsContext — confirmado
      // empiricamente contra Postgres real (ver tests/integration/prospecting-rls.test.ts).
      const [found] = await withRlsContext(
        (tx) => tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM "Company"
                WHERE "organizationId" = ${input.organizationId}
                  AND cnpj IS NOT NULL
                  AND regexp_replace(cnpj, '\\D', '', 'g') = ${cnpj}
                LIMIT 1
            `,
      );
      if (found) {
        const company = await prisma.company.findUnique({ where: { id: found.id } });
        if (company) return { company, method: 'cnpj' };
      }
    }

    // Diferente do path de CNPJ acima (que inclui empresas soft-deletadas de propósito
    // documentado, para nunca colidir com o CNPJ de uma empresa apagada), o fallback por nome é
    // best-effort e não tem essa mesma justificativa: reabrir/reanexar uma empresa
    // soft-deletada só por coincidência de nome fantasia faz `promoteToCrm` criar um Lead novo
    // apontando pra um companyId que enrichmentCascade.service.ts (filtra deletedAt: null) trata
    // como inexistente — o lead fica órfão, sem conseguir ser enriquecido, e a empresa some de
    // qualquer tela que já filtra deletados mesmo tendo um Lead ativo pendurado nela.
    const company = await prisma.company.findFirst({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        OR: [
          { tradeName: { equals: input.tradeName, mode: 'insensitive' } },
          { legalName: { equals: input.legalName || input.tradeName, mode: 'insensitive' } },
        ],
      },
    });
    return { company, method: company ? 'name-heuristic' : 'none' };
  } catch {
    return { company: null, method: 'none' };
  }
}
