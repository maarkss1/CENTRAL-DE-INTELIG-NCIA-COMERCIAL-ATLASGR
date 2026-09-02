import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { useRedisAuthState } from '../useRedisAuthState';

/**
 * Regressão de um bug P1 real: creds/keys de sessão do Baileys (equivalente a um token de
 * sessão do WhatsApp) eram gravadas em JSON.stringify puro no Redis, sem cifra — quem lesse o
 * Redis (operador de infra, backup vazado, RCE lateral) sequestrava a sessão sem precisar
 * escanear QR de novo.
 */
class FakeRedis {
  private store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return 'OK' as const;
  }
  async del(key: string) {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }
  raw(key: string) {
    return this.store.get(key);
  }
}

describe('useRedisAuthState — cifra de credenciais em repouso', () => {
  it('grava creds cifradas (não em JSON puro) e as chaves de sessão também', async () => {
    const redis = new FakeRedis();
    const { state } = await useRedisAuthState(redis as unknown as Redis, 'org-1');

    const rawCreds = redis.raw('wa-auth:org-1:creds');
    expect(rawCreds).toBeDefined();
    expect(rawCreds).toMatch(/^enc:v1:/);
    // Ciphertext nunca deve ser JSON válido / conter texto reconhecível do dado original.
    expect(() => JSON.parse(rawCreds as string)).toThrow();

    // O shape exato do valor não importa para este teste — só que ele trafega opaco (cifrado)
    // pelo Redis; `as never` evita amarrar o teste ao tipo KeyPair real do Baileys.
    await state.keys.set({
      'pre-key': { '1': { some: 'secret-key-material' } },
    } as never);
    const rawPreKey = redis.raw('wa-auth:org-1:pre-key-1');
    expect(rawPreKey).toMatch(/^enc:v1:/);
    expect(rawPreKey).not.toContain('secret-key-material');

    const readBack = await state.keys.get('pre-key', ['1']);
    expect(readBack['1']).toEqual({ some: 'secret-key-material' });
  });

  it('continua lendo sessões legadas gravadas em JSON puro (antes desta correção), sem exigir migração', async () => {
    const redis = new FakeRedis();
    const legacyCreds = { legacyField: 'valor-gravado-antes-da-cifra' };
    await redis.set('wa-auth:org-2:creds', JSON.stringify(legacyCreds));

    const { state } = await useRedisAuthState(redis as unknown as Redis, 'org-2');

    expect(state.creds).toEqual(legacyCreds);
  });

  it('remove chaves quando o valor é apagado (delete continua funcionando com dado cifrado)', async () => {
    const redis = new FakeRedis();
    const { state } = await useRedisAuthState(redis as unknown as Redis, 'org-3');

    await state.keys.set({ 'pre-key': { '1': { some: 'value' } } } as never);
    expect(redis.raw('wa-auth:org-3:pre-key-1')).toBeDefined();

    await state.keys.set({ 'pre-key': { '1': null } });
    expect(redis.raw('wa-auth:org-3:pre-key-1')).toBeUndefined();
  });
});
