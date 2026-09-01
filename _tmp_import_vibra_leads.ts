import 'dotenv/config';
import ExcelJS from 'exceljs';
import crypto from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from './src/lib/prisma.js';
import { requestContext } from './src/lib/async-context.js';
import { resolveCompanyIdentity } from './src/features/prospecting/services/companyIdentity.service.js';
import { sanitizeCnpj, isValidCnpj } from './src/lib/cnpj.js';

const XLSX_PATH =
  'C:/Users/Marks/Downloads/Relaçao de Transportadoras Prospects Vibra Energy ( Vendedores Atlas GR ) Dezembro 2024 (1).xlsx';

// Ambiente Supabase real (produção): a organização já existe (criada pela sessão anterior que
// semeou marcelo.nascimento/joao.reis) — reaproveita o ID fixo em vez de criar/buscar por nome,
// pra não gerar uma segunda organização e fragmentar os dados. Ambiente local: cai no nome.
const EXISTING_ORG_ID = process.env.SEED_ORG_ID || null;
const ORG_NAME = 'AtlasGR';

interface SeedUserDefinition {
  name: string;
  email: string;
  role: 'ADMIN' | 'GESTOR' | 'CLOSER' | 'SDR' | 'VISUALIZADOR';
}

const USERS: SeedUserDefinition[] = [
  { name: 'Marcelo Nascimento', email: 'marcelo.nascimento@atlasgr.com.br', role: 'ADMIN' },
  { name: 'Joao Reis', email: 'joao.reis@atlasgr.com.br', role: 'SDR' },
  { name: 'Kaue Oliveira', email: 'kaue.oliveira@totaltrac.com.br', role: 'SDR' },
  { name: 'Jhonatan Garcia', email: 'jhonatan.garcia@totaltrac.com.br', role: 'SDR' },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Contra o pool remoto (Supabase, alta latência), a conexão pode ser reciclada no meio de um loop
 * longo e a próxima operação paga de novo o custo de handshake dentro do timeout apertado da
 * transação interativa (P2028) — não é falha de dado, é só a conexão precisando ser reaberta.
 * Reexecuta a MESMA operação (idempotente por CNPJ/companyId) após reaquecer o pool.
 */
async function withDbRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isTransactionTimeout =
        err instanceof Error && /Unable to start a transaction|P2028/.test(err.message);
      if (!isTransactionTimeout || attempt === attempts) throw err;
      await sleep(500 * attempt);
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
      } catch {
        // Reaquecimento também pode falhar — a próxima tentativa do loop principal cobre isso.
      }
    }
  }
  throw lastError;
}

function generateRandomPassword(): string {
  return crypto.randomBytes(18).toString('base64url');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

interface RawCompanyRow {
  sheet: 'Rodoviário' | 'Fluvial';
  cnpjRaw: string;
  code: string;
  razaoSocial: string;
  vendedorHistorico?: string;
  pdlt?: string;
  prodPrincipal?: string;
  directorName?: string;
  directorEmail?: string;
  directorPhone?: string;
  managerName?: string;
  managerEmail?: string;
  managerPhone?: string;
}

async function readWorkbook(): Promise<{
  rows: RawCompanyRow[];
  supplementaryEmails: Map<string, string[]>;
}> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(XLSX_PATH);

  const rows: RawCompanyRow[] = [];

  const rodoviario = wb.getWorksheet('Rodoviário');
  if (rodoviario) {
    for (let r = 3; r <= rodoviario.rowCount; r++) {
      const row = rodoviario.getRow(r);
      const cnpjRaw = cellText(row.getCell(1).value);
      const razaoSocial = cellText(row.getCell(3).value);
      if (!cnpjRaw || !razaoSocial) continue;
      rows.push({
        sheet: 'Rodoviário',
        cnpjRaw,
        code: cellText(row.getCell(2).value),
        razaoSocial,
        vendedorHistorico: cellText(row.getCell(4).value) || undefined,
        pdlt: cellText(row.getCell(5).value) || undefined,
        prodPrincipal: cellText(row.getCell(6).value) || undefined,
        directorName: cellText(row.getCell(7).value) || undefined,
        directorEmail: cellText(row.getCell(8).value) || undefined,
        directorPhone: cellText(row.getCell(9).value) || undefined,
        managerName: cellText(row.getCell(10).value) || undefined,
        managerEmail: cellText(row.getCell(11).value) || undefined,
        managerPhone: cellText(row.getCell(12).value) || undefined,
      });
    }
  }

  const fluvial = wb.getWorksheet('Fluvial');
  if (fluvial) {
    for (let r = 3; r <= fluvial.rowCount; r++) {
      const row = fluvial.getRow(r);
      const cnpjRaw = cellText(row.getCell(1).value);
      const razaoSocial = cellText(row.getCell(3).value);
      if (!cnpjRaw || !razaoSocial) continue;
      rows.push({
        sheet: 'Fluvial',
        cnpjRaw,
        code: cellText(row.getCell(2).value),
        razaoSocial,
        prodPrincipal: cellText(row.getCell(4).value) || undefined,
        directorName: cellText(row.getCell(5).value) || undefined,
        directorEmail: cellText(row.getCell(6).value) || undefined,
        directorPhone: cellText(row.getCell(7).value) || undefined,
        managerName: cellText(row.getCell(8).value) || undefined,
        managerEmail: cellText(row.getCell(9).value) || undefined,
        managerPhone: cellText(row.getCell(10).value) || undefined,
      });
    }
  }

  const supplementaryEmails = new Map<string, string[]>();
  const planilha1 = wb.getWorksheet('Planilha1');
  if (planilha1) {
    for (let r = 1; r <= planilha1.rowCount; r++) {
      const row = planilha1.getRow(r);
      const code = cellText(row.getCell(1).value);
      const emailsRaw = cellText(row.getCell(2).value);
      if (!code || !emailsRaw) continue;
      const emails = emailsRaw
        .split(';')
        .map((e) => e.trim().toLowerCase())
        .filter(isLikelyEmail);
      supplementaryEmails.set(code.toUpperCase(), emails);
    }
  }

  return { rows, supplementaryEmails };
}

