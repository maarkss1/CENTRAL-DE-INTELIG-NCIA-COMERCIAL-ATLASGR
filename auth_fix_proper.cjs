const fs = require('fs');

function replaceFile(filePath, search, replace) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.split(search).join(replace);
    fs.writeFileSync(filePath, content);
}

// 1. AuthContext: 'session' is declared but never read.
replaceFile('src/contexts/AuthContext.tsx', 'const { data: session, isPending, error } = useSession();', 'const { isPending, error } = useSession();');

// 2. SelectionScreen: 'selectedBrand' is assigned a value but never used
// We should check if useState can be removed completely.
replaceFile('src/features/auth/components/SelectionScreen.tsx', 'const [selectedBrand, setSelectedBrand] = useState<string | null>(null);', '');
replaceFile('src/features/auth/components/SelectionScreen.tsx', 'import { useState } from "react";', ''); // Also remove useState if unused

// 3. GoogleLoginModal
replaceFile('src/features/auth/components/GoogleLoginModal.tsx', 'import { useAuth } from "../../hooks/useAuth";', '');
replaceFile('src/features/auth/components/GoogleLoginModal.tsx', 'import { useNavigate } from "react-router-dom";', '');
replaceFile('src/features/auth/components/GoogleLoginModal.tsx', 'const navigate = useNavigate();', '');
