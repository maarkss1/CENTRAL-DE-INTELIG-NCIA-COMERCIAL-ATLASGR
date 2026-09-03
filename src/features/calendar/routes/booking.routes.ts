import { Router, type Request, type Response, type NextFunction } from 'express';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';
import { requestContext } from '../../../lib/async-context.js';
import { AppError } from '../../../shared/middlewares/errorHandler.js';
import {
  authenticateToken,
  type AuthRequest,
} from '../../../shared/middlewares/authenticateToken.js';
import { requireTenant } from '../../../shared/middlewares/authorization.js';
import { hasRequiredRole } from '../../../lib/auth/authorization.js';
import { z } from 'zod';
import { routeParam } from '../../../shared/http/routeParams.js';

// Schema para criação/atualização de link de agendamento
const bookingLinkSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hifens'),
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  durationMin: z.number().int().min(15).max(120).default(30),
  active: z.boolean().default(true),
});

// Schema para alternar ativo/inativo de um link já existente
const bookingLinkActiveSchema = z.object({
  active: z.boolean(),
});

/**
 * Ativa/desativa um link de agendamento já existente. Mesmo padrão de "dono OU gestão" já usado
 * em `requireLeadOwnership.ts` (`src/lib/auth/authorization.ts`, `ROLE_HIERARCHY`): ADMIN/GESTOR
 * gerenciam qualquer link da organização; CLOSER/SDR/VISUALIZADOR só o próprio (`userId`). Método
 * dedicado (não um `prisma.update` cru dentro do handler) para manter a checagem de posse e o
 * update juntos e testáveis isoladamente do roteamento HTTP.
 */
async function setBookingLinkActive(
  organizationId: string,
  userId: string,
  role: string,
  linkId: string,
  active: boolean,
) {
  const isManager = hasRequiredRole(role, ['ADMIN', 'GESTOR']);
  const link = await prisma.publicBookingLink.findFirst({
    where: {
      id: linkId,
      organizationId,
      ...(isManager ? {} : { userId }),
    },
  });
  if (!link) {
    throw new AppError(
      'Link de agendamento não encontrado ou você não tem permissão para alterá-lo.',
      404,
    );
  }
  return prisma.publicBookingLink.update({
    where: { id: link.id },
    data: { active },
  });
}

// Schema para realização pública de agendamento
const publicBookSchema = z.object({
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.string().email('E-mail inválido'),
  phone: z.string().min(8, 'Telefone é obrigatório'),
  company: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm'),
  notes: z.string().max(500).optional(),
});

// ── Rotas Autenticadas (Gerenciamento de Links pelo Vendedor) ──────────────────

export const privateBookingRouter = Router();
privateBookingRouter.use(authenticateToken, requireTenant);

// Lista links de agendamento do usuário logado
privateBookingRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const links = await prisma.publicBookingLink.findMany({
        where: { organizationId, userId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: links });
    } catch (err) {
      next(err);
    }
  },
);

// Cria um novo link de agendamento
privateBookingRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      const parsed = bookingLinkSchema.parse(req.body);

      // Verifica se o slug já existe
      const existing = await prisma.publicBookingLink.findUnique({
        where: { slug: parsed.slug },
      });
      if (existing) {
        throw new AppError(
          `O link personalizado "/book/${parsed.slug}" já está em uso. Escolha outro slug.`,
          409,
        );
      }

      const link = await prisma.publicBookingLink.create({
        data: {
          ...parsed,
          userId,
          organizationId,
        },
      });
      res.status(201).json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  },
);

// Ativa/desativa um link de agendamento (achado do Piloto 020: `PublicBookingLink.active` já
// existia no schema, mas não havia rota nenhuma para alterá-lo depois da criação).
privateBookingRouter.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId, role } = (req as AuthRequest).user;
      const { active } = bookingLinkActiveSchema.parse(req.body);
      const link = await setBookingLinkActive(
        organizationId,
        userId,
        role,
        routeParam(req.params.id, 'id'),
        active,
      );
      res.json({ success: true, data: link });
    } catch (err) {
      next(err);
    }
  },
);

// Deleta um link de agendamento
privateBookingRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { organizationId, id: userId } = (req as AuthRequest).user;
      await prisma.publicBookingLink.deleteMany({
        where: { id: routeParam(req.params.id, 'id'), organizationId, userId },
      });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// ── Rotas Públicas (Acesso pelo Cliente / Agendamento) ─────────────────────────

export const publicBookingRouter = Router();

