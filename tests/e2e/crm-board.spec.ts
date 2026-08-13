import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

test.describe('CRM Board', () => {
    test.beforeEach(async ({ page }) => {
        // Não existe bypass de auth real neste app (ALLOW_DEV_AUTH_BYPASS é só uma guarda de
        // ambiente em src/config/env.ts, nunca consumida para pular login) — precisa de signup real,
        // mesmo padrão de crm-kanban.spec.ts, senão /app/crm redireciona para /login e os cabeçalhos
        // de coluna nunca aparecem.
        await signUp(page, { email: uniqueTestEmail('board') });
        await page.goto('/app/crm');
    });

    test('should load the Kanban board', async ({ page }) => {
        // Verifica se os cabeçalhos das colunas estão visíveis
        await expect(page.getByText('Lead')).toBeVisible();
        await expect(page.getByText('Qualificado')).toBeVisible();
        await expect(page.getByText('Agendado')).toBeVisible();
        await expect(page.getByText('Negociação')).toBeVisible();
        await expect(page.getByText('Ganho')).toBeVisible();
        await expect(page.getByText('Perdido')).toBeVisible();
    });

    test('should allow dragging a card', async ({ page }) => {
        // Localiza um card na primeira coluna (Lead)
        const firstCard = page.locator('[data-rbd-draggable-id]').first();
        
        // Verifica se existe pelo menos um card
        if (await firstCard.isVisible()) {
            const dragHandle = firstCard.locator('[data-rbd-drag-handle-context-id]');
            
            // Pega o target da coluna "Qualificado"
            const qualificadoColumn = page.locator('[data-rbd-droppable-id="QUALIFICADO"]');
            
            // Simula o drag and drop
            await dragHandle.dragTo(qualificadoColumn);
            
            // Verifica se um toast de sucesso apareceu (opcional/dependente da implementação)
            // await expect(page.locator('.toast-success')).toBeVisible();
        }
    });
});
