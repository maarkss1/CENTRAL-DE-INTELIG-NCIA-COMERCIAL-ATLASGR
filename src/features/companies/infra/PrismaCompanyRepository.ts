import type { Company, CompanyRepository } from '../domain/Company';
import { prisma } from '../../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { env } from '../../../config/env';
import { searchCompanyIds } from '../../../lib/search/index';
import { toPrismaCompanyStatus, fromPrismaCompanyStatus } from '../../../lib/enumMap';
// Company['status'] (domain, importado de @prisma/client) e o CompanyStatus que toPrismaCompanyStatus
// espera (importado de lib/zod, o valor exibido com acento) sao dois tipos TS diferentes para o
// mesmo dado em runtime — divergencia de contrato pre-existente entre o dominio e a validacao Zod
// (fora do escopo deste fix). O cast abaixo documenta a ponte, ja que o valor real em `data.status`
// sempre vem do body validado pelo Zod (accent-value), nunca da chave crua do Prisma.
import type { CompanyStatus as CompanyStatusLabel } from '../../../lib/zod';

// O Prisma Client devolve a CHAVE do enum (ex.: "Em_analise"), nao o valor mapeado via @map no
// schema (ex.: "Em análise") — e so aceita a mesma chave em escritas. Ja era tratado para Company
// aninhada em Lead (PrismaLeadRepository.ts:serializeLead) via toPrismaCompanyStatus/
// fromPrismaCompanyStatus, mas nunca aqui, no CRUD direto de Company usado pela tela Empresas.
// Sem isto: POST/PUT com status "Em análise" falha (chave de enum invalida) e GET devolve
// "Em_analise" cru, que a UI (CompanyList/CompanyForm) nunca reconhece.
function serializeCompanyStatus<T extends { status: string }>(company: T): T {
  return { ...company, status: fromPrismaCompanyStatus(company.status) };
}

export class PrismaCompanyRepository implements CompanyRepository {
  async findAllWithFilters(
    organizationId: string,
    query?: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ data: Company[]; meta: unknown }> {
    const where: Prisma.CompanyWhereInput = { organizationId };

    if (query) {
      // Com ENABLE_SEARCH=true, prioriza o Meilisearch (tolerante a erros de digitação e
      // ranqueado por relevância) sobre o ILIKE simples do Postgres. `null` significa que o
      // Meilisearch está indisponível/falhou — cai de volta para o filtro OR abaixo. Um array
      // vazio é uma resposta legítima do Meilisearch (busca funcionou, sem resultados) e deve
      // ser respeitado, não sobrescrito pelo fallback.
      const meiliIds = env.ENABLE_SEARCH
        ? await searchCompanyIds(organizationId, query, limit)
        : null;
      if (meiliIds !== null) {
        where.id = { in: meiliIds };
      } else {
        // Company.cnpj é gravado normalizado (só dígitos, ver src/lib/cnpj.ts) — comparar contra
        // `query` cru faria uma busca por "12.345.678/0001-99" nunca bater com o dado salvo.
        // Extrai os dígitos da busca e só adiciona a condição de cnpj quando sobrar algum (uma
        // busca sem nenhum dígito, ex. "Acme", não deve virar `contains: ''`, que bateria com
        // toda empresa independente de ter CNPJ).
        const cnpjDigits = query.replace(/\D/g, '');
        where.OR = [
          { tradeName: { contains: query, mode: 'insensitive' } },
          { legalName: { contains: query, mode: 'insensitive' } },
          ...(cnpjDigits ? [{ cnpj: { contains: cnpjDigits } }] : []),
          { emails: { hasSome: [query] } },
          { phones: { hasSome: [query] } },
          { website: { contains: query, mode: 'insensitive' } },
        ];
      }
    }

    const skip = (page - 1) * limit;

    const [data, total] = await prisma.$transaction([
      prisma.company.findMany({
        where,
        skip,
        take: limit,
        include: { contacts: true, leads: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.company.count({ where }),
    ]);

    return {
      data: data.map((c) => serializeCompanyStatus(c)) as unknown as Company[],
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(organizationId: string, id: string): Promise<Company | null> {
    const company = await prisma.company.findFirst({
      where: { id, organizationId },
      include: { contacts: true, leads: true },
    });
    return company ? (serializeCompanyStatus(company) as unknown as Company) : null;
  }

  async create(organizationId: string, data: Partial<Company>): Promise<Company> {
    const created = await prisma.company.create({
      data: {
        ...data,
        organizationId,
        ...(data.status
          ? { status: toPrismaCompanyStatus(data.status as unknown as CompanyStatusLabel) }
          : {}),
      } as Prisma.CompanyCreateInput,
    });
    return serializeCompanyStatus(created) as unknown as Company;
  }

  async update(organizationId: string, id: string, data: Partial<Company>): Promise<Company> {
    const existing = await prisma.company.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error('Company not found');

    // organizationId também no `where` do update em si (mesmo padrão de PrismaLeadRepository)
    // — não corrige uma falha explorável hoje (o pré-check acima + RLS real já bloqueiam um
    // tenant errado), mas deixa a query de escrita autocontida em vez de depender só do
    // pré-check + RLS como únicas camadas.
    const updated = await prisma.company.update({
      where: { id, organizationId },
      data: {
        ...data,
        ...(data.status
          ? { status: toPrismaCompanyStatus(data.status as unknown as CompanyStatusLabel) }
          : {}),
      } as Prisma.CompanyUpdateInput,
    });
    return serializeCompanyStatus(updated) as unknown as Company;
  }

  async delete(organizationId: string, id: string): Promise<Company> {
    const existing = await prisma.company.findFirst({ where: { id, organizationId } });
    if (!existing) throw new Error('Company not found');
    const deleted = await prisma.company.delete({ where: { id, organizationId } });
    return serializeCompanyStatus(deleted) as unknown as Company;
  }
}
