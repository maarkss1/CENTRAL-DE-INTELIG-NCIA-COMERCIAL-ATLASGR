import { describe, it, expect, vi } from 'vitest';
import { diffAutomationSnapshots } from '../domain/AutomationVersion';
import type { Automation } from '../domain/Automation';

// Versionamento de regras (Onda 42 — dossiê CPI DEC-14, opção A): cada edição/remoção grava o
// estado ANTERIOR como uma versão histórica, com timestamp e quem editou. Cobre: gravação
// correta a cada edição, diff textual básico entre estados, e a linha do tempo completa
// (histórico + estado atual) na ordem certa.
//
// `automation-versioning.service.ts` compõe `PrismaAutomationVersionStore` (persistência real,
// desde a migration 20260827210000_onda42_decisoes_schema) — este é um teste UNITÁRIO puro da
// lógica de diff/timeline, sem Postgres real disponível, então trocamos a store real pela mesma
// `InMemoryAutomationVersionStore` que já implementa a interface `AutomationVersionStore`
// corretamente (usada em produção só até esta migration existir). A prova contra Postgres real
// (RLS incluída) fica para um teste de integração dedicado, não para este arquivo.
vi.mock('../infra/PrismaAutomationVersionStore.js', async () => {
  const { InMemoryAutomationVersionStore } =
    await import('../infra/InMemoryAutomationVersionStore.js');
  return { PrismaAutomationVersionStore: InMemoryAutomationVersionStore };
});

const { automationVersioningService } = await import('../automation-versioning.service');

function makeAutomation(overrides: Partial<Automation> = {}): Automation {
  return {
    id: 'auto-1',
    name: 'Avisar em Proposta Enviada',
    enabled: true,
    trigger: 'Lead mudou de status',
    conditions: { status: 'Proposta Enviada' },
    action: 'Notificar equipe',
    actionConfig: { title: 'Nova proposta!' },
    lastRunAt: null,
    runCount: 0,
    organizationId: 'org-1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('diffAutomationSnapshots', () => {
  const base = {
    name: 'Regra A',
    enabled: true,
    trigger: 'Lead mudou de status' as const,
    conditions: { status: 'Proposta Enviada' },
    action: 'Notificar equipe' as const,
    actionConfig: { title: 'X' },
  };

  it('sem nenhuma alteração, retorna lista vazia', () => {
    expect(diffAutomationSnapshots(base, { ...base })).toEqual([]);
  });

  it('detecta mudança de nome', () => {
    const diff = diffAutomationSnapshots(base, { ...base, name: 'Regra B' });
    expect(diff).toEqual([{ field: 'Nome', before: 'Regra A', after: 'Regra B' }]);
  });

  it('renderiza enabled como "ativa"/"pausada", não true/false cru', () => {
    const diff = diffAutomationSnapshots(base, { ...base, enabled: false });
    expect(diff).toEqual([{ field: 'Status', before: 'ativa', after: 'pausada' }]);
  });

  it('diff de conditions ignora ordem de chaves (não é uma mudança real)', () => {
    const diff = diffAutomationSnapshots(
      { ...base, conditions: { a: '1', b: '2' } },
      { ...base, conditions: { b: '2', a: '1' } },
    );
    expect(diff).toEqual([]);
  });

  it('detecta mudança real de conditions', () => {
    const diff = diffAutomationSnapshots(
      { ...base, conditions: { status: 'Proposta Enviada' } },
      { ...base, conditions: { status: 'Reunião Agendada' } },
    );
    expect(diff).toHaveLength(1);
    expect(diff[0].field).toBe('Condições');
  });

  it('detecta múltiplos campos alterados ao mesmo tempo', () => {
    const diff = diffAutomationSnapshots(base, {
      ...base,
      action: 'Criar atividade',
      actionConfig: { dueInDays: 2 },
    });
    const fields = diff.map((d) => d.field).sort();
    expect(fields).toEqual(['Ação', 'Configuração da ação']);
  });
});

