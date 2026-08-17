import { initAuthCreds, BufferJSON, AuthenticationState, AuthenticationCreds } from '@whiskeysockets/baileys';
import { Redis } from 'ioredis';

/**
 * Adaptador de estado de autenticação do Baileys (WhatsApp) para o Redis.
 * Permite que múltiplas instâncias da aplicação compartilhem a mesma sessão,
 * e sobrevive a reinicializações de contêineres sem perder o login.
 */
export const useRedisAuthState = async (
    redisClient: Redis,
    organizationId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
    const prefix = `wa-auth:${organizationId}:`;

    const writeData = async (key: string, data: any) => {
        await redisClient.set(`${prefix}${key}`, JSON.stringify(data, BufferJSON.replacer));
    };

    const readData = async (key: string) => {
        const data = await redisClient.get(`${prefix}${key}`);
        if (!data) return null;
        return JSON.parse(data, BufferJSON.reviver);
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
                                value = import('@whiskeysockets/baileys').then(b => b.proto.Message.AppStateSyncKeyData.fromObject(value));
                            }
                            data[id] = value;
                        })
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
                }
            }
        },
        saveCreds: () => writeData('creds', creds)
    };
};
