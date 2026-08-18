import { describe, it, expect } from 'vitest';
import { toPrismaLeadStatus, fromPrismaLeadStatus, isLeadClosingStatus, LEAD_CLOSING_STATUSES } from '@/lib/enumMap';
import { LEAD_STATUS } from '@/lib/zod';

describe('enumMap — LeadStatus', () => {
  it('toPrismaLeadStatus/fromPrismaLeadStatus são inversas para todos os 18 valores do enum', () => {
    for (const label of LEAD_STATUS) {
      const prismaValue = toPrismaLeadStatus(label);
      expect(fromPrismaLeadStatus(prismaValue)).toBe(label);
    }
  });

  it('toPrismaLeadStatus produz identificadores válidos de enum Prisma (sem espaço/acento)', () => {
    for (const label of LEAD_STATUS) {
      expect(toPrismaLeadStatus(label)).toMatch(/^[A-Za-z0-9_]+$/);
    }
  });
});

// DATA-004 (Sprint 05/Onda 17): antes desta correção, PrismaLeadRepository.update(),
// PrismaLeadRepository.updateStatus() e PrismaCrm360Repository.updateLeadStage() mantinham 3
// listas divergentes do que fecha `Lead.closedAt` — este teste fixa o contrato único.
describe('enumMap — isLeadClosingStatus / LEAD_CLOSING_STATUSES', () => {
  it('reconhece os 4 status que fecham o lead', () => {
    expect(isLeadClosingStatus('Negócios Ganhos')).toBe(true);
    expect(isLeadClosingStatus('Negócios Perdidos')).toBe(true);
    expect(isLeadClosingStatus('Piloto Atlas Profile - Cancelado')).toBe(true);
    expect(isLeadClosingStatus('Piloto Logístico - Cancelado')).toBe(true);
  });

  it('não reconhece status abertos (incluindo Lead Desqualificado, que não fecha closedAt)', () => {
    expect(isLeadClosingStatus('Lead Recebido')).toBe(false);
    expect(isLeadClosingStatus('Qualificação (SDR)')).toBe(false);
    expect(isLeadClosingStatus('Nova Oportunidade')).toBe(false);
    expect(isLeadClosingStatus('Lead Desqualificado')).toBe(false);
  });

  it('trata null/undefined como não-fechamento, sem lançar', () => {
    expect(isLeadClosingStatus(null)).toBe(false);
    expect(isLeadClosingStatus(undefined)).toBe(false);
  });

  it('LEAD_CLOSING_STATUSES tem exatamente os 4 valores esperados', () => {
    expect([...LEAD_CLOSING_STATUSES].sort()).toEqual(
      ['Negócios Ganhos', 'Negócios Perdidos', 'Piloto Atlas Profile - Cancelado', 'Piloto Logístico - Cancelado'].sort(),
    );
  });
});
