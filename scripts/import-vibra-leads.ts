// Importação pontual: leads do Evento Vibra (planilha "Prospect_Vibra.xlsx", aba "Rodoviário")
// para dentro do CRM, como pedido pelo usuário em 2026-08-29 — cria Company + Contact(s) + Lead
// por linha, reusando `promoteToCrm` (o MESMO caminho que POST /api/prospecting/promote usa,
// chamado pela tela de Prospecção) para herdar de graça: dedup por CNPJ (`resolveCompanyIdentity`),
// normalização de CNPJ, rotulagem LGPD do contato, timeline de criação e push automático pro
// Bitrix se a organização tiver conexão. `autoEnrich: false` de propósito — o usuário disse que vai
// enriquecer manualmente depois pela tela, então este script não gasta crédito de CNPJ/Apollo por
// conta própria.
//
// Uso (dry-run por padrão — só imprime o que faria, não escreve nada):
//   npx tsx scripts/import-vibra-leads.ts --list-orgs
//   npx tsx scripts/import-vibra-leads.ts --org "Nome exato da organização"
//   npx tsx scripts/import-vibra-leads.ts --org "Nome exato da organização" --apply
//
// Por padrão lê ./Prospect_Vibra.xlsx na raiz do repo — copie o arquivo enviado pra lá antes de
// rodar, ou aponte outro caminho com --file.

import path from 'node:path';
import ExcelJS from 'exceljs';
import { prisma } from '../src/lib/prisma.js';
import { requestContext } from '../src/lib/async-context.js';
import { promoteToCrm } from '../src/features/prospecting/services/prospecting/promote.js';

const SOURCE = 'Evento Vibra';
const EVENT_TAG = 'Evento Vibra';

interface RawRow {
  cnpj: string;
  transp: string;
  razaoSocial: string;
  vendedor: string | null;
  pdlt: string | null;
  produto: string | null;
  dirNome: string | null;
  dirEmail: string | null;
  dirTel: string | null;
  gerNome: string | null;
  gerEmail: string | null;
  gerTel: string | null;
  gerTel2: string | null;
}

function cell(row: ExcelJS.Row, col: number): string | null {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return null;
  let s: string;
  if (typeof v === 'object' && 'richText' in v && Array.isArray(v.richText)) {
    // Célula com múltiplos runs de formatação (ex.: negrito parcial) — ExcelJS devolve
    // { richText: [{ text, font }, ...] } em vez de string simples; concatena os runs.
    s = v.richText.map((run) => run.text ?? '').join('');
  } else if (typeof v === 'object' && 'text' in v) {
    s = String(v.text);
  } else {
    s = String(v);
  }
  const trimmed = s.replace(/\s+/g, ' ').trim();
  return trimmed.length ? trimmed : null;
}

async function readMainSheet(filePath: string): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Rodoviário');
  if (!sheet) throw new Error('Aba "Rodoviário" não encontrada na planilha.');

  const rows: RawRow[] = [];
  // Cabeçalho ocupa as linhas 1-2 (mesclado) — dados começam na linha 3.
  for (let r = 3; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const razaoSocial = cell(row, 3);
    const cnpj = cell(row, 1);
    if (!razaoSocial || !cnpj) continue; // linhas em branco no fim da planilha
    rows.push({
      cnpj,
      transp: cell(row, 2) || '',
      razaoSocial,
      vendedor: cell(row, 4),
      pdlt: cell(row, 5),
      produto: cell(row, 6),
      dirNome: cell(row, 7),
      dirEmail: cell(row, 8),
      dirTel: cell(row, 9),
      gerNome: cell(row, 10),
      gerEmail: cell(row, 11),
      gerTel: cell(row, 12),
      gerTel2: cell(row, 13),
    });
  }
  return rows;
}

async function readExtraEmails(filePath: string): Promise<Map<string, string[]>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Planilha1');
  const map = new Map<string, string[]>();
  if (!sheet) return map;

  sheet.eachRow((row) => {
    const code = cell(row, 1);
    const emailsRaw = cell(row, 2);
    if (!code || !emailsRaw) return;
    const emails = emailsRaw
      .split(';')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    map.set(code.trim().toUpperCase(), emails);
  });
  return map;
}

