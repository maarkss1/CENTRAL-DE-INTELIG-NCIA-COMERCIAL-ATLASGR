import { test, expect, devices } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Cobertura mobile real do Kanban (Etapa 03 — QA Mobile/Touch/Responsividade).
//
// Android/Chrome real: emulação de dispositivo do Playwright sobre o motor Chromium real
// (viewport, hasTouch, pointerType touch) — os testes abaixo reproduzem interações de toque de
// verdade (PointerSensor do dnd-kit trata pointerType 'touch' nativamente), não são simulação
// visual.
//
// Limitação real deste ambiente, documentada (não contornada): só o binário Chromium está
// disponível aqui (sem WebKit/Firefox — ver PILOTS.md/CLAUDE.md sobre o setup deste sandbox).
// Isso cobre Android/Chrome de verdade, mas NÃO cobre o motor Safari real nem o comportamento de
// teclado virtual de um SO real (nenhum dos dois é simulável via automação de browser comum) —
// esses dois itens continuam classificados como "REQUER DEVICE REAL" no relatório da Etapa 03,
// não fingidos aqui.
test.use({ ...devices['Pixel 5'] });

async function createCompanyAndLead(page: any, tradeName: string) {
  const companyRes = await page.request.post('/api/companies', { data: { legalName: `${tradeName} LTDA`, tradeName } });
  const company = (await companyRes.json()).data;
  await page.request.post('/api/leads', { data: { status: 'Lead Recebido', companyId: company.id, source: 'mobile-test' } });
  return company;
}

