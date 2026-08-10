import { describe, it, expect, afterEach } from 'vitest';
import { navigationBus } from '../navigationBus';

// Bloqueador #7 do AGENTS.md ("comando de voz que afirma navegar sem realizar navegação") — este
// contrato só pode reportar sucesso quando a navegação foi de fato disparada.
describe('navigationBus — contrato de navegação (destination id canônico + ack real)', () => {
    afterEach(() => {
        navigationBus.registerNavigator(null);
    });

    it('retorna false e não navega quando nenhum navegador foi registrado ainda', () => {
        const navigated = navigationBus.requestNavigation('crm');
        expect(navigated).toBe(false);
    });

    it('retorna false para um destino desconhecido, mesmo com navegador registrado', () => {
        let called = false;
        navigationBus.registerNavigator(() => { called = true; });

        const navigated = navigationBus.requestNavigation('destino-que-nao-existe');

        expect(navigated).toBe(false);
        expect(called).toBe(false);
    });

    it('retorna true e chama o navegador real para um TabType válido', () => {
        const calls: string[] = [];
        navigationBus.registerNavigator((tab) => calls.push(tab));

        const navigated = navigationBus.requestNavigation('intelligence');

        expect(navigated).toBe(true);
        expect(calls).toEqual(['intelligence']);
    });

    it('para de navegar depois que o navegador é desregistrado (cleanup do efeito)', () => {
        const calls: string[] = [];
        navigationBus.registerNavigator((tab) => calls.push(tab));
        navigationBus.registerNavigator(null);

        const navigated = navigationBus.requestNavigation('crm');

        expect(navigated).toBe(false);
        expect(calls).toEqual([]);
    });
});
