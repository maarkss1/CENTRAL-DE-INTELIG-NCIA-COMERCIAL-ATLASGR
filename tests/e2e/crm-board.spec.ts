import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

test.describe('CRM Board', () => {
    test.beforeEach(async ({ page }) => {
        // O app não possui bypass real de autenticação no E2E. Criar uma sessão real evita o
        // falso negativo de acessar /app/crm e, na prática, estar olhando para /login.
        await signUp(page, { email: uniqueTestEmail('board') });
        await page.goto('/app/crm');
    });

    test('carrega o Kanban do funil de Leads com as etapas reais', async ({ page }) => {
        await expect(page.getByRole('heading', { name: /Leads e pré-vendas/ })).toBeVisible();

        // O teste antigo procurava "Lead" com getByText() e caía em strict-mode porque a palavra
        // aparece no título, texto explicativo, aba e nomes de etapas. Usamos roles + nomes reais
        // do pipeline para validar exatamente os cabeçalhos que importam.
        await expect(page.getByRole('heading', { name: 'Lead Recebido' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Cadência Iniciada' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Qualificação (SDR)' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Reunião Agendada' })).toBeVisible();
    });

    test('exibe a aba de Leads como seleção ativa', async ({ page }) => {
        await expect(page.getByRole('button', { name: 'Leads', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });

    // Drag por mouse, teclado, rollback, persistência e coluna vazia são cobertos em
    // crm-kanban.spec.ts. O teste legado daqui usava seletores data-rbd-* de react-beautiful-dnd;
    // como o board atual usa dnd-kit, ele simplesmente pulava a asserção quando o card não era
    // encontrado e podia ficar verde sem testar nada. Removido para evitar cobertura fantasma.
});
