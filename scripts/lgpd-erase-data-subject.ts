import { eraseDataSubject } from '../src/shared/services/dataSubjectErasure.service.js';
import { prisma } from '../src/lib/prisma.js';

// Job administrativo para atender exercício de direito do titular (LGPD art. 18 — exclusão ou
// anonimização de dado pessoal). A decisão de ACIONAR isto (verificar identidade do titular,
// prazo legal, etc.) é de negócio/operação — ver /AGENTS.md → "LGPD e dados pessoais". Este script
// só executa o mecanismo técnico, dado o id do contato e da organização já confirmados.
//
// Uso: npx tsx scripts/lgpd-erase-data-subject.ts <organizationId> <contactId>

async function main() {
    const [organizationId, contactId] = process.argv.slice(2);
    if (!organizationId || !contactId) {
        console.error('Uso: npx tsx scripts/lgpd-erase-data-subject.ts <organizationId> <contactId>');
        console.error(
            'Anonimiza irreversivelmente os dados pessoais de um Contact (nome, telefone, WhatsApp, ' +
            'e-mail, LinkedIn, data de nascimento, observações, customFields) e mascara o corpo das ' +
            'mensagens de WhatsApp ligadas a ele. Não apaga o histórico comercial (Lead/negócio) associado.',
        );
        process.exit(1);
    }

    const result = await eraseDataSubject({ organizationId, contactId });
    console.log(JSON.stringify(result, null, 2));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
