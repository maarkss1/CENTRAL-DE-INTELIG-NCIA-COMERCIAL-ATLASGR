import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Cobre a migração de ContactForm/CompanyForm pra ui/Dialog (Tier 2 do DESIGN_QA_CENTRAL_ATLASGR.md
// — "Fase G"). Pontos que a migração precisava preservar e que estes testes verificam de ponta a
// ponta contra o servidor real: o botão de submit fica fora da tag <form> (ligado via atributo
// `form="..."`), o campo UF continua forçando maiúsculas, validação de campo obrigatório continua
// aparecendo, e o toast de sucesso/erro (novo nesta migração) aparece nos dois fluxos.
test.describe('Formulários de Empresas e Contatos (migrados pra ui/Dialog)', () => {
  test('cria uma empresa — UF em maiúsculas, submit funciona, toast de sucesso aparece', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('company-form') });
    await page.getByRole('button', { name: 'Empresas' }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Nova Empresa|Adicionar/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Nova Empresa', exact: true })).toBeVisible();

    const suffix = Date.now();
    await page.getByLabel('Razão Social *').fill(`Empresa Teste ${suffix} LTDA`);
    await page.getByLabel('Nome Fantasia *').fill(`Teste ${suffix}`);
    await page.getByLabel('Estado (UF)').fill('sp');
    await expect(page.getByLabel('Estado (UF)')).toHaveValue('SP');

    await page.getByRole('button', { name: 'Criar Empresa' }).click();

    await expect(page.getByText('Empresa criada.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nova Empresa', exact: true })).toBeHidden();
    await expect(page.getByText(`Teste ${suffix}`).first()).toBeVisible();
  });

  test('valida campo obrigatório sem fechar o dialog', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('company-form-validation') });
    await page.getByRole('button', { name: 'Empresas' }).click();
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Nova Empresa|Adicionar/ }).first().click();
    await page.getByRole('button', { name: 'Criar Empresa' }).click();

    await expect(page.getByText('String must contain at least 1 character(s)').or(page.locator('.text-danger')).first()).toBeVisible();
    // Dialog continua aberto — erro de validação não fecha o form.
    await expect(page.getByRole('heading', { name: 'Nova Empresa', exact: true })).toBeVisible();
  });

  test('cria um contato vinculado a uma empresa — submit fora do <form> funciona, toast aparece', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('contact-form') });

    // Contato exige uma empresa existente no <select> — cria uma primeiro.
    await page.getByRole('button', { name: 'Empresas' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Nova Empresa|Adicionar/ }).first().click();
    const companySuffix = Date.now();
    await page.getByLabel('Razão Social *').fill(`Empresa Para Contato ${companySuffix} LTDA`);
    await page.getByLabel('Nome Fantasia *').fill(`ParaContato ${companySuffix}`);
    await page.getByRole('button', { name: 'Criar Empresa' }).click();
    await expect(page.getByText('Empresa criada.')).toBeVisible();

    await page.getByRole('button', { name: 'Decisores' }).click();
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Novo Contato|Adicionar Primeiro Contato/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Novo Contato', exact: true })).toBeVisible();

    await page.getByLabel('Nome *').fill(`Contato Teste ${companySuffix}`);
    await page.getByLabel('Empresa *').selectOption({ label: `ParaContato ${companySuffix}` });

    await page.getByRole('button', { name: 'Criar Contato' }).click();

    await expect(page.getByText('Contato criado.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Novo Contato', exact: true })).toBeHidden();
    await expect(page.getByText(`Contato Teste ${companySuffix}`).first()).toBeVisible();
  });
});
