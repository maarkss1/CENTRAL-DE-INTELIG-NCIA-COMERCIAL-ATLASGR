const fs = require('fs');
let code = fs.readFileSync('src/config/access-policy.ts', 'utf8');

code = code.replace(
    /return typeof email === 'string' && email\.length > 0;/g,
    "return typeof email === 'string' && AUTHORIZED_LOGIN_EMAILS.some((authorizedEmail) => normalizeLoginEmail(email) === authorizedEmail);"
);

fs.writeFileSync('src/config/access-policy.ts', code);
