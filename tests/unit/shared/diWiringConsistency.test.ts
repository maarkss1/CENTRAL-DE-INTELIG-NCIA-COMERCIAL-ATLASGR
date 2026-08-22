import { describe, expect, it } from 'vitest';
import path from 'path';
import { checkControllerWiring, checkRepoControllerWiring } from '../../../src/shared/di/wiringConsistency.js';

/**
 * Cobre o débito descrito em `docs/ADR/ADR-002-Clean-Architecture.md` ("wiring manual em
 * src/shared/di/setup.ts, exigindo disciplina do time"): um Controller registrado no
 * container sem que nenhuma rota da mesma feature o resolva de fato é sinal de que a rota
 * ficou presa numa implementação legada (foi o caso real de `notes/routes/note.routes.ts`,
 * que chamava `noteService` diretamente enquanto `NoteController`/`NoteUseCases` já existiam
 * e estavam registrados em `setup.ts`, nunca usados em produção).
 */
describe('checkRepoControllerWiring', () => {
    it('todo Controller de presentation/ é resolvido por pelo menos uma rota da mesma feature (repositório real)', () => {
        const featuresDir = path.resolve(__dirname, '../../../src/features');
        const results = checkRepoControllerWiring(featuresDir);

        // Sanity: garante que a varredura real encontrou features com Controller — se cair para 0,
        // a extração provavelmente quebrou silenciosamente (falso "sem débito").
        expect(results.length).toBeGreaterThan(5);

        const unwired = results.filter((result) => !result.wired);
        expect(unwired).toEqual([]);
    });
});

describe('checkControllerWiring', () => {
    it('FALHA (reporta wired: false) quando uma rota não resolve o Controller registrado para a feature', () => {
        const results = checkControllerWiring(
            ['notes'],
            () => ['NoteController'],
            () => ["router.get('/', (req, res) => noteService.findByLead(req, res));"],
        );

        expect(results).toEqual([{ feature: 'notes', controller: 'NoteController', wired: false }]);
    });

    it('reporta wired: true quando a rota resolve o Controller via container', () => {
        const results = checkControllerWiring(
            ['notes'],
            () => ['NoteController'],
            () => ["router.get('/', (req, res) => container.resolve<NoteController>('NoteController').getNotesByLead(req, res));"],
        );

        expect(results).toEqual([{ feature: 'notes', controller: 'NoteController', wired: true }]);
    });

    it('ignora feature sem pasta routes/ (nenhum resultado, sem falso positivo)', () => {
        const results = checkControllerWiring(
            ['gamification'],
            () => ['SomeController'],
            () => [],
        );

        expect(results).toEqual([]);
    });
});
