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

    // Regressão — ver .agents/handoffs/onda-8/09-para-02-navigationbus-rotas-ausentes.md: 'enrich'
    // e 'prompts' existiam em TAB_ROUTE_SET sem nenhuma <Route> real correspondente em App.tsx (nem
    // entrada na Sidebar/Command Palette). Removidos na Onda 10 — o comando de voz/deep link agora
    // recusa esses dois destinos em vez de reportar sucesso e cair silenciosamente no catch-all.
    it('retorna false para "enrich" e "prompts" — removidos por não terem rota real (Onda 10)', () => {
        let called = false;
        navigationBus.registerNavigator(() => { called = true; });

        expect(navigationBus.requestNavigation('enrich')).toBe(false);
        expect(navigationBus.requestNavigation('prompts')).toBe(false);
        expect(called).toBe(false);
    });
});
