// scripts/security/backfill-contact-pii.ts
//
// Cifra em repouso (AES-256-GCM) e popula os índices cegos (HMAC-SHA256) de
// Contact.email/phone/whatsapp para linhas gravadas ANTES da extensão do Prisma
// (src/lib/prisma.ts) passar a cifrar esses campos automaticamente a cada create/update — ver
// src/lib/crypto/piiFields.ts.
//
// Sem rodar isto, contatos antigos continuam LEGÍVEIS (decryptField trata texto sem o prefixo
// `enc:v1:` como passthrough — nenhuma leitura quebra), mas ficam INVISÍVEIS pra toda busca exata
// que passou a comparar o índice em vez do campo cru (emailReply.webhook.ts, ownershipGuard.ts,
// voiceResult.webhook.ts, threecx.service.ts, whatsappMessage.service.ts,
// PrismaCadenceRateLimitPort.ts, deduplication.worker.ts, ContactService.findAll) até a próxima
// vez que cada contato for editado.
//
// Idempotente e seguro de rodar mais de uma vez: só toca linhas cujo email/phone/whatsapp ainda
// NÃO começa com o prefixo `enc:v1:` (ver secretFields.ts) — uma linha já migrada (por este script
// ou por uma edição normal via API) é pulada.
//
// `pg` direto (não o `prisma` exportado por src/lib/prisma.ts) de propósito, mesmo padrão de
// scripts/emergency-reset-all-passwords.ts — mas SEM usar `app.bypass_rls` para ler/escrever
// Contact: a policy `tenant_isolation_policy` de "Contact" (ver migration
// 20260722020322_enable_rls) só compara `current_setting('app.current_tenant_id') =
// "organizationId"` — diferente de "user"/"Organization"/outras tabelas da allowlist de
// `BYPASS_RLS_ALLOWED_MODELS` (src/lib/prisma.ts), Contact NUNCA aceitou bypass_rls (decisão
// deliberada: nenhum caminho do app real lê Contact de mais de um tenant de uma vez). Setar só
// `app.bypass_rls='on'` sem `app.current_tenant_id` faria este script rodar sem erro e sem migrar
// UMA linha sequer (RLS filtra tudo silenciosamente) — por isso o loop abaixo processa organização
// por organização, setando `app.current_tenant_id` a cada uma antes de tocar `Contact`
// (`app.bypass_rls='on'` continua setado só para conseguir listar TODAS as organizações via
// `Organization`, que SIM está na allowlist).
//
// Uso: DATABASE_URL=... CREDENTIALS_ENCRYPTION_KEY=... PII_BLIND_INDEX_KEY=... npx tsx scripts/security/backfill-contact-pii.ts [--dry-run]

import pg from 'pg';
import { encryptField } from '../../src/lib/crypto/secretFields.js';
import { computeContactPiiIndexes } from '../../src/lib/crypto/piiIndex.js';

const { Pool } = pg;

const BATCH_SIZE = 500;
const ENC_PREFIX = 'enc:v1:';
const dryRun = process.argv.includes('--dry-run');

type ContactRow = {
  id: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
};

