#!/usr/bin/env node

// Roda antes de npm run test:integration (via pretest:integration no package.json).
//
// Corrige problemas reais do setup anterior (ver TEST-003 em
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
// 3. `.env.test.example` apontava para "prospectordb" — o MESMO banco que o dev usa. Testes de
//    integração fazem create/delete de linhas de verdade; sem um banco isolado, rodar
//    `test:integration` localmente misturaria (ou destruiria) dado de dev de verdade. O banco
//    isolado ("prospectordb_test", mesmo nome que o CI usa) não existe por padrão no Postgres do
//    docker-compose.yml (que só cria "prospectordb" na inicialização) — este script garante que
//    ele exista, com a extensão vector e o papel `prospector_app` prontos, antes de qualquer coisa
//    depender disso (mesmo script SQL que scripts/db/bootstrap-app-role.sh usa no CI).

import { existsSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

const isCI = process.env.CI === 'true' || process.env.CI === '1';
const envTestPath = path.resolve(process.cwd(), '.env.test');
const envTestExamplePath = path.resolve(process.cwd(), '.env.test.example');

const POSTGRES_CONTAINER = 'atlas_postgres';
const BOOTSTRAP_SUPERUSER = 'prospector';
const BOOTSTRAP_DB = 'prospectordb';
const TEST_DB_NAME = 'prospectordb_test';
const APP_ROLE_PASSWORD = 'prospector_app_pass';

if (!isCI) {
  // Sobe só o que os testes precisam (postgres/redis/meilisearch) — o serviço litellm do mesmo
  // compose não é dependência de teste. Um stub `{ status: 0 }` chegou a substituir este spawn e
  // o script passou a EXIGIR os containers já de pé sem nunca subi-los, contradizendo o próprio
  // comentário do topo ("local, continuamos subindo a stack normalmente").
  const result = spawnSync('docker', ['compose', 'up', '-d', 'postgres', 'redis', 'meilisearch'], {
    stdio: 'inherit',
  });
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

// Só local: no CI, o service container do Postgres já sobe com POSTGRES_DB=prospectordb_test
// (ver .github/workflows/ci.yml), e um step dedicado do workflow já roda o mesmo bootstrap.
if (!isCI) {
  // O compose up retorna assim que o container inicia — o postgres dentro dele ainda está no
  // initdb (primeiro boot demora vários segundos). Sem esta espera, o docker exec psql abaixo
  // falhava com "connection to server on socket ... failed" em toda primeira execução.
  const readyDeadline = Date.now() + 60000;
  for (;;) {
    const ready = spawnSync('docker', [
      'exec', POSTGRES_CONTAINER, 'pg_isready', '-U', BOOTSTRAP_SUPERUSER, '-d', BOOTSTRAP_DB,
    ], { encoding: 'utf-8' });
    if (ready.status === 0) break;
    if (Date.now() > readyDeadline) {
      console.error('Timeout esperando o Postgres do container ficar pronto (pg_isready).');
      process.exit(1);
    }
    // Sleep portátil (o `timeout` do Windows recusa stdin redirecionado; `sleep` não existe lá).
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], { stdio: 'ignore' });
  }

  const exists = spawnSync('docker', [
    'exec', POSTGRES_CONTAINER, 'psql', '-U', BOOTSTRAP_SUPERUSER, '-d', BOOTSTRAP_DB, '-tAc',
    `SELECT 1 FROM pg_database WHERE datname='${TEST_DB_NAME}'`,
  ], { encoding: 'utf-8' });
  if (exists.status !== 0) {
    console.error(exists.stderr || 'Falha ao verificar se o banco de teste isolado já existe.');
    process.exit(exists.status || 1);
  }

  if (exists.stdout.trim() !== '1') {
    console.log(`Banco "${TEST_DB_NAME}" não existe — criando (isolado de "${BOOTSTRAP_DB}", nunca usado pelo dev).`);
    const create = spawnSync('docker', [
      'exec', POSTGRES_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', BOOTSTRAP_SUPERUSER, '-d', BOOTSTRAP_DB,
      '-c', `CREATE DATABASE ${TEST_DB_NAME} OWNER ${BOOTSTRAP_SUPERUSER};`,
    ], { stdio: 'inherit' });
    if (create.status !== 0) {
      console.error(`Falha ao criar o banco "${TEST_DB_NAME}".`);
      process.exit(create.status || 1);
    }
  }

  // Idempotente (ver create-app-role.sql): garante a extensão vector e o papel/ownership de
  // prospector_app — sem isso, FORCE ROW LEVEL SECURITY não vale nada, porque o dono dos objetos
  // ainda seria o superusuário de bootstrap, que RLS nunca restringe.
  const bootstrap = spawnSync('docker', [
    'exec', POSTGRES_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', BOOTSTRAP_SUPERUSER, '-d', TEST_DB_NAME,
    '-v', `app_password=${APP_ROLE_PASSWORD}`,
    '-f', '/docker-entrypoint-initdb.d/create-app-role.sql.tpl',
  ], { stdio: 'inherit' });
  if (bootstrap.status !== 0) {
    console.error(`Falha ao preparar papel/extensão em "${TEST_DB_NAME}".`);
    process.exit(bootstrap.status || 1);
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
