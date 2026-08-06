const fs = require('fs');

let tests = fs.readFileSync('tests/unit/features/analytics/analytics.service.test.ts', 'utf8');

tests = tests.replace(/args\.where\.status === 'Negocios_Perdidos'/g,
  "args.where.status?.in?.includes('Negocios_Perdidos')"
);
fs.writeFileSync('tests/unit/features/analytics/analytics.service.test.ts', tests);
