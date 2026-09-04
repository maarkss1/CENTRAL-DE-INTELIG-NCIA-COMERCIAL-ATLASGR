import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { signUp, uniqueTestEmail, waitForAppReady } from './helpers';

// Varredura automática de acessibilidade (axe-core) nas telas principais. Não bloqueia em toda e
// qualquer violação — o app tem um backlog conhecido de achados `moderate`/`minor` (ver
// eslint.config.mjs, ex.: jsx-a11y/label-has-associated-control em vários formulários — o
// DESIGN_QA_CENTRAL_ATLASGR.md que documentava esse backlog em detalhe foi removido do controle de
// versão em 22/08/2026, ver docs/REMOVED-DOCS.md) que ainda não foi corrigido. Este teste falha só
// em `critical`/`serious`, que
// são os que realmente impedem uso por teclado/leitor de tela — o resto fica visível no relatório
// HTML do Playwright (`attachment`) para triagem incremental, sem travar o CI hoje.
const BLOCKING_IMPACTS = ['critical', 'serious'];

/**
 * Achado real (onda 43): mesmo com `reducedMotion: 'reduce'` (linha ~40), o axe-core ainda pegava
 * um card do Chatbook a meio caminho de um fade-in — `color-contrast` de 4.33:1 (abaixo do mínimo
 * AA de 4.5:1) numa cor que em repouso tem contraste normal. Causa: `MotionConfig
 * reducedMotion="user"` (App.tsx) só torna instantâneas as animações "unsafe" (transform/scale/
 * posição) — a Framer Motion trata opacidade como "safe" (não causa desconforto vestibular) e
 * continua fazendo o fade normalmente mesmo com essa preferência ativa, então qualquer
 * `motion.div` com `initial={{ opacity: 0 }}` (ex.: ChatbookHub.tsx) ainda está semi-transparente
 * no instante em que o axe roda logo após `waitForAppReady` — o mesmo tipo de falso positivo do
 * toast (comentário abaixo), só que numa propriedade que a Constituição de Motion (`MotionConfig`)
 * nunca colapsa. Espera qualquer animação da Web Animations API terminar antes de rodar o axe —
 * cobre qualquer página/componente com fade-in via Framer Motion, não só o Chatbook. Best-effort
 * (nunca trava o teste): se algo ficar em loop por mais de 2s (spinner de loading, decorativo),
 * segue com o scan do jeito que está, exatamente como antes desta função existir.
 */
async function waitForAnimationsToSettle(page: import('@playwright/test').Page) {
  // `waitForFunction(pageFunction, arg, options)` — o 2º parâmetro é `arg` (dado repassado pra
  // função da página), não `options`; passar `{ timeout }` ali faz o Playwright usá-lo como `arg`
  // (ignorado, já que a função não recebe parâmetro nenhum) e cair no timeout DEFAULT do teste
  // (45s aqui) em vez dos 2s pretendidos — achado real ao instrumentar esta função (media 42s+ de
  // fato gasto aqui num caso onde a página tem alguma animação continua não resolvida). `undefined`
  // explícito no lugar de `arg` é obrigatório pra `options` cair no lugar certo.
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== 'running'),
      undefined,
      {
        timeout: 2_000,
      },
    )
    .catch(() => {});
}

async function assertNoBlockingViolations(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
) {
  await waitForAnimationsToSettle(page);
  // Achado real (LoginScreen): mesmo depois de waitForAnimationsToSettle(), o axe-core ainda pegava
  // o relógio/calendário da tela de login (delay 0.15s + duration 0.4s; título/subtítulo usam
  // `fadeInUp`, duration 0.45s, ver src/lib/motion.ts) a meio caminho do fade — cor diferente a
  // cada execução em CI (#cd947f numa tentativa, #e3c8bf na seguinte, nenhuma correspondendo a um
  // token real), provando captura em instante aleatório da transição, não um bug estático de
  // contraste. Causa: assim como o Chatbook (comentário acima), `document.getAnimations()` só
  // enxerga animações da Web Animations API nativa — quando o Framer Motion anima `opacity` via
  // spring/tween simples, ele usa requestAnimationFrame e escreve o estilo diretamente, sem passar
  // por `Element.animate()`, daí o wait anterior resolver instantaneamente sem a animação ter de
  // fato terminado. Buffer fixo cobre a maior entrada de tela conhecida no app (relógio da
  // LoginScreen, 0.55s) com folga adicional pra variação de performance do runner de CI.
  await page.waitForTimeout(1000);
  const results = await new AxeBuilder({ page }).analyze();

  await testInfo.attach('axe-results', {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });

  const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.includes(v.impact ?? ''));
  const summary = blocking
    .map((v) => `[${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} ocorrência(s))`)
    .join('\n');

  expect(blocking, summary).toEqual([]);
}

