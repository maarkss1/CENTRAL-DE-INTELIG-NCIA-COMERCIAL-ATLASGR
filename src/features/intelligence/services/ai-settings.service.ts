import { prisma } from '../../../lib/prisma.js';

interface AiSettingInput {
    toolKey: string;
    provider: string;
    model: string;
    temperature: number;
}

export async function listAiSettings() {
    return prisma.aiEngineSetting.findMany({ orderBy: { toolKey: 'asc' } });
}

export async function saveAiSettings(settings: AiSettingInput[]) {
    return prisma.$transaction(
        settings.map((s) =>
            prisma.aiEngineSetting.upsert({
                where: { toolKey: s.toolKey },
                update: { provider: s.provider, model: s.model, temperature: s.temperature },
                create: s,
            }),
        ),
    );
}
