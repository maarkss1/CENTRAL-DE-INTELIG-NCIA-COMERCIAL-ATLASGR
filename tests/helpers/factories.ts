import { faker } from '@faker-js/faker';

export const CompanyFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => ({
    legalName: faker.company.name(),
    tradeName: faker.company.name(),
    cnpj: faker.string.numeric(14),
    segment: faker.commerce.department(),
    size: faker.helpers.arrayElement(['Pequena', 'Média', 'Grande']),
    employeeCount: faker.number.int({ min: 1, max: 1000 }),
    estimatedRevenue: faker.number.float({ min: 10000, max: 10000000 }),
    website: faker.internet.url(),
    linkedin: faker.internet.url(),
    emails: [faker.internet.email()],
    phones: [faker.phone.number()],
    status: 'Ativo',
    organizationId: 'test-org-id',
    ...overrides,
  }),
};

export const ContactFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => {
    return {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
      role: faker.person.jobTitle(),
      status: 'Ativo',
      organizationId: 'test-org-id',
      company: overrides?.company || {
        create: CompanyFactory.build(),
      },
      ...overrides,
    };
  },
};

export const LeadFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => ({
    status: 'Lead_Recebido',
    source: faker.helpers.arrayElement(['Inbound', 'Outbound', 'Referral']),
    temperature: faker.helpers.arrayElement(['Frio', 'Morno', 'Quente']),
    score: faker.number.int({ min: 0, max: 100 }),
    owner: faker.person.fullName(),
    organizationId: 'test-org-id',
    ...overrides,
  }),
};

export const ActivityFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => ({
    type: faker.helpers.arrayElement(['Ligacao', 'WhatsApp', 'Email', 'Reuniao', 'Follow_up', 'Visita', 'Tarefa']),
    owner: faker.person.fullName(),
    date: faker.date.recent().toISOString(),
    status: 'Concluida',
    organizationId: 'test-org-id',
    lead: overrides?.lead || {
      create: LeadFactory.build(),
    },
    ...overrides,
  }),
};

export const NoteFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => ({
    content: faker.lorem.paragraph(),
    author: faker.person.fullName(),
    lead: overrides?.lead || {
      create: LeadFactory.build(),
    },
    ...overrides,
  }),
};

export const TimelineEventFactory = {
  build: <T extends Record<string, unknown>>(overrides?: T) => ({
    type: 'creation',
    description: faker.lorem.sentence(),
    lead: overrides?.lead || {
      create: LeadFactory.build(),
    },
    ...overrides,
  }),
};