/**
 * CORRIGIDO (Onda 2, Agente 04, achado real): `PublicBookingLink` não tem RLS (não está em
 * nenhuma migration `ENABLE ROW LEVEL SECURITY`), mas `User`/`Organization` têm FORCE ROW LEVEL
 * SECURITY (`prisma/migrations/20260722020322_enable_rls`) e a policy exige `app.current_tenant_id`
 * OU `app.bypass_rls` setados. As duas rotas públicas abaixo faziam `include: { user: ...,
 * organization: ... }` numa query SEM NENHUM `requestContext.run` — sem tenant conhecido (é
 * exatamente esse o ponto de uma rota pública) e sem bypass, a policy de RLS bloqueia a visão da
 * relação, `link.user`/`link.organization` chegam como algo que não sustenta `.name` e o handler
 * lança (`Cannot read properties of null`), capturado só pelo `catch(err){next(err)}` genérico —
 * ou seja, TODO agendamento público (GET e POST) devolvia erro 500 em produção, sempre, sem
 * nenhum log específico apontando a causa. Mesma classe de bug já documentada e corrigida em
 * `followUp.worker.ts`/`syncRules.ts` para descoberta cross-tenant via credencial opaca (slug não
 * adivinhável, mesmo modelo de confiança do `BitrixConnection`/`CrmCommercialDocument` — ver
 * `BYPASS_RLS_ALLOWED_MODELS` em `src/lib/prisma.ts`, que já inclui `User`/`Organization` para
 * exatamente este bootstrap). Corrigido carregando `user`/`organization` como consultas próprias
 * sob bypass (nunca via `include` na mesma chamada de `PublicBookingLink`, cujo model não está no
 * allowlist e não propagaria o bypass para o JOIN em produção).
 */
async function loadBookingHost(userId: string, organizationId: string) {
  return requestContext.run({ bypassRls: true }, async () => {
    const [user, organization] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, image: true, role: true },
      }),
      prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    ]);
    return { user, organization };
  });
}