async function seedUsers(): Promise<{ orgId: string; credentials: Array<{ email: string; password: string }> }> {
  const credentials: Array<{ email: string; password: string }> = [];

  let org = EXISTING_ORG_ID
    ? await prisma.organization.findUnique({ where: { id: EXISTING_ORG_ID } })
    : await prisma.organization.findUnique({ where: { name: ORG_NAME } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: ORG_NAME } });
    console.log(`Organização criada: ${ORG_NAME} (${org.id})`);
  } else {
    console.log(`Organização já existia: ${org.name} (${org.id})`);
  }
  const orgId = org.id;

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      if (existing.role !== u.role) {
        await prisma.user.update({ where: { id: existing.id }, data: { role: u.role } });
        console.log(`Usuário ${u.email} já existia — role atualizada para ${u.role}.`);
      } else {
        console.log(`Usuário ${u.email} já existia — nada a fazer.`);
      }
      continue;
    }

    const password = generateRandomPassword();
    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: orgId,
        emailVerified: true,
      },
    });
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: u.email,
        providerId: 'credential',
        userId: user.id,
        password: hashedPassword,
      },
    });
    credentials.push({ email: u.email, password });
    console.log(`Usuário criado: ${u.email} (${u.role})`);
  }

  return { orgId, credentials };
}