function uniq(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v && v.trim()))));
}

async function main() {
  const args = process.argv.slice(2);
  const isApply = args.includes('--apply');
  const listOrgs = args.includes('--list-orgs');
  const orgFlagIdx = args.indexOf('--org');
  const orgName = orgFlagIdx >= 0 ? args[orgFlagIdx + 1] : undefined;
  const fileFlagIdx = args.indexOf('--file');
  const filePath =
    fileFlagIdx >= 0 ? args[fileFlagIdx + 1] : path.join(process.cwd(), 'Prospect_Vibra.xlsx');
  const userFlagIdx = args.indexOf('--user');
  const userEmail = userFlagIdx >= 0 ? args[userFlagIdx + 1] : undefined;

  // Organization e user têm FORCE ROW LEVEL SECURITY (prisma/migrations/20260722020322_enable_rls)
  // — sem app.current_tenant_id (que ainda não existe nesta fase, antes de sabermos o id da
  // organização) nem bypass explícito, toda leitura aqui volta vazia mesmo com dados existindo.
  // Ambos os models estão no allowlist de bypass (src/lib/prisma.ts, BYPASS_RLS_ALLOWED_MODELS),
  // então usamos requestContext.run({ bypassRls: true }, ...) só nestas duas consultas de
  // bootstrap — o restante do script já roda com tenantId real (linha ~181 em diante).

  if (listOrgs) {
    const orgs = await requestContext.run({ bypassRls: true }, () =>
      prisma.organization.findMany({ select: { id: true, name: true } }),
    );
    console.log('\nOrganizações disponíveis:');
    for (const o of orgs) console.log(`  - "${o.name}"  (id: ${o.id})`);
    console.log('\nRode de novo com --org "Nome exato" para importar.');
    return;
  }

  if (!orgName) {
    console.error(
      'Faltou --org "Nome exato da organização". Rode com --list-orgs para ver as opções.',
    );
    process.exitCode = 1;
    return;
  }

  const org = await requestContext.run({ bypassRls: true }, () =>
    prisma.organization.findUnique({ where: { name: orgName } }),
  );
  if (!org) {
    console.error(
      `Organização "${orgName}" não encontrada. Rode com --list-orgs para ver as opções.`,
    );
    process.exitCode = 1;
    return;
  }

  // Já sabemos o tenant aqui — basta o match normal de tenant (sem bypass) pra ler o "user".
  const actingUser = await requestContext.run({ tenantId: org.id }, () =>
    userEmail
      ? prisma.user.findFirst({ where: { organizationId: org.id, email: userEmail } })
      : prisma.user.findFirst({
          where: { organizationId: org.id, role: { in: ['ADMIN', 'GESTOR'] } },
        }),
  );
  if (!actingUser) {
    console.error(
      `Nenhum usuário ADMIN/GESTOR encontrado na organização "${orgName}" (ou --user informado não existe). ` +
        'Necessário para o contexto de auditoria/RLS das escritas.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\n=== Import Evento Vibra (${isApply ? 'APPLY' : 'DRY-RUN'}) ===`);
  console.log(`Organização: ${org.name} (${org.id})`);
  console.log(`Usuário atuante (contexto/auditoria): ${actingUser.email} (${actingUser.role})`);
  console.log(`Arquivo: ${filePath}\n`);

  const rows = await readMainSheet(filePath);
  const extraEmailsByCode = await readExtraEmails(filePath);

  const mainCodes = new Set(rows.map((r) => r.transp.toUpperCase()));
  const orphanCodes = [...extraEmailsByCode.keys()].filter((c) => !mainCodes.has(c));
  if (orphanCodes.length) {
    console.log(
      `Aviso: ${orphanCodes.length} código(s) na aba "Planilha1" sem empresa correspondente na aba ` +
        `"Rodoviário" (só têm e-mails, sem CNPJ/razão social — NÃO importados): ${orphanCodes.join(', ')}\n`,
    );
  }

  let created = 0;
  let reused = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await requestContext.run(
        { tenantId: org.id, userId: actingUser.id, role: actingUser.role },
        async () => {
          const extraEmails = extraEmailsByCode.get(row.transp.toUpperCase()) || [];

          if (!isApply) {
            console.log(
              `[DRY-RUN] Criaria: ${row.razaoSocial} (CNPJ ${row.cnpj}) — Diretor: ${row.dirNome || '—'}, ` +
                `Gerente: ${row.gerNome || '—'}, e-mails extra: ${extraEmails.length}`,
            );
            return;
          }

          const result = await promoteToCrm({
            tradeName: row.razaoSocial,
            legalName: row.razaoSocial,
            cnpj: row.cnpj,
            segment: 'Transporte Rodoviário de Cargas',
            source: SOURCE,
            contact: row.dirNome ? { name: row.dirNome, role: 'Diretor' } : null,
            autoEnrich: false,
            organizationId: org.id,
            phone: row.dirTel || row.gerTel || null,
          });

          if ((result.lead as { alreadyExists?: boolean }).alreadyExists) {
            console.log(
              `  [JÁ EXISTE] ${row.razaoSocial} (CNPJ ${row.cnpj}) — pulado, lead aberto já existe.`,
            );
            reused++;
            return;
          }

          const companyId = result.lead.companyId;
          const leadId = result.lead.id;
          const dirContactId = result.lead.contactId;

          // Diretor: promoteToCrm já criou o Contact, mas sem e-mail/telefone (PromoteInput não
          // carrega esses campos pro contato inline) — completa aqui.
          if (dirContactId && (row.dirEmail || row.dirTel)) {
            await prisma.contact.update({
              where: { id: dirContactId },
              data: { email: row.dirEmail || undefined, phone: row.dirTel || undefined },
            });
          }

          // Gerente: segundo contato da mesma empresa, não coberto por promoteToCrm.
          if (row.gerNome) {
            await prisma.contact.create({
              data: {
                name: row.gerNome,
                role: 'Gerente',
                companyId,
                organizationId: org.id,
                status: 'Ativo',
                email: row.gerEmail || null,
                phone: row.gerTel || null,
                observations: `Contato sugerido — confirmar identidade e dados antes da abordagem.\n[LGPD] Origem: ${SOURCE} | Base Legal: Consentimento/Público`,
              },
            });
          }

          const allEmails = uniq([row.dirEmail, row.gerEmail, ...extraEmails]);
          const allPhones = uniq([row.dirTel, row.gerTel, row.gerTel2]);

          const currentCompany = await prisma.company.findUnique({
            where: { id: companyId },
            select: { tags: true, customFields: true },
          });
          const existingTags = currentCompany?.tags || [];
          const existingCustomFields =
            (currentCompany?.customFields as Record<string, unknown>) || {};

          await prisma.company.update({
            where: { id: companyId },
            data: {
              emails: allEmails,
              phones: allPhones,
              tags: existingTags.includes(EVENT_TAG) ? existingTags : [...existingTags, EVENT_TAG],
              customFields: {
                ...existingCustomFields,
                evento: 'Vibra',
                marca: 'AtlasGR',
                transpCode: row.transp || null,
                vendedorResponsavel: row.vendedor || null,
                pdlt: row.pdlt || null,
                produtoPrincipal: row.produto || null,
              },
            },
          });

          await prisma.lead.update({
            where: { id: leadId },
            data: {
              customFields: {
                evento: 'Vibra',
                marca: 'AtlasGR',
                vendedorResponsavel: row.vendedor || null,
              },
            },
          });

          console.log(`  [OK] ${row.razaoSocial} (CNPJ ${row.cnpj}) — lead ${leadId}`);
          created++;
        },
      );
    } catch (err) {
      failed++;
      console.error(`  [ERRO] ${row.razaoSocial} (CNPJ ${row.cnpj}):`, (err as Error).message);
    }
  }

  console.log(`\n=== RESULTADO ===`);
  console.log(`Linhas na planilha: ${rows.length}`);
  if (isApply) {
    console.log(`Criados: ${created}`);
    console.log(`Já existiam (pulados): ${reused}`);
    console.log(`Erros: ${failed}`);
  } else {
    console.log('Nenhuma escrita feita (dry-run). Rode de novo com --apply para efetivar.');
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
