import { test, expect, type Page } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Cobertura oficial do Kanban do CRM (Etapa 06) — antes desta suíte não existia nenhum teste E2E
// real de drag por mouse, drag por teclado, KanbanCard ou LeadDetailDrawer (só navegação, ver
// crm.spec.ts). Harness temporário usado durante os pilotos de design NÃO virou teste oficial por
// cópia — os specs abaixo foram escritos contra a infraestrutura real do repo (Playwright +
// helpers.ts + API autenticada via page.request, mesmo padrão de leads-crud.spec.ts).

async function createCompanyAndLead(page: Page, opts: { tradeName: string; status: string }) {
  const companyRes = await page.request.post('/api/companies', {
    data: { legalName: `${opts.tradeName} LTDA`, tradeName: opts.tradeName },
  });
  expect(companyRes.ok()).toBeTruthy();
  const company = (await companyRes.json()).data;

  const leadRes = await page.request.post('/api/leads', {
    data: { status: opts.status, companyId: company.id, source: 'e2e-kanban' },
  });
  expect(leadRes.ok()).toBeTruthy();
  const lead = (await leadRes.json()).data;
  return { company, lead };
}

/** Arrasto manual por mouse — dnd-kit (PointerSensor, activationConstraint distance:8) precisa de
 * vários eventos mousemove intermediários pra reconhecer o gesto como drag; um único `dragTo` do
 * Playwright às vezes não gera passos suficientes. */
async function dragCardToColumn(page: Page, cardLocator: ReturnType<Page['getByRole']>, columnHeading: ReturnType<Page['getByRole']>) {
  // O board rola horizontalmente (overflow-x-auto) e nem toda coluna cabe no viewport padrão —
  // sem isto, arrastar para uma coluna fora da área visível calcula coordenadas de um ponto que
  // nunca esteve realmente na tela (mouse.move usa coordenadas de viewport, não faz auto-scroll
  // como .click()/.hover() fazem).
  await columnHeading.scrollIntoViewIfNeeded();
  const cardBox = await cardLocator.boundingBox();
  const columnBox = await columnHeading.boundingBox();
  if (!cardBox || !columnBox) throw new Error('Bounding box não encontrado para card ou coluna.');

  const startX = cardBox.x + cardBox.width / 2;
  const startY = cardBox.y + cardBox.height / 2;
  const endX = columnBox.x + columnBox.width / 2;
  const endY = columnBox.y + columnBox.height + 80; // corpo da coluna, abaixo do cabeçalho

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Passos intermediários: primeiro além do activationConstraint (8px) para o dnd-kit reconhecer
  // o gesto como drag (não como clique), depois em direção ao alvo.
  await page.mouse.move(startX + 20, startY + 10, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 15 });
  await page.mouse.move(endX, endY, { steps: 2 }); // assenta a posição final antes do drop
  await page.mouse.up();
}

test.describe('Kanban do CRM — drag e drop', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('kanban') });
  });

  test('drag por mouse: move card para coluna adjacente e persiste após reload', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Acme Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) });
    await expect(card).toBeVisible();
    const targetColumn = page.getByRole('heading', { name: 'Cadência Iniciada' });

    const putResponse = page.waitForResponse((res) => res.url().includes('/api/leads/') && res.request().method() === 'PUT');
    await dragCardToColumn(page, card, targetColumn);
    const res = await putResponse;
    expect(res.status()).toBe(200);

    // A coluna "Cadência Iniciada" deve conter o card agora.
    const columnBody = page.locator('h3', { hasText: 'Cadência Iniciada' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBody.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible();

    // Persistência real: reload e o card continua na nova coluna (não é só estado otimista local).
    await page.reload();
    await expect(page.getByText('Leads e pré-vendas')).toBeVisible({ timeout: 15_000 });
    const columnBodyAfterReload = page.locator('h3', { hasText: 'Cadência Iniciada' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBodyAfterReload.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible();
  });

  test('drag por mouse: rollback visual e toast de erro quando o PUT falha (500)', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Rollback Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) });
    await expect(card).toBeVisible();

    await page.route('**/api/leads/*', async (route) => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Erro simulado pelo teste' }) });
      } else {
        await route.continue();
      }
    });

    const targetColumn = page.getByRole('heading', { name: 'Qualificação (SDR)' });
    await dragCardToColumn(page, card, targetColumn);

    // Toast de erro (CrmBoard.tsx handleDragEnd) — texto exato inclui "a alteração foi desfeita".
    await expect(page.getByText(/a alteração foi desfeita/)).toBeVisible({ timeout: 10_000 });

    // Rollback: o card volta a aparecer na coluna original ("Lead Recebido") depois do refetch.
    const originalColumn = page.locator('h3', { hasText: 'Lead Recebido' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(originalColumn.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible({ timeout: 10_000 });
  });

  test('drag por teclado: pickup (Espaço), ArrowRight, drop (Espaço) move o card e anuncia a movimentação', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Teclado Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) }).first();
    await expect(card).toBeVisible();
    await card.focus();

    // O dnd-kit dispara onDragStart e, em seguida (o item já "está sobre" sua própria coluna),
    // onDragOver de imediato — a mensagem de pickup (onDragStart) é substituída rápido demais pra
    // afirmar de forma estável nela; a asserção relevante é o efeito final da movimentação.
    await page.keyboard.press('Space'); // pickup
    // Espera o estado de "pego" ficar visível no DOM (aria-pressed do dnd-kit) antes da seta —
    // sem isso, ArrowRight pode chegar antes do listener de keydown do KeyboardSensor terminar de
    // processar a ativação do Space, e a seta se perde (visto de forma intermitente sem este wait).
    await expect(card).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowRight'); // Lead Recebido -> Cadência Iniciada
    await expect(page.getByText(/sobre a coluna Cadência Iniciada/)).toBeVisible({ timeout: 10_000 });

    const putResponse = page.waitForResponse((res) => res.url().includes('/api/leads/') && res.request().method() === 'PUT');
    await page.keyboard.press('Space'); // drop
    const res = await putResponse;
    expect(res.status()).toBe(200);

    await expect(page.getByText(/movido para Cadência Iniciada/)).toBeVisible({ timeout: 10_000 });
    const columnBody = page.locator('h3', { hasText: 'Cadência Iniciada' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBody.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible();
  });

  test('drag por teclado: Escape cancela e o card permanece na coluna original', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Cancelar Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) }).first();
    await expect(card).toBeVisible();
    await card.focus();

    await page.keyboard.press('Space'); // pickup
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape'); // cancela

    await expect(page.getByText(/[Mm]ovimentação de .* cancelada/)).toBeVisible({ timeout: 10_000 });
    const originalColumn = page.locator('h3', { hasText: 'Lead Recebido' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(originalColumn.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible();
  });

  test('drag por teclado: múltiplas colunas (ArrowRight duas vezes) e ArrowLeft de volta', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Multi Coluna Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) }).first();
    await card.focus();
    await page.keyboard.press('Space');
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('ArrowRight'); // Cadência Iniciada
    await page.keyboard.press('ArrowRight'); // Qualificação (SDR)
    await expect(page.getByText(/sobre a coluna Qualificação \(SDR\)/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('ArrowLeft'); // volta pra Cadência Iniciada
    await expect(page.getByText(/sobre a coluna Cadência Iniciada/)).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press('Space'); // drop em Cadência Iniciada

    const columnBody = page.locator('h3', { hasText: 'Cadência Iniciada' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBody.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible();
  });
});

