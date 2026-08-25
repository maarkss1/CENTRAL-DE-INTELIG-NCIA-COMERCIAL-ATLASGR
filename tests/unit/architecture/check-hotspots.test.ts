import { describe, expect, it } from 'vitest';

import { evaluateFile, parseExceptions, HARD_LIMIT_LINES, WARN_LIMIT_LINES } from '../../../scripts/architecture/check-hotspots';

describe('architecture hotspot gate', () => {
  describe('parseExceptions', () => {
    it('returns nothing when there is no "## Exceções ativas" section', () => {
      expect(parseExceptions('# Doc\n\n## Outra seção\nnada aqui')).toEqual([]);
    });

    it('parses a well-formed exception block', () => {
      const markdown = `
## Exceções ativas

### \`src/features/x/Big.tsx\`

- **Limite excepcional:** 1500 linhas
- **Dono:** Agente 04 — CRM e BI
- **Motivo:** refatoração planejada, fora de escopo desta wave
- **Registrado em:** 2026-08-25
- **Reavaliar até:** 2099-01-01

## Próxima seção
ignorado
`;
      const result = parseExceptions(markdown);
      expect(result).toEqual([
        {
          file: 'src/features/x/Big.tsx',
          limitLines: 1500,
          owner: 'Agente 04 — CRM e BI',
          reavaliarAte: '2099-01-01',
        },
      ]);
    });

    it('ignores an example block placed outside the "Exceções ativas" section', () => {
      const markdown = `
## Formato de uma exceção nova

### \`caminho/exemplo.ts\`
- **Limite excepcional:** 1 linhas
- **Dono:** ninguém
- **Reavaliar até:** 2000-01-01

## Exceções ativas

Nenhuma no momento.
`;
      expect(parseExceptions(markdown)).toEqual([]);
    });

    it('parses multiple entries in the same section', () => {
      const markdown = `
## Exceções ativas

### \`a.ts\`
- **Limite excepcional:** 1100 linhas
- **Dono:** Agente 01
- **Reavaliar até:** 2099-01-01

### \`b.ts\`
- **Limite excepcional:** 1200 linhas
- **Dono:** Agente 02
- **Reavaliar até:** 2099-06-01
`;
      const result = parseExceptions(markdown);
      expect(result.map((e) => e.file)).toEqual(['a.ts', 'b.ts']);
    });
  });

  describe('evaluateFile', () => {
    const now = new Date('2026-08-25T00:00:00Z');

    it('passes files at or below the warn limit', () => {
      const verdict = evaluateFile('src/x.ts', WARN_LIMIT_LINES, [], now);
      expect(verdict.status).toBe('ok');
    });

    it('warns (non-blocking) for files between the warn and hard limit', () => {
      const verdict = evaluateFile('src/x.ts', WARN_LIMIT_LINES + 1, [], now);
      expect(verdict.status).toBe('warn');
    });

    it('warns at exactly the hard limit boundary (inclusive)', () => {
      const verdict = evaluateFile('src/x.ts', HARD_LIMIT_LINES, [], now);
      expect(verdict.status).toBe('warn');
    });

    it('fails a file above the hard limit with no exception', () => {
      const verdict = evaluateFile('src/x.ts', HARD_LIMIT_LINES + 1, [], now);
      expect(verdict.status).toBe('fail');
    });

    it('passes a file above the hard limit when covered by a valid, non-expired exception', () => {
      const verdict = evaluateFile(
        'src/x.ts',
        1200,
        [{ file: 'src/x.ts', limitLines: 1500, owner: 'Agente 01', reavaliarAte: '2099-01-01' }],
        now,
      );
      expect(verdict.status).toBe('ok-exception');
    });

    it('fails when the exception exists but its own excepted limit is exceeded', () => {
      const verdict = evaluateFile(
        'src/x.ts',
        1600,
        [{ file: 'src/x.ts', limitLines: 1500, owner: 'Agente 01', reavaliarAte: '2099-01-01' }],
        now,
      );
      expect(verdict.status).toBe('fail');
    });

    it('fails when the exception is expired, even if the file fits the excepted limit', () => {
      const verdict = evaluateFile(
        'src/x.ts',
        1200,
        [{ file: 'src/x.ts', limitLines: 1500, owner: 'Agente 01', reavaliarAte: '2020-01-01' }],
        now,
      );
      expect(verdict.status).toBe('fail');
      expect((verdict as { reason: string }).reason).toMatch(/prazo vencido/);
    });

    it('fails when the exception is missing an owner or a review date', () => {
      const verdict = evaluateFile(
        'src/x.ts',
        1200,
        [{ file: 'src/x.ts', limitLines: 1500, owner: null, reavaliarAte: '2099-01-01' }],
        now,
      );
      expect(verdict.status).toBe('fail');
    });

    it('does not apply an exception registered for a different file', () => {
      const verdict = evaluateFile(
        'src/y.ts',
        1200,
        [{ file: 'src/x.ts', limitLines: 1500, owner: 'Agente 01', reavaliarAte: '2099-01-01' }],
        now,
      );
      expect(verdict.status).toBe('fail');
    });
  });
});