test.describe('Acessibilidade automática (axe-core)', () => {
  // Achado real (Onda 42): um teste deste arquivo pegou `animate-toast-in` (globals.css, toast de
  // erro/sucesso) a meio caminho da transição de opacidade — a cor renderizada nesse instante é uma
  // mistura transitória com o que está atrás, então o axe-core mede um contraste que nunca existe em
  // repouso (flaky: falhava numa execução, passava na tentativa seguinte). `reducedMotion: 'reduce'`
  // aciona a regra global `@media (prefers-reduced-motion: reduce)` em globals.css, que já colapsa
  // toda animação/transição pra 0.01ms — mesmo comportamento que um usuário real com essa preferência
  // veria, e elimina essa classe inteira de falso positivo por captura em pleno andamento da
  // transição, não só o caso do toast.
  test.use({ reducedMotion: 'reduce' });

  test('tela de login não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await page.goto('/login');
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Painel Central (dashboard) não tem violações críticas/sérias', async ({
    page,
  }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-dash') });
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Pipeline CRM não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-crm') });
    await page.getByRole('button', { name: 'Pipeline CRM' }).click();
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Configurações não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-settings') });
    // Deep-link direto (rota real desde a migração de tab-state pra react-router) — não depende do
    // item de menu, que só aparece pra usuários admin.
    await page.goto('/app/settings');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Cadência não tem violações críticas/sérias', async ({ page }, testInfo) => {
    // CYC-009 (onda 29): tela ganhou ações de escrita reais (pausar/retomar/parar) nesta rodada,
    // nunca coberta por este arquivo até agora.
    await signUp(page, { email: uniqueTestEmail('a11y-cadence') });
    await page.goto('/app/cadence');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  // Varredura ampliada — as telas abaixo nunca tinham sido cobertas por este arquivo. Cada uma
  // usa seu próprio usuário (signUp isolado) e navega por deep-link direto, mesmo padrão de
  // "Configurações" acima, para não depender de nomes de item de menu que podem mudar.
  test('Prospecção não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-prospect') });
    await page.goto('/app/prospect');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Visão 360 do CRM não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-crm360') });
    await page.goto('/app/crm360');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Mesa de Tratamento não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-mesa') });
    await page.goto('/app/mesa-tratamento');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Central de Inteligência (IA) não tem violações críticas/sérias', async ({
    page,
  }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-intelligence') });
    await page.goto('/app/intelligence');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Empresas não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-companies') });
    await page.goto('/app/companies');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Contatos não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-contacts') });
    await page.goto('/app/contacts');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Atividades não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-activities') });
    await page.goto('/app/activities');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Chatbook não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-chatbook') });
    await page.goto('/app/chatbook');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Roleplay não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-roleplay') });
    await page.goto('/app/roleplay');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Matriz de Qualificação não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-qualmatrix') });
    await page.goto('/app/qualification_matrix');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Matriz de Objeções não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-objmatrix') });
    await page.goto('/app/objections_matrix');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Academia de Treinamento não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-topictraining') });
    await page.goto('/app/topic_training');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Guia Bitrix não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-bitrixguide') });
    await page.goto('/app/bitrix');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Relatórios não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-reports') });
    await page.goto('/app/reports');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Integrações não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-integrations') });
    await page.goto('/app/integrations');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Base de Conhecimento não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-knowledge') });
    await page.goto('/app/knowledge');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Analytics não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-analytics') });
    await page.goto('/app/analytics');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Análise Ganhos/Perdas não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-winloss') });
    await page.goto('/app/winloss');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Propostas não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-propostas') });
    await page.goto('/app/propostas');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Comercial Inteligente não tem violações críticas/sérias', async ({ page }, testInfo) => {
    // signUp() sempre cria ADMIN (primeiro usuário da organização) — dentro de
    // COMMERCIAL_INTELLIGENCE_ROLES (ADMIN/GESTOR), então o RequireRole da rota não bloqueia aqui.
    await signUp(page, { email: uniqueTestEmail('a11y-cominttel') });
    await page.goto('/app/commercial_intelligence');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Agenda não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-calendar') });
    await page.goto('/app/calendar');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Notificações não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-notifications') });
    await page.goto('/app/notifications');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Automações não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-automations') });
    await page.goto('/app/automations');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Uso/Faturamento não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-usage') });
    await page.goto('/app/usage');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Equipe não tem violações críticas/sérias', async ({ page }, testInfo) => {
    // signUp() sempre cria ADMIN — a única role permitida pela rota /app/team.
    await signUp(page, { email: uniqueTestEmail('a11y-team') });
    await page.goto('/app/team');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Editor de documentos não tem violações críticas/sérias', async ({ page }, testInfo) => {
    await signUp(page, { email: uniqueTestEmail('a11y-editor') });
    await page.goto('/app/editor');
    await waitForAppReady(page);
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Tela de boas-vindas (pré-login) não tem violações críticas/sérias', async ({
    page,
  }, testInfo) => {
    await page.goto('/welcome');
    await assertNoBlockingViolations(page, testInfo);
  });

  test('Seleção de marca (pré-login) não tem violações críticas/sérias', async ({
    page,
  }, testInfo) => {
    await page.goto('/select-brand');
    await assertNoBlockingViolations(page, testInfo);
  });
});
