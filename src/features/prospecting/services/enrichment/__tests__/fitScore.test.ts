import { describe, expect, it } from 'vitest';
import { computeFitScore } from '@/features/prospecting/services/enrichment/fitScore';

// ACH-05-04 (auditoria 2026-09-11, agente 05): computeFitScore é o score explicável exigido pela
// missão original da Onda 2 e nunca teve teste dedicado. Determinístico e puro — sem I/O — então
// cada caso confirma score final, temperatura e o conteúdo do breakdown (o que o vendedor lê na
// tela), não só o total.

describe('computeFitScore', () => {
  it('sem nenhum critério informado, aplica só os 25 pontos base de participação no funil', () => {
    const result = computeFitScore({});

    expect(result.score).toBe(25);
    expect(result.temperature).toBe('Frio');
    expect(result.breakdown).toEqual([]);
  });

  describe('situação cadastral', () => {
    it('CNPJ ATIVA soma +30 e registra o breakdown', () => {
      const result = computeFitScore({ situacaoCadastral: 'ATIVA' });

      expect(result.score).toBe(55);
      expect(result.breakdown).toContainEqual({
        label: 'Situação cadastral',
        points: 30,
        detail: 'CNPJ ativo na Receita Federal',
      });
    });

    it('é case-insensitive (ativa minúsculo também soma +30)', () => {
      expect(computeFitScore({ situacaoCadastral: 'ativa' }).score).toBe(55);
    });

    it('qualquer situação diferente de ATIVA subtrai 40 e pode zerar o score', () => {
      const result = computeFitScore({ situacaoCadastral: 'BAIXADA' });

      // 25 base - 40 = -15, nunca negativo (clamp em 0)
      expect(result.score).toBe(0);
      expect(result.temperature).toBe('Frio');
      expect(result.breakdown).toContainEqual({
        label: 'Situação cadastral',
        points: -40,
        detail: 'CNPJ com situação "BAIXADA" — risco alto',
      });
    });
  });

  describe('capital social', () => {
    it('>= 100 mil soma +20', () => {
      expect(computeFitScore({ capitalSocial: 100_000 }).score).toBe(45);
      expect(computeFitScore({ capitalSocial: 500_000 }).score).toBe(45);
    });

    it('entre 10 mil e 100 mil soma +10', () => {
      const result = computeFitScore({ capitalSocial: 50_000 });
      expect(result.score).toBe(35);
      expect(result.breakdown).toContainEqual({
        label: 'Capital social',
        points: 10,
        detail: 'Capital social entre R$ 10 mil e R$ 100 mil',
      });
    });

    it('abaixo de 10 mil não soma pontos, mas ainda aparece no breakdown com 0', () => {
      const result = computeFitScore({ capitalSocial: 5_000 });
      expect(result.score).toBe(25);
      expect(result.breakdown).toContainEqual({
        label: 'Capital social',
        points: 0,
        detail: 'Capital social baixo (< R$ 10 mil)',
      });
    });
  });

  describe('porte estimado (funcionários)', () => {
    it('50+ soma +20', () => {
      expect(computeFitScore({ employeeCountEstimate: 50 }).score).toBe(45);
    });

    it('10-49 soma +12', () => {
      expect(computeFitScore({ employeeCountEstimate: 10 }).score).toBe(37);
      expect(computeFitScore({ employeeCountEstimate: 49 }).score).toBe(37);
    });

    it('1-9 soma +5', () => {
      expect(computeFitScore({ employeeCountEstimate: 1 }).score).toBe(30);
    });
  });

  describe('aderência de CNAE ao ICP', () => {
    it('soma +25 quando alguma keyword do segmento aparece na descrição do CNAE (case-insensitive)', () => {
      const result = computeFitScore({
        segmentKeywords: ['Transporte', 'Logística'],
        cnaeDescription: 'Transporte rodoviário de carga',
      });

      expect(result.score).toBe(50);
      expect(result.breakdown).toContainEqual({
        label: 'Aderência de CNAE ao ICP',
        points: 25,
        detail: 'Atividade "Transporte rodoviário de carga" combina com o segmento buscado',
      });
    });

    it('não soma nada quando nenhuma keyword bate — mas registra 0 no breakdown', () => {
      const result = computeFitScore({
        segmentKeywords: ['Restaurante'],
        cnaeDescription: 'Comércio varejista de roupas',
      });

      expect(result.score).toBe(25);
      expect(result.breakdown).toContainEqual({
        label: 'Aderência de CNAE ao ICP',
        points: 0,
        detail: 'Atividade "Comércio varejista de roupas" não confirma o segmento buscado',
      });
    });

    it('não avalia o critério quando faltam segmentKeywords ou cnaeDescription', () => {
      expect(computeFitScore({ cnaeDescription: 'Transporte' }).breakdown).toEqual([]);
      expect(computeFitScore({ segmentKeywords: ['Transporte'] }).breakdown).toEqual([]);
    });
  });

  describe('critérios do playbook comercial', () => {
    it('frota "acima de 50" soma +15', () => {
      const result = computeFitScore({ fleetSizeHint: 'Acima de 50 veículos' });
      expect(result.score).toBe(40);
      expect(result.breakdown).toContainEqual({
        label: 'Frota (playbook comercial)',
        points: 15,
        detail: 'Frota acima de 50 veículos — critério de priorização',
      });
    });

    it('faixas "150-500" e "acima de 500" também qualificam', () => {
      expect(computeFitScore({ fleetSizeHint: '150-500 veículos' }).score).toBe(40);
      expect(computeFitScore({ fleetSizeHint: 'Acima de 500 veículos' }).score).toBe(40);
    });

    it('frota abaixo do critério não soma nada', () => {
      expect(computeFitScore({ fleetSizeHint: '1-10 veículos' }).score).toBe(25);
    });

    it('estado RJ ou SP soma +10 (região de maior risco de roubo de carga)', () => {
      const result = computeFitScore({ state: 'SP', city: 'São Paulo' });
      expect(result.score).toBe(35);
      expect(result.breakdown).toContainEqual({
        label: 'Região de risco (playbook comercial)',
        points: 10,
        detail: 'Atuação em SÃO PAULO SP — região com maior índice de roubo de carga',
      });

      expect(computeFitScore({ state: 'RJ' }).score).toBe(35);
      expect(computeFitScore({ state: 'MG' }).score).toBe(25);
    });

    it('categoria de carga de risco (NTC) soma +10 quando o CNAE/segmento cita uma delas', () => {
      const result = computeFitScore({ cnaeDescription: 'Indústria alimentícia' });
      expect(result.score).toBe(35);
      expect(result.breakdown).toContainEqual({
        label: 'Categoria de carga de risco (NTC)',
        points: 10,
        detail: 'Atividade sugere transporte de carga com maior índice de roubo no Brasil',
      });
    });

    it('stack de ERP/TMS logístico detectado via Apollo soma +5 e cita a tecnologia encontrada', () => {
      const result = computeFitScore({ technologies: ['Google Workspace', 'SAP Business One'] });
      expect(result.score).toBe(30);
      expect(result.breakdown).toContainEqual({
        label: 'Stack de ERP/TMS (Apollo)',
        points: 5,
        detail:
          'Usa "SAP Business One" — indício de operação já digitalizada, mais fácil de integrar',
      });
    });

    it('tecnologia sem relação com ERP/TMS logístico não soma nada', () => {
      expect(computeFitScore({ technologies: ['Slack', 'Zoom'] }).score).toBe(25);
    });
  });

  describe('playbook comercial ativo (ACH-05-07)', () => {
    it('sem activePlaybook informado, cai no padrão (atlasgr/logística) — comportamento preservado', () => {
      const result = computeFitScore({ fleetSizeHint: 'Acima de 50 veículos', state: 'SP' });
      expect(result.score).toBe(50); // 25 base + 15 frota + 10 região
      expect(result.breakdown.some((i) => i.label.includes('Frota'))).toBe(true);
    });

    it('com activePlaybook explícito "atlasgr" (logística), os bônus continuam valendo', () => {
      const result = computeFitScore({
        fleetSizeHint: 'Acima de 50 veículos',
        state: 'RJ',
        cnaeDescription: 'Indústria alimentícia',
        technologies: ['TOTVS Protheus'],
        activePlaybook: 'atlasgr',
      });

      expect(result.breakdown.some((i) => i.label.includes('Frota'))).toBe(true);
      expect(result.breakdown.some((i) => i.label.includes('Região de risco'))).toBe(true);
      expect(result.breakdown.some((i) => i.label.includes('Categoria de carga'))).toBe(true);
      expect(result.breakdown.some((i) => i.label.includes('Stack de ERP/TMS'))).toBe(true);
    });

    it('playbook não-logístico (totaltrac) não recebe bônus de frota/região/carga/stack de ERP-TMS', () => {
      const result = computeFitScore({
        fleetSizeHint: 'Acima de 500 veículos',
        state: 'RJ',
        city: 'Rio de Janeiro',
        cnaeDescription: 'Indústria alimentícia',
        segment: 'Alimentos',
        technologies: ['TOTVS Protheus', 'SAP Business One'],
        activePlaybook: 'totaltrac',
      });

      // Só os 25 pontos base de participação no funil — nenhum critério logístico se aplica.
      expect(result.score).toBe(25);
      expect(result.breakdown).toEqual([]);
      expect(result.breakdown.some((i) => i.label.includes('Frota'))).toBe(false);
      expect(result.breakdown.some((i) => i.label.includes('Região de risco'))).toBe(false);
      expect(result.breakdown.some((i) => i.label.includes('Categoria de carga'))).toBe(false);
      expect(result.breakdown.some((i) => i.label.includes('Stack de ERP/TMS'))).toBe(false);
    });

    it('playbook não-logístico ainda soma normalmente os critérios universais (situação cadastral, capital, porte, CNAE-ICP)', () => {
      const result = computeFitScore({
        situacaoCadastral: 'ATIVA',
        capitalSocial: 200_000,
        employeeCountEstimate: 60,
        segmentKeywords: ['Telemetria'],
        cnaeDescription: 'Serviços de telemetria e rastreamento veicular',
        // Estes campos teriam gerado bônus logístico se o playbook fosse 'atlasgr':
        fleetSizeHint: 'Acima de 500 veículos',
        state: 'SP',
        activePlaybook: 'totaltrac',
      });

      expect(result.breakdown.some((i) => i.label === 'Situação cadastral')).toBe(true);
      expect(result.breakdown.some((i) => i.label === 'Capital social')).toBe(true);
      expect(result.breakdown.some((i) => i.label === 'Porte estimado')).toBe(true);
      expect(result.breakdown.some((i) => i.label === 'Aderência de CNAE ao ICP')).toBe(true);
      expect(result.breakdown.some((i) => i.label.includes('Frota'))).toBe(false);
      expect(result.breakdown.some((i) => i.label.includes('Região de risco'))).toBe(false);
    });
  });

  describe('clamping e temperatura', () => {
    it('nunca ultrapassa 100 mesmo somando todos os critérios positivos', () => {
      const result = computeFitScore({
        situacaoCadastral: 'ATIVA',
        capitalSocial: 200_000,
        employeeCountEstimate: 80,
        segmentKeywords: ['Transporte'],
        cnaeDescription: 'Transporte rodoviário de cargas alimentícias',
        fleetSizeHint: 'Acima de 500 veículos',
        state: 'SP',
        city: 'São Paulo',
        technologies: ['TOTVS Protheus'],
      });

      expect(result.score).toBe(100);
      expect(result.temperature).toBe('Quente');
    });

    it('nunca fica negativo mesmo só com penalidades', () => {
      expect(computeFitScore({ situacaoCadastral: 'INAPTA' }).score).toBe(0);
    });

    it('score >= 75 é "Quente"', () => {
      // 25 base + ATIVA (30) + capital >= 100k (20) = 75 exatamente
      const result = computeFitScore({ situacaoCadastral: 'ATIVA', capitalSocial: 100_000 });
      expect(result.score).toBe(75);
      expect(result.temperature).toBe('Quente');
    });

    it('score entre 45 e 74 é "Morno"', () => {
      // 25 base + capital >= 100k (20) = 45 exatamente
      const result = computeFitScore({ capitalSocial: 100_000 });
      expect(result.score).toBe(45);
      expect(result.temperature).toBe('Morno');
    });

    it('score abaixo de 45 é "Frio"', () => {
      // 25 base + capital entre 10k-100k (10) = 35
      const result = computeFitScore({ capitalSocial: 50_000 });
      expect(result.score).toBe(35);
      expect(result.temperature).toBe('Frio');
    });
  });
});
