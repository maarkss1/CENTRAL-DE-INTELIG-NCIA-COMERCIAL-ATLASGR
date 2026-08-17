import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import bcrypt from 'bcrypt';

const ORG_NAME = 'AtlasGR — Demonstração Vídeo';
const DEMO_EMAIL = 'video.demo@atlasgr-demo.local';
const DEMO_PASSWORD = 'AtlasDemo2026!';

async function main() {
  // Este script roda fora de uma requisição HTTP, então não há contexto de tenant/RLS
  // (`requestContext`/`withRlsContext` de src/lib/prisma.ts) já estabelecido. As policies de RLS
  // do Postgres (`tenant_isolation_policy`) bloqueiam qualquer INSERT/SELECT sem
  // `app.bypass_rls = 'on'` setado na sessão — por isso todo o seed roda numa única transação
  // com esse GUC setado explicitamente, só para esta operação administrativa pontual.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT set_config('app.bypass_rls', 'on', TRUE);`);

    const existingOrg = await tx.organization.findFirst({ where: { name: ORG_NAME } });
    if (existingOrg) {
      console.log('Removendo dados de demonstração anteriores...');
      await tx.activity.deleteMany({ where: { organizationId: existingOrg.id } });
      await tx.lead.deleteMany({ where: { organizationId: existingOrg.id } });
      await tx.contact.deleteMany({ where: { organizationId: existingOrg.id } });
      await tx.company.deleteMany({ where: { organizationId: existingOrg.id } });
      await tx.session.deleteMany({ where: { user: { organizationId: existingOrg.id } } });
      await tx.account.deleteMany({ where: { user: { organizationId: existingOrg.id } } });
      await tx.user.deleteMany({ where: { organizationId: existingOrg.id } });
      await tx.organization.delete({ where: { id: existingOrg.id } });
    }

    console.log('Criando organização de demonstração...');
    const org = await tx.organization.create({ data: { name: ORG_NAME } });

    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
    const user = await tx.user.create({
      data: {
        name: 'Usuário Demonstração',
        email: DEMO_EMAIL,
        passwordHash: hashedPassword,
        role: 'ADMIN',
        organizationId: org.id,
        emailVerified: true,
      },
    });
    await tx.account.create({
      data: {
        userId: user.id,
        accountId: user.email,
        providerId: 'credential',
        password: hashedPassword,
      },
    });
    console.log(`Login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  const companySeeds = [
    { legalName: 'Rota Sul Transportes Ltda', tradeName: 'Rota Sul Transportes', segment: 'Transporte Rodoviário de Cargas', city: 'Curitiba', state: 'PR', employeeCount: 210 },
    { legalName: 'Nordeste Cargas Especiais S.A.', tradeName: 'Nordeste Cargas Especiais', segment: 'Logística Refrigerada', city: 'Recife', state: 'PE', employeeCount: 340 },
    { legalName: 'Vetor Log Distribuição Ltda', tradeName: 'Vetor Log Distribuição', segment: 'Distribuição e Armazenagem', city: 'Campinas', state: 'SP', employeeCount: 150 },
    { legalName: 'Malha Central Transportes S.A.', tradeName: 'Malha Central Transportes', segment: 'Transporte Rodoviário de Cargas', city: 'Goiânia', state: 'GO', employeeCount: 480 },
    { legalName: 'Cerrado Frotas & Cargas Ltda', tradeName: 'Cerrado Frotas & Cargas', segment: 'Gestão de Frotas', city: 'Uberlândia', state: 'MG', employeeCount: 95 },
    { legalName: 'Litoral Express Logística Ltda', tradeName: 'Litoral Express Logística', segment: 'Logística Portuária', city: 'Santos', state: 'SP', employeeCount: 260 },
  ];

  const companies = [];
  for (const c of companySeeds) {
    const company = await tx.company.create({
      data: { ...c, status: 'Ativo', organizationId: org.id, owner: user.name },
    });
    companies.push(company);
  }
  console.log(`${companies.length} empresas de demonstração criadas.`);

  const contactRoles = ['Diretor de Operações', 'Gerente de Risco e Sinistros', 'Head de Logística', 'Coordenador de Frota'];
  const contacts = [];
  for (let i = 0; i < companies.length; i++) {
    const contact = await tx.contact.create({
      data: {
        name: `Contato Demonstração ${i + 1}`,
        role: contactRoles[i % contactRoles.length],
        status: 'Ativo',
        companyId: companies[i].id,
        organizationId: org.id,
        source: 'Demonstração',
      },
    });
    contacts.push(contact);
  }

  const leadStages: { status: any; temperature: any; score: number; title: string }[] = [
    { status: 'Lead_Recebido', temperature: 'Frio', score: 35, title: 'Gestão de risco de carga — diagnóstico inicial' },
    { status: 'Cadencia_Iniciada', temperature: 'Morno', score: 48, title: 'Monitoramento de frota — cadência ativa' },
    { status: 'Qualificacao_SDR', temperature: 'Morno', score: 60, title: 'Redução de sinistros — em qualificação' },
    { status: 'Reuniao_Agendada', temperature: 'Quente', score: 78, title: 'Piloto de rastreamento — reunião marcada' },
    { status: 'Convertido_em_Oportunidade', temperature: 'Quente', score: 85, title: 'Revenue OS — oportunidade aberta' },
    { status: 'Proposta_Enviada', temperature: 'Quente', score: 90, title: 'Contrato anual — proposta enviada' },
  ];

  const now = new Date();
  const leads = [];
  for (let i = 0; i < companies.length; i++) {
    const stage = leadStages[i % leadStages.length];
    const lead = await tx.lead.create({
      data: {
        status: stage.status,
        funnel: 'Lead',
        temperature: stage.temperature,
        score: stage.score,
        title: stage.title,
        owner: user.name,
        source: 'Demonstração',
        channel: 'Prospecção Ativa',
        nextAction: new Date(now.getTime() + (i - 2) * 24 * 60 * 60 * 1000),
        companyId: companies[i].id,
        contactId: contacts[i].id,
        organizationId: org.id,
      },
    });
    leads.push(lead);
  }
  console.log(`${leads.length} leads de demonstração criados, distribuídos no funil.`);

  const activityPlan: { type: any; time: string; leadIdx: number }[] = [
    { type: 'Ligacao', time: '09:30', leadIdx: 0 },
    { type: 'Reuniao', time: '11:00', leadIdx: 3 },
    { type: 'Follow_up', time: '14:00', leadIdx: 2 },
    { type: 'WhatsApp', time: '16:30', leadIdx: 5 },
  ];
  for (const a of activityPlan) {
    await tx.activity.create({
      data: {
        type: a.type,
        owner: user.name,
        date: now,
        time: a.time,
        status: 'Pendente',
        leadId: leads[a.leadIdx].id,
        organizationId: org.id,
      },
    });
  }
  console.log(`${activityPlan.length} atividades de hoje criadas para a agenda.`);
  console.log('Seed de demonstração para vídeo concluído.');
  }, { timeout: 30000 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