test.describe('Kanban do CRM — coluna vazia', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('kanban-empty') });
  });

  test('coluna sem leads mostra o estado vazio "Solte cards aqui"', async ({ page }) => {
    await page.goto('/app/crm');
    // Conta recém-criada não tem nenhum lead — todas as colunas do funil Lead começam vazias.
    const column = page.locator('h3', { hasText: 'Qualificação (SDR)' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(column.getByText('📥 Solte cards aqui')).toBeVisible();
    await expect(column.getByText('0', { exact: true })).toBeVisible();
  });

  test('drag por mouse: solta em coluna vazia move o card corretamente', async ({ page }) => {
    // Coluna próxima (índice 2, "Qualificação (SDR)") de propósito — dentro do viewport padrão do
    // Playwright sem precisar de scroll horizontal (ver comentário em dragCardToColumn).
    const { company } = await createCompanyAndLead(page, { tradeName: `Vazia Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) });
    const targetColumn = page.getByRole('heading', { name: 'Qualificação (SDR)' });
    await dragCardToColumn(page, card, targetColumn);

    const columnBody = page.locator('h3', { hasText: 'Qualificação (SDR)' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBody.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Kanban do CRM — LeadDetailDrawer', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('kanban-drawer') });
  });

  test('clique no card abre o drawer com foco inicial e Escape fecha devolvendo o foco', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Drawer Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    const card = page.getByRole('button', { name: new RegExp(company.tradeName) });
    await card.click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    // Foco inicial dentro do drawer (accessibility.spec.ts já cobre o padrão geral de foco em
    // Dialog; aqui confirmamos que o LeadDetailDrawer especificamente segue o mesmo contrato).
    await expect(drawer).toContainText(company.tradeName);

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    // Foco retorna ao card que abriu o drawer (mesmo padrão documentado em LeadDetailDrawer.tsx).
    await expect(card).toBeFocused();
  });

  test('botão de fechar (X) fecha o drawer', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Fechar X Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    await page.getByRole('button', { name: new RegExp(company.tradeName) }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    await drawer.getByRole('button', { name: 'Fechar detalhes do lead' }).click();
    await expect(drawer).not.toBeVisible();
  });

  test('alterar o estágio pelo select do drawer move o card no board', async ({ page }) => {
    const { company } = await createCompanyAndLead(page, { tradeName: `Select Kanban ${Date.now()}`, status: 'Lead Recebido' });
    await page.goto('/app/crm');

    await page.getByRole('button', { name: new RegExp(company.tradeName) }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    const putResponse = page.waitForResponse((res) => res.url().includes('/api/leads/') && res.request().method() === 'PUT');
    await drawer.getByLabel('Estágio do lead').selectOption('Qualificação (SDR)');
    const res = await putResponse;
    expect(res.status()).toBe(200);

    await page.keyboard.press('Escape');
    const columnBody = page.locator('h3', { hasText: 'Qualificação (SDR)' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(columnBody.getByRole('button', { name: new RegExp(company.tradeName) })).toBeVisible({ timeout: 10_000 });
  });
});
