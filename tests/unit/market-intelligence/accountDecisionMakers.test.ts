import { describe, expect, it } from 'vitest';
import { classifyBuyingRole } from '@/features/market-intelligence/domain/accountDecisionMakers.js';

describe('classifyBuyingRole — nunca inventa papel sem cargo/senioridade real', () => {
  it('devolve null quando não há cargo, senioridade nem departamento', () => {
    const result = classifyBuyingRole({ role: null, seniority: null, department: null });
    expect(result).toBeNull();
  });

  it('classifica c_suite/owner/founder como Decisor Econômico com alta confiança', () => {
    for (const seniority of ['c_suite', 'owner', 'founder']) {
      const result = classifyBuyingRole({ role: 'CEO', seniority, department: null });
      expect(result?.buyingRole).toBe('Decisor Econômico');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
      expect(result?.reason).toContain(seniority);
    }
  });

  it('classifica VP/director técnico como Influenciador Técnico', () => {
    const result = classifyBuyingRole({ role: 'Diretor de TI', seniority: 'director', department: 'Tecnologia' });
    expect(result?.buyingRole).toBe('Influenciador Técnico');
  });

  it('classifica VP/director não-técnico como Decisor Operacional', () => {
    const result = classifyBuyingRole({ role: 'Diretor Comercial', seniority: 'director', department: 'Comercial' });
    expect(result?.buyingRole).toBe('Decisor Operacional');
  });

  it('classifica cargo técnico sem senioridade executiva como Influenciador Técnico, com confiança menor', () => {
    const withSeniority = classifyBuyingRole({ role: 'Diretor de TI', seniority: 'director', department: null });
    const withoutSeniority = classifyBuyingRole({ role: 'Analista de Sistemas', seniority: null, department: 'TI' });
    expect(withoutSeniority?.buyingRole).toBe('Influenciador Técnico');
    expect(withoutSeniority!.confidence).toBeLessThan(withSeniority!.confidence);
  });

  it('classifica manager ou cargo operacional como Decisor Operacional', () => {
    const byManager = classifyBuyingRole({ role: 'Coordenador', seniority: 'manager', department: null });
    const byKeyword = classifyBuyingRole({ role: 'Gerente de Frotas', seniority: null, department: null });
    expect(byManager?.buyingRole).toBe('Decisor Operacional');
    expect(byKeyword?.buyingRole).toBe('Decisor Operacional');
  });

  it('cai para Usuário Final quando há cargo/departamento mas nenhum sinal de senioridade decisória', () => {
    const result = classifyBuyingRole({ role: 'Assistente Administrativo', seniority: null, department: null });
    expect(result?.buyingRole).toBe('Usuário Final');
    expect(result?.confidence).toBeLessThan(0.5);
  });

  it('toda classificação inclui reason não vazio citando o dado real usado', () => {
    const result = classifyBuyingRole({ role: 'Gerente de TI', seniority: 'manager', department: 'Tecnologia' });
    expect(result?.reason.length).toBeGreaterThan(5);
  });
});
