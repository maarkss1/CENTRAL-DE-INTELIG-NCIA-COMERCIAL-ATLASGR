const fs = require('fs');
let env = fs.readFileSync('src/config/env.ts', 'utf8');

const search = `export const env = _env.data;`;
const replace = `export const env = _env.data || process.env;`;

env = env.replace(search, replace);
fs.writeFileSync('src/config/env.ts', env);