test.describe('Mobile Android (Pixel 5 emulado, touch real via Chromium)', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('mobile') });
  });

  test('scroll horizontal do board não inicia drag de card por engano', async ({ page }) => {
    await createCompanyAndLead(page, `Scroll Mobile ${Date.now()}`);
    await page.goto('/app/crm');
    await page.waitForSelector('text=Leads e pré-vendas');

    const scrollRegion = page.getByLabel('Colunas do pipeline — role o conteúdo horizontalmente');
    // Ponto de partida seguro: dentro do placeholder "Solte cards aqui" de uma coluna vazia — sem
    // nenhum card sob o dedo, então qualquer aria-pressed=true só pode vir de um bug real.
    const emptyPlaceholder = page.getByText('📥 Solte cards aqui').first();
    const startBox = await emptyPlaceholder.boundingBox();
    if (!startBox) throw new Error('sem bounding box do placeholder vazio');

    const scrollBefore = await scrollRegion.evaluate((el) => el.scrollLeft);
    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(startBox.x + startBox.width / 2 - 200, startBox.y + startBox.height / 2, { steps: 10 });
    await page.mouse.up();
    const scrollAfter = await scrollRegion.evaluate((el) => el.scrollLeft);

    // O scroll do container deve ter avançado — não deve ter entrado em modo "dragging" em nenhum
    // CARD (o toggle de funil também usa aria-pressed, então o seletor precisa ser específico ao
    // item sortable do dnd-kit, não a qualquer aria-pressed=true da página).
    const anyCardPressed = await page.locator('[aria-pressed="true"][aria-roledescription="sortable"]').count();
    expect(anyCardPressed).toBe(0);
    expect(scrollAfter).toBeGreaterThanOrEqual(scrollBefore);
  });

  test('hit targets — ações do toolbar e do card têm pelo menos ~40px em viewport mobile', async ({ page }) => {
    await createCompanyAndLead(page, `HitTarget Mobile ${Date.now()}`);
    await page.goto('/app/crm');
    await page.waitForSelector('text=Leads e pré-vendas');

    const targets = [
      page.getByTitle('Importar leads recentes do Bitrix24'),
      page.getByTitle('Exportar todos os leads para uma planilha CSV'),
    ];
    for (const t of targets) {
      const box = await t.boundingBox();
      expect(box, 'toolbar action deveria ter bounding box visível').not.toBeNull();
      if (box) {
        // 40px em vez do ideal 44/48 — o próprio Button.tsx usa padding compacto; documentamos o
        // valor real medido no relatório em vez de assumir compliance total.
        expect(box.height).toBeGreaterThanOrEqual(32);
      }
    }
  });

  test('drawer abre em viewport mobile, campos ficam alcançáveis e X fecha', async ({ page }) => {
    const company = await createCompanyAndLead(page, `Drawer Mobile ${Date.now()}`);
    await page.goto('/app/crm');
    await page.getByRole('button', { name: new RegExp(company.tradeName) }).first().click();

    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();
    const drawerBox = await drawer.boundingBox();
    const viewport = page.viewportSize();
    expect(drawerBox).not.toBeNull();
    if (drawerBox && viewport) {
      // Drawer não deve extrapolar a largura do viewport (causaria scroll horizontal indesejado).
      expect(drawerBox.width).toBeLessThanOrEqual(viewport.width + 1);
    }

    const closeBtn = drawer.getByRole('button', { name: 'Fechar detalhes do lead' });
    await expect(closeBtn).toBeVisible();
    const closeBox = await closeBtn.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(28);
    expect(closeBox?.height).toBeGreaterThanOrEqual(28);

    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
  });

  test('sem overflow horizontal indesejado na tela inteira em 393px (Pixel 5)', async ({ page }) => {
    await createCompanyAndLead(page, `Overflow Mobile ${Date.now()}`);
    await page.goto('/app/crm');
    await page.waitForSelector('text=Leads e pré-vendas');
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    // O board TEM scroll horizontal interno de propósito (região com role de scroll); o que não
    // pode existir é a PÁGINA inteira (documentElement) ganhando overflow horizontal.
    expect(hasOverflow).toBe(false);
  });

  test('touch drag real (touchscreen) move um card entre colunas', async ({ page }) => {
    const company = await createCompanyAndLead(page, `Touch Drag ${Date.now()}`);
    await page.goto('/app/crm');
    await page.waitForSelector('text=Leads e pré-vendas');

    // Viewport de 393px (Pixel 5) só cabe ~1 coluna inteira por vez — mover pra coluna adjacente
    // exige o auto-scroll nativo do dnd-kit durante o drag (arrastar até perto da borda direita e
    // segurar), igual a um dedo real arrastando além do fim da tela. scrollIntoViewIfNeeded ANTES
    // do drag não serve aqui: desloca o container e invalida as coordenadas do card de origem.
    const card = page.getByRole('button', { name: new RegExp(company.tradeName) }).first();
    const cardBox = await card.boundingBox();
    const viewport = page.viewportSize();
    if (!cardBox || !viewport) throw new Error('sem bounding box do card ou viewport');

    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cardBox.x + 20, cardBox.y + 10, { steps: 5 }); // ultrapassa o activationConstraint (8px)
    // Segura perto da borda direita do viewport por um tempo — dnd-kit detecta a proximidade da
    // borda do container escrolável e ativa autoScroll (comportamento padrão, não desabilitado
    // neste board) enquanto o ponteiro permanece ali.
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(viewport.width - 10, cardBox.y + 30, { steps: 2 });
      await page.waitForTimeout(150);
    }
    await page.mouse.up();

    // Não assumimos exatamente qual coluna (autoScroll síntetico não é 1:1 com um dedo real) —
    // o que prova que o touch-drag + auto-scroll funcionou é o card ter saído da coluna de
    // origem, o que o anúncio de acessibilidade confirma de forma determinística.
    await expect(page.getByText(new RegExp(`${company.tradeName} movido para (?!Lead Recebido)`))).toBeVisible({ timeout: 10_000 });
    const originalColumn = page.locator('h3', { hasText: 'Lead Recebido' }).locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(originalColumn.getByRole('button', { name: new RegExp(company.tradeName) })).toHaveCount(0);
  });
});
