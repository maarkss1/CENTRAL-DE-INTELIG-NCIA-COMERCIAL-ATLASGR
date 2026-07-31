const fs = require('fs');

function removeLineWith(filePath, str) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const newLines = lines.filter(l => !l.includes(str));
    fs.writeFileSync(filePath, newLines.join('\n'));
}

removeLineWith('src/contexts/AuthContext.tsx', 'const { error } = useSession();');
removeLineWith('src/features/auth/components/GoogleLoginModal.tsx', 'import { useAuth }');
removeLineWith('src/features/auth/components/GoogleLoginModal.tsx', 'import { useNavigate }');