async function seedLeads(orgId: string) {
  const { rows, supplementaryEmails } = await readWorkbook();
  console.log(`Linhas lidas da planilha: ${rows.length}`);

  let companiesCreated = 0;
  let companiesSkipped = 0;
  let leadsCreated = 0;
  let leadsSkipped = 0;
  let invalidCnpj = 0;
  const skippedInvalidCnpj: string[] = [];

  let rowIndex = 0;
  for (const row of rows) {
    rowIndex++;
    await withDbRetry(() => processRow(row));
    if (rowIndex % 10 === 0) console.log(`  ...${rowIndex}/${rows.length} linhas processadas`);
  }

  async function processRow(row: RawCompanyRow): Promise<void> {
    const cnpjDigits = sanitizeCnpj(row.cnpjRaw);
    const cnpjValid = isValidCnpj(row.cnpjRaw);
    if (!cnpjValid) {
      invalidCnpj++;
      skippedInvalidCnpj.push(`${row.razaoSocial} (${row.cnpjRaw})`);
    }

    const tradeName = row.code || row.razaoSocial;

    const identity = await resolveCompanyIdentity({
      organizationId: orgId,
      cnpj: cnpjValid ? cnpjDigits : null,
      tradeName,
      legalName: row.razaoSocial,
    });

    let companyId: string;

    if (identity.company) {
      companyId = identity.company.id;
      companiesSkipped++;
    } else {
      const emails = new Set<string>();
      const phones = new Set<string>();
      if (row.directorEmail && isLikelyEmail(row.directorEmail)) emails.add(row.directorEmail.toLowerCase());
      if (row.managerEmail && isLikelyEmail(row.managerEmail)) emails.add(row.managerEmail.toLowerCase());
      if (row.directorPhone) phones.add(row.directorPhone.trim());
      if (row.managerPhone) phones.add(row.managerPhone.trim());
      const supplementary = supplementaryEmails.get((row.code || '').toUpperCase());
      if (supplementary) supplementary.forEach((e) => emails.add(e));

      const company = await prisma.company.create({
        data: {
          legalName: row.razaoSocial,
          tradeName,
          cnpj: cnpjValid ? cnpjDigits : null,
          emails: Array.from(emails),
          phones: Array.from(phones),
          tags: ['Prospect Vibra Energy', row.sheet],
          customFields: {
            origem: 'Importação Vibra Energy Dez/2024',
            modal: row.sheet,
            prodPrincipal: row.prodPrincipal || null,
            pdlt: row.pdlt || null,
            vendedorHistoricoPlanilha: row.vendedorHistorico || null,
            cnpjOriginalPlanilha: cnpjValid ? null : row.cnpjRaw,
          },
        },
      });
      companyId = company.id;
      companiesCreated++;

      let primaryContactId: string | null = null;
      if (row.directorName) {
        const contact = await prisma.contact.create({
          data: {
            name: row.directorName,
            role: 'Diretor',
            email: row.directorEmail && isLikelyEmail(row.directorEmail) ? row.directorEmail.toLowerCase() : null,
            phone: row.directorPhone || null,
            companyId,
            organizationId: orgId,
          },
        });
        primaryContactId = contact.id;
      }
      if (row.managerName) {
        const contact = await prisma.contact.create({
          data: {
            name: row.managerName,
            role: 'Gerente',
            email: row.managerEmail && isLikelyEmail(row.managerEmail) ? row.managerEmail.toLowerCase() : null,
            phone: row.managerPhone || null,
            companyId,
            organizationId: orgId,
          },
        });
        if (!primaryContactId) primaryContactId = contact.id;
      }

      const existingLead = await prisma.lead.findFirst({
        where: { organizationId: orgId, companyId, deletedAt: null },
      });
      if (existingLead) {
        leadsSkipped++;
      } else {
        await prisma.lead.create({
          data: {
            title: `Prospecção Vibra Energy — ${tradeName}`,
            source: 'Importação Vibra Energy Dez/2024',
            channel: 'Planilha',
            companyId,
            contactId: primaryContactId,
            owner: null,
            organizationId: orgId,
          },
        });
        leadsCreated++;
      }
      return;
    }

    // Empresa já existia (rerun idempotente) — garante que exista um lead vinculado.
    const existingLead = await prisma.lead.findFirst({
      where: { organizationId: orgId, companyId, deletedAt: null },
    });
    if (existingLead) {
      leadsSkipped++;
    } else {
      await prisma.lead.create({
        data: {
          title: `Prospecção Vibra Energy — ${tradeName}`,
          source: 'Importação Vibra Energy Dez/2024',
          channel: 'Planilha',
          companyId,
          owner: null,
          organizationId: orgId,
        },
      });
      leadsCreated++;
    }
  }

  console.log('\n=== Resumo da importação ===');
  console.log(`Empresas criadas: ${companiesCreated}`);
  console.log(`Empresas já existentes (puladas): ${companiesSkipped}`);
  console.log(`Leads criados: ${leadsCreated}`);
  console.log(`Leads já existentes (pulados): ${leadsSkipped}`);
  console.log(`CNPJs inválidos (empresa criada mesmo assim, sem CNPJ): ${invalidCnpj}`);
  if (skippedInvalidCnpj.length > 0) {
    console.log('Detalhe dos CNPJs inválidos:');
    skippedInvalidCnpj.forEach((s) => console.log(`  - ${s}`));
  }
}

async function main() {
  // Contra um banco remoto (Supabase, alta latência a partir daqui), a PRIMEIRA conexão do pool
  // (handshake TCP+TLS+auth) pode facilmente estourar o `connectionTimeoutMillis`/timeout de
  // transação interativa do Prisma se essa primeira conexão só for aberta dentro de uma
  // transação real. `$queryRawUnsafe` não passa pela extensão de transação (ver comentário em
  // withRlsContext, src/lib/prisma.ts) — é só uma query simples que força o pool a abrir e
  // "aquecer" uma conexão antes de qualquer `executeWithRls` real começar a contar seu próprio
  // timeout mais apertado.
  let warmupAttempt = 0;
  for (;;) {
    warmupAttempt++;
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      console.log(`Conexão aquecida (tentativa ${warmupAttempt}).`);
      break;
    } catch (err) {
      if (warmupAttempt >= 5) throw err;
      console.log(`Aquecimento falhou (tentativa ${warmupAttempt}), tentando de novo...`);
    }
  }

  await requestContext.run({ bypassRls: true }, async () => {
    const { orgId, credentials } = await seedUsers();
    await requestContext.run({ tenantId: orgId, bypassRls: true }, async () => {
      await seedLeads(orgId);
    });

    if (credentials.length > 0) {
      console.log('\n=== Credenciais geradas nesta execução ===');
      for (const { email, password } of credentials) {
        console.log(`${email} -> ${password}`);
      }
      console.log('=== Fim ===\n');
    }
  });
}

main()
  .catch((err) => {
    console.error('Falha na importação:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit(process.exitCode ?? 0);
  });
