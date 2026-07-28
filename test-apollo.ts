import * as dotenv from 'dotenv';
dotenv.config();
import { initTracing } from './src/lib/tracing.js';
initTracing();
import { fetchApolloCandidates } from './src/features/prospecting/services/apollo.service.js';

async function run() {
  const res = await fetchApolloCandidates({
      segmento: 'Logística',
      localizacao: 'São Paulo',
      quantidade: 1
  }, 1);
  console.log(JSON.stringify(res, null, 2));
  process.exit(0);
}
run();