// Consulta dados do link público e horários disponíveis
publicBookingRouter.get(
  '/:slug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const link = await prisma.publicBookingLink.findUnique({
        where: { slug: routeParam(req.params.slug, 'slug') },
      });

      if (!link || !link.active) {
        res
          .status(404)
          .json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
        return;
      }

      const { user, organization } = await loadBookingHost(link.userId, link.organizationId);
      if (!user || !organization) {
        logger.error(
          { slug: routeParam(req.params.slug, 'slug'), linkId: link.id },
          'Link de agendamento aponta para usuário/organização inexistente',
        );
        res
          .status(404)
          .json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
        return;
      }

      // Horários de atendimento padrão (09:00 às 18:00 de segunda a sexta)
      const standardSlots = [
        '09:00',
        '09:30',
        '10:00',
        '10:30',
        '11:00',
        '11:30',
        '14:00',
        '14:30',
        '15:00',
        '15:30',
        '16:00',
        '16:30',
        '17:00',
      ];

      res.json({
        success: true,
        data: {
          id: link.id,
          slug: link.slug,
          title: link.title,
          description: link.description,
          durationMin: link.durationMin,
          host: {
            name: user.name,
            role: user.role,
            organization: organization.name,
          },
          availableSlots: standardSlots,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// Realiza o agendamento público pelo cliente
publicBookingRouter.post(
  '/:slug',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const link = await prisma.publicBookingLink.findUnique({
        where: { slug: routeParam(req.params.slug, 'slug') },
      });

      if (!link || !link.active) {
        res
          .status(404)
          .json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
        return;
      }

      const { user: hostUser } = await loadBookingHost(link.userId, link.organizationId);
      if (!hostUser) {
        logger.error(
          { slug: routeParam(req.params.slug, 'slug'), linkId: link.id },
          'Link de agendamento aponta para usuário inexistente',
        );
        res
          .status(404)
          .json({ success: false, error: 'Link de agendamento não encontrado ou inativo.' });
        return;
      }

      const body = publicBookSchema.parse(req.body);

      // Todo o restante roda dentro do tenant real do link (`link.organizationId`, descoberto
      // pelo slug opaco acima — mesmo modelo de confiança do lookup de `BitrixConnection`/
      // `CrmCommercialDocument` por token) — nunca com bypass. `Company`/`Contact`/`Lead`/
      // `Activity` são `tenantModels` (ver `src/lib/prisma.ts`): a extensão do Prisma já injeta
      // `organizationId: link.organizationId` sozinha em cada `create`/`upsert` aqui dentro.
      const { lead, activity } = await requestContext.run(
        { tenantId: link.organizationId },
        async () => {
          // ACHADO REAL (Piloto 020): `standardSlots` (GET acima) é uma lista fixa que nunca
          // consulta a agenda real do vendedor — nada impedia dois leads diferentes de agendar o
          // mesmo horário com o mesmo host. Checagem de conflito antes de criar qualquer registro
          // (Company/Contact/Lead seriam órfãos se a Activity final falhasse depois).
          const activityDate = new Date(`${body.date}T${body.time}:00`);
          const conflict = await prisma.activity.findFirst({
            where: {
              organizationId: link.organizationId,
              owner: hostUser.name,
              date: activityDate,
              time: body.time,
              status: { not: 'Cancelada' },
            },
          });
          if (conflict) {
            throw new AppError(
              'Este horário acabou de ser reservado por outra pessoa. Escolha outro horário.',
              409,
            );
          }

          // 1. Cria ou encontra a Empresa. `Contact.companyId` é obrigatório e é FK real para
          // `Company` (@relation, onDelete: Cascade) — CORRIGIDO (Onda 2, Agente 04): quando o
          // formulário público não pedia nome de empresa (`body.company` opcional), o código
          // anterior deixava `companyId` undefined e caía no fallback
          // `companyId || link.organizationId` logo abaixo — gravando o ID da ORGANIZATION
          // (tabela completamente diferente) como se fosse um Company.id. Isso viola a
          // constraint de FK do Postgres e SEMPRE lançava; o `.catch(() => null)` engolia esse
          // erro silenciosamente, então toda reunião agendada sem nome de empresa perdia o
          // Contact inteiro (nome/e-mail/telefone reais do cliente) — a única sobra era o texto
          // livre em `Activity.observations`. Agora sempre existe uma Company real por trás do
          // Contact, com nome de empresa quando informado, ou um rótulo derivado do nome da
          // pessoa quando não.
          const companyLabel = body.company?.trim() || `Contato via agendamento — ${body.name}`;
          const companySlugSource = (body.company?.trim() || body.name)
            .toLowerCase()
            .replace(/\s+/g, '-');
          const company = await prisma.company.upsert({
            where: { id: `auto-${link.organizationId}-${companySlugSource}` },
            update: {},
            create: {
              id: `auto-${link.organizationId}-${companySlugSource}`,
              legalName: companyLabel,
              tradeName: companyLabel,
              organizationId: link.organizationId,
              status: 'Ativo',
              phones: [body.phone],
              emails: [body.email],
              tags: ['Agendamento Público'],
            },
          });
          const companyId = company.id;

          // Cria o contato. Erro aqui não é mais engolido em silêncio (ver AGENTS.md > "erros
          // relevantes ficam visíveis/observáveis") — o agendamento em si ainda não falha por
          // causa disso (o cliente já confirmou o horário), mas fica registrado para
          // investigação real.
          const contact = await prisma.contact
            .create({
              data: {
                name: body.name,
                email: body.email,
                phone: body.phone,
                organizationId: link.organizationId,
                status: 'Ativo',
                companyId,
              },
            })
            .catch((err) => {
              logger.error(
                { err, slug: routeParam(req.params.slug, 'slug') },
                'Falha ao criar contato via agendamento público',
              );
              return null;
            });

          // Cria o Lead no CRM
          //
          // CORRIGIDO (Onda 2, Agente 04): `owner` gravava `link.user.name` (nome de exibição),
          // não `link.userId` (o `User.id` real). `Lead.owner` é o identificador usado por toda
          // a atribuição de posse/RBAC do CRM (round-robin em `assignment.service.ts`,
          // checagem de posse em `requireLeadOwnership.ts`, agregação "por vendedor" em
          // `AnalyticsUseCases`/`commercial-intelligence`) — gravar um nome em vez do id é a
          // mesma classe de bug já documentada para importações Bitrix
          // (`.agents/handoffs/onda-7/04-para-06-owner-bitrix-nome-nao-id.md`): o vendedor real
          // dono do link público nunca via essa reunião como sua em nenhuma tela filtrada por
          // `owner === meuUserId`, e relatórios "por vendedor" ganhavam um grupo estranho,
          // chave por nome em vez de id.
          const lead = await prisma.lead.create({
            data: {
              organizationId: link.organizationId,
              status: 'Reuniao_Agendada',
              owner: link.userId,
              companyId,
              contactId: contact?.id,
              title: `Reunião: ${body.company || body.name}`,
              customFields: { tags: ['Agendamento Calendly'] },
            },
          });

          // 2. Cria a Atividade na Agenda do Vendedor. Ao contrário de `Lead.owner` acima,
          // `Activity.owner` é texto livre por convenção real do produto (nome de exibição,
          // não FK — ver `ActivityList.tsx`/`ownerGuard.ts`: filtro "minhas atividades",
          // exibição na lista e o feed iCal já comparam/mostram por nome), então aqui o nome é
          // o valor correto.
          const activity = await prisma.activity.create({
            data: {
              type: 'Reuniao',
              owner: hostUser.name,
              date: activityDate,
              time: body.time,
              status: 'Pendente',
              observations: `Reunião agendada via link público (${link.title})\nCliente: ${body.name} (${body.email} / ${body.phone})\nNotas: ${body.notes || 'Sem observações'}`,
              leadId: lead.id,
              organizationId: link.organizationId,
            },
          });

          return { lead, activity };
        },
      );

      res.status(201).json({
        success: true,
        data: {
          bookingId: activity.id,
          leadId: lead.id,
          date: body.date,
          time: body.time,
          host: hostUser.name,
          title: link.title,
          message: 'Reunião confirmada com sucesso! Você receberá os detalhes em seu e-mail.',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
