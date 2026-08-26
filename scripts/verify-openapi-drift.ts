/**
 * CLI da verificação estática de deriva entre `docs/openapi.yaml` e as rotas reais montadas no
 * composition root da aplicação (`server.ts` + `src/bootstrap/*.ts`, ver ITEM-07).
 * Não precisa de servidor rodando nem de Postgres/Redis — só do checkout do repositório, por isso
 * pode rodar em qualquer job de CI (ver handoff `.agents/handoffs/onda-8/
 * 18-para-08-ci-openapi-drift.md` pedindo para o Agente 08 conectar isto ao workflow de CI).
 *
 * Uso: `npm run verify:openapi-drift`. Sai com código 1 e imprime a tabela de divergência quando
 * há prefixo de rota montado sem documentação, ou path documentado sem rota real correspondente.
 *
 * Escopo: ver o comentário no topo de `src/shared/contracts/openapiRouteInventory.ts` — esta
 * verificação é estrutural (prefixo de rota existe/documentado), não valida método/parâmetro/
 * corpo/status code por endpoint.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { computeOpenApiDrift, collectCompositionRootSource } from '../src/shared/contracts/openapiRouteInventory.js';

function main(): void {
    const repoRoot = process.cwd();
    const openapiYamlPath = path.join(repoRoot, 'docs', 'openapi.yaml');

    const compositionRootSource = collectCompositionRootSource(repoRoot);
    const openapiDocument = parseYaml(readFileSync(openapiYamlPath, 'utf-8'));

    const result = computeOpenApiDrift(compositionRootSource, openapiDocument.paths ?? {});

    console.log(`Prefixos de rota montados no composition root: ${result.allMountedPrefixes.length}`);
    console.log(`Paths documentados em docs/openapi.yaml: ${result.allDocumentedPaths.length}`);
    console.log('');

    let hasDrift = false;

    if (result.undocumentedPrefixes.length > 0) {
        hasDrift = true;
        console.error('❌ Prefixos de rota montados SEM documentação em docs/openapi.yaml:');
        for (const prefix of result.undocumentedPrefixes) {
            console.error(`   - /api/${prefix}`);
        }
        console.error('');
    }

    if (result.phantomDocumentedPaths.length > 0) {
        hasDrift = true;
        console.error('❌ Paths documentados em docs/openapi.yaml SEM rota real montada no composition root:');
        for (const docPath of result.phantomDocumentedPaths) {
            console.error(`   - ${docPath}`);
        }
        console.error('');
    }

    if (hasDrift) {
        console.error(
            'Deriva de OpenAPI detectada. Documente a(s) rota(s) nova(s) em docs/openapi.yaml, ou ' +
            'remova/ajuste o path documentado se a rota não existir mais. Ver ' +
            'src/shared/contracts/openapiRouteInventory.ts para o critério exato desta verificação.'
        );
        process.exitCode = 1;
        return;
    }

    console.log('✅ Nenhuma deriva estrutural encontrada entre docs/openapi.yaml e o composition root.');
}

main();
