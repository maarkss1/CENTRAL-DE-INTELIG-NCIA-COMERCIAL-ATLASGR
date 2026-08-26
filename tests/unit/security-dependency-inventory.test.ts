import { describe, expect, it } from 'vitest';

import {
  buildInventory,
  parseDeprecatedFromLog,
  PRERELEASE_PATTERN,
  type PackageLock,
} from '../../scripts/security/dependency-inventory';

describe('dependency inventory — detecção de pré-release', () => {
  it('reconhece rc/beta/alpha/next/canary com e sem sufixo numérico', () => {
    for (const version of [
      '7.0.0-rc13',
      '1.0.0-rc.3',
      '4.0.1-alpha.0',
      '1.0.0-beta.2',
      '2.0.0-next.7',
      '1.2.3-canary',
      '1.2.3-dev.5',
    ]) {
      expect(version).toMatch(PRERELEASE_PATTERN);
    }
  });

  it('não marca versão estável (com hífen em outro contexto, ex.: build metadata) como pré-release', () => {
    for (const version of ['1.2.3', '10.5.0', '2.0.0-final', '1.0.0-legacy']) {
      expect(version).not.toMatch(PRERELEASE_PATTERN);
    }
  });

  it('classifica pacote direto vs. transitivo e resolve o nome a partir da chave do lockfile', () => {
    const lock: PackageLock = {
      packages: {
        '': { version: '0.0.1' },
        'node_modules/@whiskeysockets/baileys': { version: '7.0.0-rc13' },
        'node_modules/express': { version: '4.21.2' },
        'node_modules/foo/node_modules/bar': { version: '1.0.0-beta.1' },
      },
    };
    const rows = buildInventory(lock, new Set(['@whiskeysockets/baileys', 'express']));

    const baileys = rows.find((r) => r.name === '@whiskeysockets/baileys');
    expect(baileys).toMatchObject({ direct: true, prerelease: 'rc13' });

    const express = rows.find((r) => r.name === 'express');
    expect(express).toMatchObject({ direct: true, prerelease: null });

    const bar = rows.find((r) => r.name === 'bar');
    expect(bar).toMatchObject({ direct: false, prerelease: 'beta.1' });
  });

  it('prioriza a instância pré-release quando o mesmo pacote resolve em versões diferentes na árvore', () => {
    // Reproduz o caso real encontrado em produção: `resolve` aparece estável dentro de
    // `proxyquire` e em pré-release (2.0.0-next.7) na raiz — a raiz não pode ficar escondida atrás
    // da nested estável só por ordem de iteração das chaves do lockfile.
    const lock: PackageLock = {
      packages: {
        'node_modules/proxyquire/node_modules/resolve': { version: '1.22.12' },
        'node_modules/resolve': { version: '2.0.0-next.7' },
      },
    };
    const rows = buildInventory(lock, new Set());
    const resolveRows = rows.filter((r) => r.name === 'resolve');
    expect(resolveRows).toHaveLength(1);
    expect(resolveRows[0]).toMatchObject({ version: '2.0.0-next.7', prerelease: 'next.7' });
  });

  it('ignora a entrada raiz do próprio projeto (chave vazia no lockfile)', () => {
    const lock: PackageLock = { packages: { '': { version: '9.9.9-rc1' } } };
    expect(buildInventory(lock, new Set())).toHaveLength(0);
  });
});

describe('dependency inventory — parsing de `npm warn deprecated`', () => {
  it('extrai pacote, versão e mensagem de um log real de `npm ci`', () => {
    const log = [
      'npm warn deprecated fstream@1.0.12: This package is no longer supported.',
      'npm warn deprecated glob@7.2.3: Old versions of glob are not supported, and contain widely publicized security vulnerabilities.',
      '',
      '> react-example@0.0.1 postinstall',
      'added 1585 packages in 2m',
    ].join('\n');

    const rows = parseDeprecatedFromLog(log);
    expect(rows).toEqual([
      { name: 'fstream', version: '1.0.12', message: 'This package is no longer supported.' },
      {
        name: 'glob',
        version: '7.2.3',
        message:
          'Old versions of glob are not supported, and contain widely publicized security vulnerabilities.',
      },
    ]);
  });

  it('deduplica a mesma dependência avisada mais de uma vez (várias cadeias transitivas)', () => {
    const log = [
      'npm warn deprecated glob@7.2.3: mensagem',
      'npm warn deprecated glob@7.2.3: mensagem',
      'npm warn deprecated glob@7.2.3: mensagem',
    ].join('\n');
    expect(parseDeprecatedFromLog(log)).toHaveLength(1);
  });

  it('mantém entradas separadas para versões diferentes do mesmo pacote', () => {
    const log = [
      'npm warn deprecated glob@7.2.3: mensagem antiga',
      'npm warn deprecated glob@10.5.0: mensagem antiga',
    ].join('\n');
    expect(parseDeprecatedFromLog(log)).toHaveLength(2);
  });

  it('retorna lista vazia quando o log não tem nenhum aviso de deprecated', () => {
    const log = '> react-example@0.0.1 postinstall\nadded 1585 packages in 2m';
    expect(parseDeprecatedFromLog(log)).toEqual([]);
  });
});
