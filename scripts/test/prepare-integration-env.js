#!/usr/bin/env node

// Roda antes de npm run test:integration (via pretest:integration no package.json).
//
// Corrige dois problemas reais do setup anterior (ver TEST-003 em
// docs/auditoria-divida-tecnica/07-PLANO-DE-TESTES.md):
//
// 1. `docker-compose up -d` incondicional quebrava no CI: o próprio ci.yml já sobe postgres/redis
//    como service containers nas mesmas portas (5434/6379) que o docker-compose.yml local usa, e
//    subir os dois ao mesmo tempo faz o docker-compose falhar tentando bindar uma porta ocupada.
//    Local, continuamos subindo a stack normalmente.
// 2. `.env.test` nunca era criado em lugar nenhum — dotenv -e .env.test falhava (ou rodava sem as
//    variáveis certas) tanto localmente quanto no CI. No CI, o próprio workflow agora escreve
//    .env.test com as credenciais reais do job antes deste script rodar; localmente, copiamos de
//    .env.test.example na primeira execução.

import { existsSync, copyFileSync } from 'fs';
import { spawnSync } from 'child_process';
import net from 'net';
import path from 'path';

const isCI = process.env.CI === 'true' || process.env.CI === '1';
const envTestPath = path.resolve(process.cwd(), '.env.test');
const envTestExamplePath = path.resolve(process.cwd(), '.env.test.example');

if (!isCI) {
  const result = spawnSync('docker-compose', ['up', '-d'], { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error('Falha ao subir docker-compose (postgres/redis/meilisearch). Veja a saída acima.');
    process.exit(result.status || 1);
  }
}

if (!existsSync(envTestPath)) {
  if (existsSync(envTestExamplePath)) {
    copyFileSync(envTestExamplePath, envTestPath);
    console.log('.env.test não existia — copiado de .env.test.example.');
  } else {
    console.error(
      '.env.test não encontrado e .env.test.example ausente. ' +
      'No CI isso deveria ter sido criado por um step do workflow antes deste script rodar.'
    );
    process.exit(1);
  }
}

function waitForPort(port, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tryConnect = () => {
      const client = new net.Socket();
      client.once('connect', () => {
        client.destroy();
        resolve();
      });
      client.once('error', () => {
        client.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timeout esperando ${host}:${port} ficar disponível.`));
        } else {
          setTimeout(tryConnect, 1000);
        }
      });
      client.connect(port, host);
    };
    tryConnect();
  });
}

waitForPort(5434, 'localhost', 60000)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
