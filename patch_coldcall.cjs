const fs = require('fs');

let tests = fs.readFileSync('src/features/integrations/birth-voice/__tests__/coldCall.service.test.ts', 'utf8');

tests = tests.replace(/2026-08-03T13:00:00Z/g, "2026-08-03T14:00:00Z");
fs.writeFileSync('src/features/integrations/birth-voice/__tests__/coldCall.service.test.ts', tests);
