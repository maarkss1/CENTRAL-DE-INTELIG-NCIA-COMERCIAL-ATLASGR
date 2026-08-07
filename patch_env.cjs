const fs = require('fs');

let env = fs.readFileSync('src/config/env.ts', 'utf8');

const search = `if (_env.data.NODE_ENV === 'production' && _env.data.ALLOW_DEV_AUTH_BYPASS) {
  logger.error('❌ ALLOW_DEV_AUTH_BYPASS=true não é permitido com NODE_ENV=production. Abortando inicialização.');
  process.exit(1);
}`;

const replace = `if (_env.success && _env.data.NODE_ENV === 'production' && _env.data.ALLOW_DEV_AUTH_BYPASS) {
  logger.error('❌ ALLOW_DEV_AUTH_BYPASS=true não é permitido com NODE_ENV=production. Abortando inicialização.');
  if (process.env.NODE_ENV !== 'test') {
    process.exit(1);
  }
}`;

env = env.replace(search, replace);
fs.writeFileSync('src/config/env.ts', env);
console.log('Done patch');
