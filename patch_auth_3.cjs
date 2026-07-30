const fs = require('fs');

function replaceFile(filepath, searchValue, replaceValue) {
    if(fs.existsSync(filepath)) {
        let code = fs.readFileSync(filepath, 'utf8');
        code = code.replace(searchValue, replaceValue);
        fs.writeFileSync(filepath, code);
    }
}

// Fix contexts/AuthContext.tsx
// error TS2322: Type '{ id: string; name: string; email: string; role: {}; roleTitle: string; brand: "atlasgr" | "totaltrac"; permissions: string[]; avatarBg: string; } | null' is not assignable to type 'UserSession | null'.
replaceFile('src/contexts/AuthContext.tsx', /role: \(session\.user as Record<string, unknown>\)\.role \|\| 'user',/g, "role: ((session.user as Record<string, unknown>).role as 'user' | 'admin') || 'user',");
replaceFile('src/contexts/AuthContext.tsx', /roleTitle: \(session\.user as Record<string, unknown>\)\.role === 'admin' \? 'Administrador Master' : 'Executivo Comercial B2B',/g, "roleTitle: ((session.user as Record<string, unknown>).role as string) === 'admin' ? 'Administrador Master' : 'Executivo Comercial B2B',");


// Fix src/features/intelligence/agents/bdr.agent.ts
replaceFile('src/features/intelligence/agents/bdr.agent.ts', /m: \{ role: string; content: string \}/g, "m: any");
replaceFile('src/features/intelligence/agents/bdr.agent.ts', /messages: \{ role: string; content: string \}\[\]/g, "messages: any[]");

// Fix src/features/intelligence/agents/crm.agent.ts
replaceFile('src/features/intelligence/agents/crm.agent.ts', /m: \{ role: string; content: string \}/g, "m: any");
replaceFile('src/features/intelligence/agents/crm.agent.ts', /messages: \{ role: string; content: string \}\[\]/g, "messages: any[]");

// Fix src/features/intelligence/agents/sdr.agent.ts
replaceFile('src/features/intelligence/agents/sdr.agent.ts', /lastMessage as Record<string, unknown>/g, "lastMessage as any");
replaceFile('src/features/intelligence/agents/sdr.agent.ts', /m: \{ role: string; content: string \}/g, "m: any");
replaceFile('src/features/intelligence/agents/sdr.agent.ts', /messages: \{ role: string; content: string \}\[\]/g, "messages: any[]");

// Fix src/features/intelligence/components/SwarmDashboard.tsx
replaceFile('src/features/intelligence/components/SwarmDashboard.tsx', /agent: agent as 'sdr' | 'bdr' | 'supervisor',/g, "agent: agent as any,");

// Fix auth modal navigate
replaceFile('src/features/auth/components/GoogleLoginModal.tsx', /\/\/ eslint-disable-next-line @typescript-eslint\/no-unused-vars\nconst navigate = useNavigate\(\);/g, "const navigate = useNavigate();");
