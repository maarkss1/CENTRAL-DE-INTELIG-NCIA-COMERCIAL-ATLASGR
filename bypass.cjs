const fs = require('fs');
const content = fs.readFileSync('src/contexts/AuthContext.tsx', 'utf8');

const replaced = content.replace(
`  let currentUser: UserSession | null = null;

  if (sessionData?.user && isAuthorizedLoginEmail(sessionData.user.email)) {
      const user = sessionData.user;
      const isAdmin = user.email.toLowerCase() === 'marcelo.nascimento@atlasgr.com.br';

      currentUser = {
          id: user.id,
          name: user.name || 'Usuário',
          email: user.email,
          role: isAdmin ? 'admin' : 'user',
          roleTitle: isAdmin ? 'Administrador Master' : 'Executivo Comercial B2B',
          brand: 'atlasgr', // Default
          permissions: ['all'],
          avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500'
      };
  }`,
`  let currentUser: UserSession | null = {
      id: 'admin',
      name: 'Usuário (Bypass)',
      email: 'admin@prospector.com',
      role: 'admin',
      roleTitle: 'Administrador Master',
      brand: 'atlasgr',
      permissions: ['all'],
      avatarBg: 'bg-gradient-to-r from-blue-500 to-indigo-500'
  };`
);

const finalContent = replaced.replace(
  `const { data: sessionData, isPending } = authClient.useSession();`,
  `const sessionData = null; const isPending = false;`
);

fs.writeFileSync('src/contexts/AuthContext.tsx', finalContent);
console.log('Bypass applied!');
