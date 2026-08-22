import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Verificação estática do débito nomeado em `docs/ADR/ADR-002-Clean-Architecture.md`
 * ("wiring manual em src/shared/di/setup.ts, exigindo disciplina do time"): um Controller
 * pode estar registrado no container de DI sem que nenhuma rota da feature efetivamente o
 * resolva — a feature "Notes" tinha exatamente esse gap (rota chamando um service legado
 * direto, o Controller/UseCases registrados nunca eram usados em produção).
 */
export interface ControllerWiringCheck {
    feature: string;
    controller: string;
    wired: boolean;
}

export function checkControllerWiring(
    features: string[],
    getControllerNames: (feature: string) => string[],
    getRouteFileContents: (feature: string) => string[],
): ControllerWiringCheck[] {
    const results: ControllerWiringCheck[] = [];

    for (const feature of features) {
        const controllers = getControllerNames(feature);
        if (controllers.length === 0) continue;

        const routeContents = getRouteFileContents(feature);
        if (routeContents.length === 0) continue;

        for (const controller of controllers) {
            const wired = routeContents.some((source) => source.includes(`resolve<${controller}>`));
            results.push({ feature, controller, wired });
        }
    }

    return results;
}

export function checkRepoControllerWiring(featuresDir: string): ControllerWiringCheck[] {
    const features = readdirSync(featuresDir).filter((entry) => existsSync(join(featuresDir, entry, 'presentation')));

    return checkControllerWiring(
        features,
        (feature) => {
            const presentationDir = join(featuresDir, feature, 'presentation');
            return readdirSync(presentationDir)
                .filter((file) => file.endsWith('Controller.ts'))
                .map((file) => file.replace(/\.ts$/, ''));
        },
        (feature) => {
            const routesDir = join(featuresDir, feature, 'routes');
            if (!existsSync(routesDir)) return [];
            return readdirSync(routesDir)
                .filter((file) => file.endsWith('.ts'))
                .map((file) => readFileSync(join(routesDir, file), 'utf-8'));
        },
    );
}
