import 'dotenv/config';

import { studioService, type StudioGenerationRequest } from '../src/features/intelligence/services/studio.service.js';

const brand = {
    name: 'AtlasGR',
    description: 'Gestão de risco de carga, scoring inteligente e prospecção B2B.',
};

const checks: StudioGenerationRequest[] = [
    {
        kind: 'email',
        brand,
        inputs: {
            companyName: 'Empresa de Teste',
            contactName: 'Marina',
            sector: 'Logística',
            role: 'Diretora de Operações',
            technologies: ['TMS', 'Telemetria'],
            companySize: 'Médio porte',
            tone: 'consultative',
        },
    },
    {
        kind: 'b2b_matrix',
        brand,
        inputs: {
            icp: 'Diretoria de operações de transportadoras de médio porte',
            solution: 'Gestão de risco e tratamento de ocorrências',
        },
    },
];

async function main(): Promise<void> {
    for (const request of checks) {
        const startedAt = Date.now();
        const result = await studioService.generate(request);
        if (!result || typeof result !== 'object') {
            throw new Error(`Resposta inválida para ${request.kind}`);
        }
        console.log(JSON.stringify({
            kind: request.kind,
            ok: true,
            fields: Object.keys(result),
            latencyMs: Date.now() - startedAt,
        }));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
