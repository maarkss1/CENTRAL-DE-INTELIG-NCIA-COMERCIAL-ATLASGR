// Smoke de latencia dos endpoints criticos (ITEM-15, remediacao de divida tecnica — "Budgets de
// performance, bundle e tamanho"). Os thresholds abaixo materializam os SLOs ja documentados em
// docs/SRE.md (secao 1) em algo que falha um comando/CI, em vez de ficar so em prosa:
//   - liveness (/health/live): so verifica o event loop do Node, sem I/O — deve ser quase
//     instantaneo. p95<100ms.
//   - readiness (/health/ready): toca Postgres (`SELECT 1`) e, quando filas estao habilitadas,
//     faz PING no Redis (ver server.ts) — e o endpoint mais proximo de uma dependencia externa
//     real que pode ser exercitado sem autenticacao. Usamos o teto de latencia transacional do
//     SRE.md (p95<500ms) como budget conservador para ele.
//
// Uso local (docker-compose, requer app rodando em BASE_URL):
//   npm run load:k6
// Uso em CI: .github/workflows/endpoint-latency-budget.yml (k6 binario, sem docker), contra a
// mesma app subida como em tests/e2e (`npm run start:e2e`).
//
// Cobertura conhecida como incompleta: endpoints autenticados de CRM (ex.: listagem de
// contatos/leads, citados no SRE.md 1.2 como exemplo de rota transacional) nao sao exercitados
// aqui ainda — exigiriam simular login/sessao dentro do k6. Registrado como debito derivado em
// docs/development/PERFORMANCE_BUDGETS.md em vez de forjar uma chamada autenticada só para
// preencher a métrica.
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 10 },
    { duration: '40s', target: 10 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{endpoint:liveness}': ['p(95)<100'],
    'http_req_duration{endpoint:readiness}': ['p(95)<500'],
  },
};

const baseUrl = __ENV.BASE_URL || 'http://host.docker.internal:3000';

export default function () {
  const liveness = http.get(`${baseUrl}/health/live`, { tags: { endpoint: 'liveness' } });
  check(liveness, { 'liveness responde 200': (result) => result.status === 200 });

  const readiness = http.get(`${baseUrl}/health/ready`, { tags: { endpoint: 'readiness' } });
  check(readiness, { 'readiness responde 200': (result) => result.status === 200 });

  sleep(1);
}
