import { logger } from '../../../../lib/logger';
import { prisma } from '../../../../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { toDeterministicCnpj } from '../cnpj.util';
import { resolveCompanyIdentity } from '../companyIdentity.service';
import { enrichCompany } from '../enrichment.service';
import {
  toPrismaLeadStatus,
  fromPrismaLeadStatus,
  fromPrismaCompanyStatus,
} from '../../../../lib/enumMap';
import { pushLeadToBitrix } from '../../../integrations/bitrix/bitrix.service.js';
import type { PromoteInput } from './types.js';

function splitLocation(location?: string | null): { city?: string; state?: string } {
  if (!location) return {};
  const parts = location
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return { city: parts[0], state: parts[1] };
}

/**
 * Localiza uma empresa já cadastrada na organização que corresponda ao candidato — via
 * `resolveCompanyIdentity` (`companyIdentity.service.ts`): CNPJ normalizado+validado como
 * identidade determinística quando disponível, com fallback para a heurística por nome fantasia/
 * razão social só quando não há CNPJ confiável. Evita duplicar empresas ao promover o mesmo
 * candidato mais de uma vez. Ver `companyIdentity.service.ts` para o raciocínio completo (dossiê
 * CPI, DEC-16, opção A) e `tests/integration/prospecting-rls.test.ts` para a cobertura de RLS.
 */
async function findExistingCompany(input: PromoteInput) {
  const { company } = await resolveCompanyIdentity({
    organizationId: input.organizationId,
    cnpj: input.cnpj,
    tradeName: input.tradeName,
    legalName: input.legalName,
  });
  return company;
}

/**
 * Cria (ou reaproveita) Company + Contact + Lead no CRM a partir de um candidato e dispara o
 * enriquecimento real.
 *
 * Não tem fallback silencioso: se qualquer escrita no banco falhar, o erro sobe para a rota (que
 * já trata via `next(error)`). Um fallback aqui já devolveu, no passado, uma empresa/lead
 * inteiramente fabricados com HTTP 201 de sucesso — o usuário via um lead "criado" que nunca foi
 * persistido e sumia na primeira busca real.
 */
export async function promoteToCrm(input: PromoteInput) {
  const derivedLocation = splitLocation(input.location);
  const city = input.city || derivedLocation.city || null;
  const state = input.state || derivedLocation.state || null;

  const existing = await findExistingCompany(input);
  const reusedCompany = !!existing;

  const company =
    existing ??
    (await prisma.company.create({
      data: {
        legalName: input.legalName || input.tradeName,
        tradeName: input.tradeName,
        cnpj: toDeterministicCnpj(input.cnpj),
        segment: input.segment,
        size: input.size,
        city,
        state,
        linkedin: input.linkedin || null,
        website: input.website || null,
        phones: input.phone ? [input.phone] : [],
        status: 'Ativo',
        tags: ['Prospecção'],
        organizationId: input.organizationId,
      },
    }));

  if (reusedCompany) {
    const openLead = await prisma.lead.findFirst({
      where: {
        companyId: company.id,
        organizationId: input.organizationId,
        status: { notIn: ['Negocios_Ganhos', 'Negocios_Perdidos', 'Lead_Desqualificado'] },
      },
      include: { company: true, contact: true, timeline: true },
    });
    if (openLead) {
      return {
        lead: {
          ...openLead,
          status: fromPrismaLeadStatus(openLead.status),
          company: openLead.company
            ? { ...openLead.company, status: fromPrismaCompanyStatus(openLead.company.status) }
            : openLead.company,
        },
        fit: undefined,
        enrichment: null,
        alreadyExists: true,
      };
    }
  }

  let contact = null;
  if (input.contact?.name) {
    // Rotulagem LGPD na observação (já que schema é propriedade do Agente 01)
    const isFromProvider =
      input.source.toLowerCase().includes('apollo') ||
      input.source.toLowerCase().includes('hunter');
    const lgpdNote = isFromProvider
      ? `[LGPD] Origem: ${input.source} | Base Legal: Legítimo Interesse (B2B)`
      : `[LGPD] Origem: ${input.source} | Base Legal: Consentimento/Público`;

    contact = await prisma.contact.create({
      data: {
        name: input.contact.name,
        role: input.contact.role,
        companyId: company.id,
        status: 'Ativo',
        observations: `Contato sugerido — confirmar identidade e dados antes da abordagem.\n${lgpdNote}`,
        organizationId: input.organizationId,
      },
    });
  }

  let enrichmentResult: Awaited<ReturnType<typeof enrichCompany>> | null = null;
  if (input.autoEnrich !== false) {
    try {
      enrichmentResult = await enrichCompany(input.organizationId, company.id, {
        cnpj: company.cnpj || undefined,
        segmentKeywords: input.segment ? [input.segment] : undefined,
        fleetSizeHint: input.size || undefined,
        preFetchedDecisionMakers: input.decisionMakers?.length ? input.decisionMakers : undefined,
      });
    } catch (error) {
      // Enriquecimento é um extra sobre um lead já persistido de verdade — sua falha não
      // pode impedir a criação do lead, só deixá-lo sem o fit score automático.
      logger.error({ err: error }, 'Auto-enrichment failed during promote');
    }
  }

  const finalCompany = enrichmentResult?.company || company;
  const fit = enrichmentResult?.fit;

  const lead = await prisma.lead.create({
    data: {
      status: toPrismaLeadStatus('Lead Recebido') as unknown as Prisma.LeadCreateInput['status'],
      source: input.source,
      channel: 'Prospecção',
      temperature: fit?.temperature || 'Morno',
      score: fit?.score ?? null,
      companyId: finalCompany.id,
      contactId: contact?.id,
      organizationId: input.organizationId,
      savedSearchId: input.savedSearchId ?? null,
      timeline: {
        create: {
          type: 'creation',
          description: `Lead criado via ${input.source}${enrichmentResult ? ' — enriquecido automaticamente com dados da Receita Federal' : ''}`,
        },
      },
    },
    include: { company: true, contact: true, timeline: true },
  });

  // Fire-and-forget: Atlas → Bitrix24 é automático (nunca exige clique manual), mas nunca deve
  // atrasar nem derrubar a resposta de criação do lead — pushLeadToBitrix já engole os próprios
  // erros e vira no-op se a organização não tiver Bitrix conectado.
  void pushLeadToBitrix(input.organizationId, lead.id);

  return {
    lead: {
      ...lead,
      status: fromPrismaLeadStatus(lead.status),
      company: lead.company
        ? { ...lead.company, status: fromPrismaCompanyStatus(lead.company.status) }
        : null,
    },
    fit,
    enrichment: enrichmentResult,
  };
}