function isPlaintext(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0 && !value.startsWith(ENC_PREFIX);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL é obrigatória.');
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    // `is_local=false` (sessão inteira, não só a transação corrente) de propósito: este script
    // roda fora de qualquer `BEGIN`, então cada `query()` é sua própria transação implícita — um
    // `set_config(..., true)` seria descartado antes da PRÓXIMA query rodar (mesma armadilha já
    // documentada em `executeWithRls`/`withRlsContext` em src/lib/prisma.ts, aqui sem a
    // transação interativa que resolve isso lá). `max: 1` acima garante que esta MESMA conexão
    // física é reusada em toda `client.query()` seguinte, então o valor de sessão persiste.
    //
    // Só para listar Organization (está na allowlist de bypass — ver comentário acima); Contact,
    // logo abaixo, precisa de `app.current_tenant_id` real por organização.
    await client.query(`SELECT set_config('app.bypass_rls', 'on', false)`);
    const { rows: orgs } = await client.query<{ id: string }>(`SELECT id FROM "Organization" ORDER BY id ASC`);

    let processed = 0;
    let migrated = 0;

    for (const org of orgs) {
      await client.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [org.id]);
      let lastId = '';

      for (;;) {
        // Keyset pagination por `id` (cuid, ordenável como string) — evita OFFSET (custoso e
        // instável sob escrita concorrente) numa organização que pode ter dezenas de milhares de
        // contatos.
        const { rows } = await client.query<ContactRow>(
          `SELECT id, email, phone, whatsapp FROM "Contact"
           WHERE "organizationId" = $1
             AND id > $2
             AND (
               (email IS NOT NULL AND email NOT LIKE $3)
               OR (phone IS NOT NULL AND phone NOT LIKE $3)
               OR (whatsapp IS NOT NULL AND whatsapp NOT LIKE $3)
             )
           ORDER BY id ASC
           LIMIT $4`,
          [org.id, lastId, `${ENC_PREFIX}%`, BATCH_SIZE],
        );
        if (rows.length === 0) break;

        for (const row of rows) {
          processed++;
          const email = isPlaintext(row.email) ? row.email : null;
          const phone = isPlaintext(row.phone) ? row.phone : null;
          const whatsapp = isPlaintext(row.whatsapp) ? row.whatsapp : null;
          if (!email && !phone && !whatsapp) continue; // já migrado ou vazio — nada a fazer
          migrated++;
          if (dryRun) continue;

          // Só entra no SET/params o campo que este lote está de fato tocando — uma linha
          // selecionada porque só `phone` ainda era texto puro (email/whatsapp já migrados numa
          // passada anterior, ou por uma escrita normal via API) não pode reescrever
          // "emailIndex"/"whatsappIndex" com null por cima do índice já correto.
          const sets: string[] = [];
          const params: unknown[] = [];
          const push = (column: string, value: unknown) => {
            params.push(value);
            sets.push(`"${column}" = $${params.length}`);
          };
          if (email) {
            const indexes = computeContactPiiIndexes({ email });
            push('email', encryptField(email));
            push('emailIndex', indexes.emailIndex);
            push('emailDomainIndex', indexes.emailDomainIndex);
          }
          if (phone) {
            const indexes = computeContactPiiIndexes({ phone });
            push('phone', encryptField(phone));
            push('phoneIndex', indexes.phoneIndex);
            push('phoneLast8Index', indexes.phoneLast8Index);
            push('phoneLast9Index', indexes.phoneLast9Index);
          }
          if (whatsapp) {
            const indexes = computeContactPiiIndexes({ whatsapp });
            push('whatsapp', encryptField(whatsapp));
            push('whatsappIndex', indexes.whatsappIndex);
            push('whatsappLast8Index', indexes.whatsappLast8Index);
            push('whatsappLast9Index', indexes.whatsappLast9Index);
          }
          params.push(row.id);
          // `WHERE id = $n AND "organizationId" = $orgParam` — defesa em profundidade (RLS já
          // restringe à organização corrente, mas explicitar o filtro custa nada e documenta a
          // intenção, mesmo padrão já usado em contact.service.ts/PrismaContactRepository.ts).
          params.push(org.id);
          await client.query(
            `UPDATE "Contact" SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND "organizationId" = $${params.length}`,
            params,
          );
        }

        lastId = rows[rows.length - 1].id;
      }
      console.log(`[backfill-contact-pii] organização ${org.id} concluída — total até agora: processados=${processed} migrados=${migrated}`);
    }

    console.log(
      `[backfill-contact-pii] concluído${dryRun ? ' (--dry-run, nenhuma escrita real)' : ''} — organizações=${orgs.length} processados=${processed} migrados=${migrated}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[backfill-contact-pii] falhou', error);
  process.exitCode = 1;
});
