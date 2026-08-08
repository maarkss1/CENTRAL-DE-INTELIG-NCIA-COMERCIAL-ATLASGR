import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// Cobre a modernização de src/lib/paletteIntent.ts: o Command Palette passava a intenção de
// navegação ("abra o formulário de criar") por um singleton mutável fora do React; agora viaja
// como `location.state` do `navigate()` (só era possível depois da migração pra rotas reais —
// Fase D do backlog Tier 2). O ponto que este teste verifica especificamente é que o state some da
// entrada de histórico depois de consumido — sem isso, um F5 na tela reabriria o formulário sozinho.
test.describe('Command Palette — intenção de navegação (open-create)', () => {
  test('"Criar nova atividade" navega pra Agenda e abre o formulário; F5 não reabre sozinho', async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('palette-intent') });

    // Clique na busca do topbar em vez do atalho de teclado Ctrl+K — o Chromium real intercepta
    // Ctrl+K como atalho nativo do navegador (focar a busca) antes do handler da página rodar.
    await page.getByRole('button', { name: /Buscar empresa, decisor ou comando/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Criar nova atividade' }).click();

    await expect(page).toHaveURL(/\/app\/activities$/);
    // Formulário de nova atividade abriu sozinho por causa da intenção "open-create".
    await expect(page.getByRole('button', { name: 'Salvar Atividade' })).toBeVisible();

    // Recarrega a página com o formulário ainda aberto — o state já deveria ter sido limpo
    // (replace) assim que foi consumido, então o formulário NÃO deve reabrir sozinho de novo.
    await page.reload();
    await expect(page).toHaveURL(/\/app\/activities$/);
    await expect(page.getByRole('button', { name: 'Salvar Atividade' })).toBeHidden();
  });
});
