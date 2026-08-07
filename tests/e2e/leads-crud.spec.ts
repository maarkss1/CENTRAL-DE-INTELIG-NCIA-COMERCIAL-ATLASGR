import { test, expect } from '@playwright/test';
import { signUp, uniqueTestEmail } from './helpers';

// CRUD de lead ponta-a-ponta (item TEST-002 / 09-BACKLOG-EXECUTAVEL.md #20). A UI do Pipeline CRM
// (CrmBoard.tsx) não tem um formulário de criação direta de lead — leads nascem via o fluxo de
// prospecção — então este spec exercita a API real (/api/leads) autenticado com a sessão de
// cookies do browser (`page.request` compartilha o mesmo contexto/cookies de `page`), o que ainda
// cobre o caminho ponta-a-ponta que a UI usaria: auth real -> authenticateToken -> requireTenant ->
// LeadController -> Prisma/RLS -> resposta.
test.describe('CRUD de lead', () => {
  test.beforeEach(async ({ page }) => {
    await signUp(page, { email: uniqueTestEmail('leads') });
  });

  test('cria, lê, atualiza e (tenta) excluir um lead', async ({ page }) => {
    const createRes = await page.request.post('/api/leads', {
      data: { status: 'Lead Recebido', source: 'e2e-test', channel: 'Teste automatizado' },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()).data;
    expect(created).toHaveProperty('id');
    expect(created.status).toBe('Lead Recebido');

    const leadId = created.id;

    const readRes = await page.request.get(`/api/leads/${leadId}`);
    expect(readRes.ok()).toBeTruthy();
    const read = (await readRes.json()).data;
    expect(read.id).toBe(leadId);
    expect(read.source).toBe('e2e-test');

    const updateRes = await page.request.put(`/api/leads/${leadId}`, {
      data: { status: 'Qualificação (SDR)', temperature: 'Quente' },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = (await updateRes.json()).data;
    expect(updated.status).toBe('Qualificação (SDR)');
    expect(updated.temperature).toBe('Quente');

    const readAgainRes = await page.request.get(`/api/leads/${leadId}`);
    const readAgain = (await readAgainRes.json()).data;
    expect(readAgain.status).toBe('Qualificação (SDR)');

    // lead.routes.ts:19 exige role ADMIN/GESTOR para DELETE — usuário recém-cadastrado nasce
    // VISUALIZADOR (better-auth additionalFields.role default), então isto documenta o RBAC real
    // (403), não uma falha do teste.
    const deleteRes = await page.request.delete(`/api/leads/${leadId}`);
    expect(deleteRes.status()).toBe(403);

    // O lead segue existindo porque a exclusão foi corretamente bloqueada.
    const stillThereRes = await page.request.get(`/api/leads/${leadId}`);
    expect(stillThereRes.ok()).toBeTruthy();
  });

  test('rejeita status de lead fora do enum aceito', async ({ page }) => {
    const res = await page.request.post('/api/leads', {
      data: { status: 'Status-Que-Nao-Existe' },
    });
    expect(res.status()).toBe(400);
  });

  test('lead recém-criado aparece na listagem paginada de leads', async ({ page }) => {
    const createRes = await page.request.post('/api/leads', {
      data: { status: 'Lead Recebido', source: 'e2e-listagem' },
    });
    const created = (await createRes.json()).data;

    // LeadController.getLeads (BACK-004) devolve { success, data, meta } paginado.
    const listRes = await page.request.get('/api/leads');
    expect(listRes.ok()).toBeTruthy();
    const list = await listRes.json();
    expect(list).toHaveProperty('meta');
    const ids: string[] = list.data.map((l: { id: string }) => l.id);
    expect(ids).toContain(created.id);
  });
});
