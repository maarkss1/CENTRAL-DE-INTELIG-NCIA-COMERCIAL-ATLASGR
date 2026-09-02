import {
  initAuthCreds,
  BufferJSON,
  type AuthenticationState,
  type AuthenticationCreds,
} from '@whiskeysockets/baileys';
import type { Redis } from 'ioredis';
import { encryptField, decryptField } from '../../../lib/crypto/secretFields.js';

/**
 * Adaptador de estado de autenticação do Baileys (WhatsApp) para o Redis.
 * Permite que múltiplas instâncias da aplicação compartilhem a mesma sessão,
 * e sobrevive a reinicializações de contêineres sem perder o login.
 *
 * SEC-014: creds/keys de sessão do Baileys (equivalente a um token de sessão do WhatsApp —
 * quem lê o Redis sequestra a sessão sem precisar escanear QR de novo) são cifradas em repouso
 * com o mesmo AES-256-GCM (secretFields.ts) já usado para credenciais Google/Bitrix, em vez de
 * JSON.stringify puro. decryptField já é tolerante a valores legados sem o prefixo "enc:v1:"
 * (sessões gravadas antes desta correção continuam sendo lidas normalmente e são re-cifradas no
 * próximo saveCreds/set).
 */
export const useRedisAuthState = async (
  redisClient: Redis,
  organizationId: string,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const prefix = `wa-auth:${organizationId}:`;

  const writeData = async (key: string, data: any) => {
    const serialized = JSON.stringify(data, BufferJSON.replacer);
    await redisClient.set(`${prefix}${key}`, encryptField(serialized));
  };

  const readData = async (key: string) => {
    const stored = await redisClient.get(`${prefix}${key}`);
    if (!stored) return null;
    const serialized = decryptField(stored);
    return JSON.parse(serialized, BufferJSON.reviver);
  };

  const removeData = async (key: string) => {
    await redisClient.del(`${prefix}${key}`);
  };

  let creds: AuthenticationCreds;
  const credsData = await readData('creds');
  if (credsData) {
    creds = credsData;
  } else {
    creds = initAuthCreds();
    await writeData('creds', creds);
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: { [key: string]: any } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = import('@whiskeysockets/baileys').then((b) =>
                  b.proto.Message.AppStateSyncKeyData.fromObject(value),
                );
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(key, value) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData('creds', creds),
  };
};
