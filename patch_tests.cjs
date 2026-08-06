const fs = require('fs');

let analytics = fs.readFileSync('tests/unit/features/analytics/analytics.service.test.ts', 'utf8');
analytics = analytics.replace(/args\.where\.status === 'Negócios Ganhos'/g, "args.where.status === 'Negócios Ganhos'");
analytics = analytics.replace(/status: 'Negócios Ganhos'/g, "status: 'Negócios Ganhos'");
fs.writeFileSync('tests/unit/features/analytics/analytics.service.test.ts', analytics);
