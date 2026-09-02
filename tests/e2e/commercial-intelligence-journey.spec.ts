import { test, expect } from '@playwright/test';
import { prisma } from '../../src/lib/prisma';
import { requestContext } from '../../src/lib/async-context';
import { signUp, uniqueTestEmail } from './helpers';

/**
 * Cobre a camada de UI das entregas de CLOSEDATE Intelligence, Jornada e Health Score do
 * Comercial Inteligente com dado REAL semeado no banco de teste (mesmo padrão de bypass de RLS
 * de `setUserRole` em helpers.ts): um negócio aberto sem interação e com um adiamento de data
 * prevista registrado em LeadFieldChange. Prova que o dado chega à tela, que o KPI abre o
 * drill-down do negócio certo e que o fator "data prevista adiada" aparece na explicação do
 * forecast — nada disso é visível com a base vazia que os demais specs usam.
 */
async function seedDealWithSlip(email: string): Promise<{ leadId: string; title: string }> {
  const user = await requestContext.run({ bypassRls: true }, () =>
    prisma.user.findUniqueOrThrow({ where: { email }, select: { organizationId: true } }),
  );
  const organizationId = user.organizationId!;
  requestContext.enterWith({ tenantId: organizationId, bypassRls: true });
  const title = 'E2E Jornada — Seguro de carga';
  const lead = await prisma.lead.create({
    data: {
      organizationId,
      funnel: 'Negocio',
      status: 'Nova_Oportunidade',
      title,
      amount: 42_000,
      owner: 'Ana E2E',
      source: 'E2E',
      createdAt: new Date(Date.now() - 40 * 86_400_000),
      expectedCloseAt: new Date(Date.now() + 30 * 86_400_000),
      lastInteraction: null,
      nextAction: null,
    },
  });
  await prisma.leadFieldChange.create({
    data: {
      organizationId,
      leadId: lead.id,
      field: 'expectedCloseAt',
      previousValue: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      newValue: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      source: 'crm',
      changedAt: new Date(Date.now() - 2 * 86_400_000),
    },
  });
  return { leadId: lead.id, title };
}

test.describe('Comercial Inteligente — Jornada, CLOSEDATE e Health Score com dado real', () => {
  test('KPIs refletem o dado semeado, drill-down abre o negócio certo e o fator de adiamento é explicado', async ({ page }) => {
    const email = uniqueTestEmail('ci-journey');
    await signUp(page, { email });
    const { title } = await seedDealWithSlip(email);

    // Jornada: o negócio sem interação aparece em "Clientes parados" e o KPI abre o drill-down.
    await page.goto('/app/commercial_intelligence?tab=journey');
    await expect(page.getByRole('heading', { name: 'Clientes parados (sem interação)' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Parados: 1\./ })).toBeVisible();
    await page.getByRole('button', { name: /^Parados: 1\./ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(title)).toBeVisible();
    await expect(dialog.getByText('Data prevista de fechamento já foi adiada uma vez')).toBeVisible();
    await page.keyboard.press('Escape');

    // Pipeline & Forecast: CLOSEDATE Intelligence mostra o adiamento e o carryover do mês.
    await page.goto('/app/commercial_intelligence?tab=pipeline');
    await expect(page.getByRole('heading', { name: 'CLOSEDATE Intelligence' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Negócios adiados: 1\./ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pipeline Carryover' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Forecast Accuracy (erro histórico)' })).toBeVisible();
    // Sem snapshot semanal ainda: honestidade sobre ausência de histórico, nunca um número.
    await expect(page.getByText('Histórico insuficiente')).toBeVisible();

    // Visão Executiva: Health Score composto renderiza os 6 pilares.
    await page.goto('/app/commercial_intelligence?tab=overview');
    await expect(page.getByRole('heading', { name: 'Health Score da operação comercial' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Pilares do Health Score' }).getByRole('listitem')).toHaveCount(6);
  });
});