describe('automationVersioningService.buildTimeline', () => {
  it('automação nunca editada: histórico vazio', async () => {
    const automation = makeAutomation({ id: 'auto-never-edited' });
    const timeline = await automationVersioningService.buildTimeline('org-1', automation);

    expect(timeline.history).toEqual([]);
    expect(timeline.current.name).toBe(automation.name);
  });

  it('uma edição: histórico com 1 entrada, diff contra o estado atual', async () => {
    const automationId = 'auto-one-edit';
    const priorState = makeAutomation({ id: automationId, name: 'Nome antigo', enabled: true });
    await automationVersioningService.recordPriorState(
      'org-1',
      automationId,
      priorState,
      { userId: 'user-1', email: 'gestor@atlasgr.com.br' },
      'update',
    );

    const current = makeAutomation({ id: automationId, name: 'Nome novo', enabled: true });
    const timeline = await automationVersioningService.buildTimeline('org-1', current);

    expect(timeline.history).toHaveLength(1);
    const [entry] = timeline.history;
    expect(entry.editedByEmail).toBe('gestor@atlasgr.com.br');
    expect(entry.editedByUserId).toBe('user-1');
    expect(entry.changeReason).toBe('update');
    expect(entry.snapshot.name).toBe('Nome antigo');
    expect(entry.diffToNext).toEqual([
      { field: 'Nome', before: 'Nome antigo', after: 'Nome novo' },
    ]);
  });

  it('duas edições: histórico mais recente primeiro, cada diff contra a versão seguinte', async () => {
    const automationId = 'auto-two-edits';

    // v1 -> v2 (edição 1, mais antiga)
    await automationVersioningService.recordPriorState(
      'org-1',
      automationId,
      makeAutomation({ id: automationId, name: 'v1' }),
      { userId: 'user-1', email: 'a@atlasgr.com.br' },
      'update',
    );
    // v2 -> v3/atual (edição 2, mais recente)
    await automationVersioningService.recordPriorState(
      'org-1',
      automationId,
      makeAutomation({ id: automationId, name: 'v2' }),
      { userId: 'user-2', email: 'b@atlasgr.com.br' },
      'update',
    );

    const current = makeAutomation({ id: automationId, name: 'v3' });
    const timeline = await automationVersioningService.buildTimeline('org-1', current);

    expect(timeline.history).toHaveLength(2);
    expect(timeline.history[0].snapshot.name).toBe('v2'); // mais recente primeiro
    expect(timeline.history[0].diffToNext).toEqual([{ field: 'Nome', before: 'v2', after: 'v3' }]);
    expect(timeline.history[1].snapshot.name).toBe('v1');
    expect(timeline.history[1].diffToNext).toEqual([{ field: 'Nome', before: 'v1', after: 'v2' }]);
  });

  it('remoção registra changeReason "delete"', async () => {
    const automationId = 'auto-deleted';
    await automationVersioningService.recordPriorState(
      'org-1',
      automationId,
      makeAutomation({ id: automationId }),
      { userId: 'user-1', email: 'a@atlasgr.com.br' },
      'delete',
    );

    // Não há "current" real após a remoção — o chamador (AutomationUseCases.listVersions) só
    // monta a timeline enquanto o registro ainda existe; aqui testamos só a gravação em si via
    // uma segunda chamada com o mesmo automationId para inspecionar o changeReason gravado.
    const timeline = await automationVersioningService.buildTimeline(
      'org-1',
      makeAutomation({ id: automationId }),
    );
    expect(timeline.history[0].changeReason).toBe('delete');
  });

  it('isola por organizationId — nunca mistura histórico de outro tenant', async () => {
    const automationId = 'auto-shared-id';
    await automationVersioningService.recordPriorState(
      'org-A',
      automationId,
      makeAutomation({ id: automationId, name: 'Nome org A' }),
      { userId: 'user-1', email: 'a@atlasgr.com.br' },
      'update',
    );

    const timelineOrgB = await automationVersioningService.buildTimeline(
      'org-B',
      makeAutomation({ id: automationId }),
    );
    expect(timelineOrgB.history).toEqual([]);
  });
});
