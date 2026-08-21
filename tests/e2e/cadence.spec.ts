import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

/**
 * CYC-009 (onda 29) — cobertura E2E da tela de cadência (`/app/cadence`), que até esta rodada só
 * tinha teste manual/leitura. Cria sequência e inicia run pela UI real (mesmo padrão de
 * `crm.spec.ts`/`leads-crud.spec.ts`: sessão de cookies real via `signUp`, sem atalho de seed
 * direto no banco para o que a UI já expõe), depois exercita pausar/retomar/parar — o gap que este
 * item veio fechar (`docs/CADENCE-CYCLE-AUDIT.md`, CYC-009).
 */

test.describe('Cadência — UI de escrita (criar sequência, iniciar/pausar/retomar/parar run)', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('cadence') });
  });

  test('cria sequência, inicia cadência para um lead e pausa/retoma/para pela UI', async ({ page }) => {
    // Lead real via API autenticada (mesmo padrão de leads-crud.spec.ts) — a tela de cadência não
    // tem seletor de lead, só um campo de texto pro id, então precisamos de um lead de verdade.
    const leadRes = await page.request.post('/api/leads', {
      data: { status: 'Lead Recebido', source: 'e2e-cadence-test' },
    });
    expect(leadRes.status()).toBe(201);
    const leadId = (await leadRes.json()).data.id as string;

    await page.getByRole('button', { name: 'Cadência', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/cadence$/);
    await waitForAppReady(page);

    // Nova sequência
    await page.getByRole('button', { name: 'Nova sequência' }).click();
    await page.getByLabel('Nome da sequência').fill(`Sequência E2E ${Date.now()}`);
    await page.getByLabel(/Conteúdo da mensagem/).fill('Olá! Mensagem de teste automatizado.');
    await page.getByRole('button', { name: 'Criar sequência' }).click();
    await expect(page.getByRole('button', { name: 'Criar sequência' })).not.toBeVisible();

    // Iniciar cadência
    await page.getByRole('button', { name: 'Iniciar cadência' }).click();
    await page.getByLabel('ID do lead').fill(leadId);
    await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).not.toBeVisible();

    // A execução recém-criada aparece na tabela, com status "Ativa" e ações reais.
    const runRow = page.locator('tr', { has: page.locator(`[title="${leadId}"]`) });
    await expect(runRow).toBeVisible();
    await expect(runRow.getByText('Ativa', { exact: true })).toBeVisible();

    // Pausar
    await runRow.getByRole('button', { name: `Pausar cadência do lead ${leadId}` }).click();
    await expect(runRow.getByText('Pausada', { exact: true })).toBeVisible();

    // Retomar
    await runRow.getByRole('button', { name: `Retomar cadência do lead ${leadId}` }).click();
    await expect(runRow.getByText('Ativa', { exact: true })).toBeVisible();

    // Parar — irreversível, exige confirmação (window.confirm)
    page.once('dialog', (dialog) => dialog.accept());
    await runRow.getByRole('button', { name: `Parar cadência do lead ${leadId}` }).click();

    // O filtro padrão da tela mostra só Ativa+Pausada (evita listar todo o histórico morto por
    // padrão) — um run recém-parado só reaparece depois de ativar o filtro "Encerrada".
    await page.getByRole('button', { name: 'Encerrada', exact: true }).click();
    await expect(runRow.getByText('Encerrada', { exact: true })).toBeVisible();
    await expect(runRow.getByText('Parada manual', { exact: true })).toBeVisible();

    // Terminal: sem botões de ação restantes na linha.
    await expect(runRow.getByRole('button', { name: /Pausar|Retomar|Parar/ })).toHaveCount(0);
  });

  test('cancelar a confirmação de "Parar" mantém a cadência ativa', async ({ page }) => {
    const leadRes = await page.request.post('/api/leads', {
      data: { status: 'Lead Recebido', source: 'e2e-cadence-cancel-test' },
    });
    const leadId = (await leadRes.json()).data.id as string;

    await page.getByRole('button', { name: 'Cadência', exact: true }).click();
    await waitForAppReady(page);

    await page.getByRole('button', { name: 'Nova sequência' }).click();
    await page.getByLabel('Nome da sequência').fill(`Sequência E2E cancel ${Date.now()}`);
    await page.getByLabel(/Conteúdo da mensagem/).fill('Mensagem de teste.');
    await page.getByRole('button', { name: 'Criar sequência' }).click();
    await expect(page.getByRole('button', { name: 'Criar sequência' })).not.toBeVisible();

    await page.getByRole('button', { name: 'Iniciar cadência' }).click();
    await page.getByLabel('ID do lead').fill(leadId);
    await page.getByRole('button', { name: 'Iniciar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Iniciar', exact: true })).not.toBeVisible();

    const runRow = page.locator('tr', { has: page.locator(`[title="${leadId}"]`) });
    await expect(runRow.getByText('Ativa', { exact: true })).toBeVisible();

    page.once('dialog', (dialog) => dialog.dismiss());
    await runRow.getByRole('button', { name: `Parar cadência do lead ${leadId}` }).click();
    await expect(runRow.getByText('Ativa', { exact: true })).toBeVisible();
  });
});
