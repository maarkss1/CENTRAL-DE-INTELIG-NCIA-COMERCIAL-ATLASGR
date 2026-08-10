import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigationBus } from '../lib/navigationBus';
import type { TabType } from '../components/layout/tabMeta';

/**
 * Único ponto de montagem que liga `navigationBus` (destino/navegação, dono: Agente 02) à
 * navegação real do app (react-router). Chamado uma vez em MainLayout, que já está dentro do
 * Router (usa `useLocation`) e envolve toda rota autenticada (`/app/*`, ver App.tsx).
 *
 * `dashboard` mapeia para `/app` (rota index); qualquer outro `TabType` mapeia para `/app/<tab>`,
 * o mesmo padrão que toda `<Route path="...">` em App.tsx já usa — uma única fonte de verdade
 * (`TabType`), não uma tabela de rotas duplicada.
 */
export function useNavigationBusBridge(): void {
    const navigate = useNavigate();

    useEffect(() => {
        const navigator = (tab: TabType) => {
            navigate(tab === 'dashboard' ? '/app' : `/app/${tab}`);
        };
        navigationBus.registerNavigator(navigator);
        return () => navigationBus.registerNavigator(null);
    }, [navigate]);
}
